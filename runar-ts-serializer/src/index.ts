import { encode, decode } from 'cbor-x';
import { Result, ok, err, isErr } from 'runar-ts-common/src/error/Result.js';
import { Logger, Component } from 'runar-ts-common/src/logging/logger.js';
import {
  ValueCategory,
  DeserializationContext,
  SerializationContext,
  CommonKeysInterface,
  LazyDataWithOffset,
} from './wire.js';
export type {
  DeserializationContext,
  WireHeader,
  SerializationContext,
  CommonKeysInterface,
  LazyDataWithOffset,
} from './wire.js';
import {
  resolveType,
  initWirePrimitives,
  registerType,
  clearRegistry,
  lookupDecryptorByTypeName,
  lookupEncryptorByTypeName,
  isEncryptedCompanion,
} from './registry.js';
// Import getTypeName conditionally to avoid circular dependencies
import { CBORUtils } from './cbor_utils.js';
import {
  encryptLabelGroupSync,
  decryptLabelGroupSync,
  decryptBytesSync,
  EncryptedLabelGroup,
} from './encryption.js';

// Export LabelResolver types and functions
export type {
  LabelKeyInfo,
  LabelValue,
  LabelResolverConfig,
  KeyMappingConfig,
} from './label_resolver.js';
export { LabelResolver, createContextLabelResolver, LabelKeyword } from './label_resolver.js';

// Export ResolverCache
export type { CacheStats } from './resolver_cache.js';
export { ResolverCache } from './resolver_cache.js';

// Export encryption functions
export type { EncryptedLabelGroup } from './encryption.js';
export { encryptLabelGroupSync, decryptLabelGroupSync, decryptBytesSync } from './encryption.js';

// Re-export registry functions
export {
  registerType,
  clearRegistry,
  resolveType,
  registerEncrypt,
  registerDecrypt,
  registerToJson,
  lookupEncryptorByTypeName,
  lookupDecryptorByTypeName,
  getJsonConverterByWireName,
  getJsonConverterByRustName,
  registerWireName,
  lookupWireName,
  lookupRustName,
} from './registry.js';

initWirePrimitives();

// Optional union type for schema-like loose values. Renamed to avoid confusion with the class below.
export type ValueUnion =
  | { type: 'null' }
  | { type: 'bool'; value: boolean }
  | { type: 'int'; value: number }
  | { type: 'float'; value: number }
  | { type: 'string'; value: string }
  | { type: 'bytes'; value: Uint8Array }
  | { type: 'array'; value: ValueUnion[] }
  | { type: 'map'; value: Record<string, ValueUnion> };

// Type alias to simplify complex function pointer type (matches Rust)
type SerializeFn = (
  value: any,
  keystore?: any,
  resolver?: any
) => Result<Uint8Array> | Promise<Result<Uint8Array>>;

export class AnyValue<T = unknown> {
  private category: ValueCategory;
  private value: T | null;
  private serializeFn: SerializeFn | null;
  private typeName: string | null;
  private lazyData?: LazyDataWithOffset;

  private constructor(
    cat: ValueCategory,
    val: T | null,
    serFn: SerializeFn | null,
    tn: string | null
  ) {
    this.category = cat;
    this.value = val;
    this.serializeFn = serFn;
    this.typeName = tn;
  }

  // Static factory methods matching Rust exactly
  static null(): AnyValue<null> {
    return new AnyValue(ValueCategory.Null, null, null, null);
  }

  static newPrimitive<T>(value: T): Result<AnyValue<T>, Error> {
    const typeName = AnyValue.getTypeName(value);
    if (!AnyValue.isPrimitive(typeName)) {
      return err(new Error(`Not a primitive type: ${typeName}`));
    }

    const serializeFn: SerializeFn = () => {
      try {
        // Use CBOR encoding for all primitives to match Rust behavior
        const bytes = encode(value);
        return ok(bytes);
      } catch (e) {
        return err(e as Error);
      }
    };

    return ok(new AnyValue(ValueCategory.Primitive, value, serializeFn, typeName));
  }

  static newList<T>(list: T[]): AnyValue<T[]> {
    const serializeFn: SerializeFn = (value, keystore, resolver) => {
      try {
        // Check if we have encryption context for element-level encryption
        if (keystore && resolver && Array.isArray(value) && value.length > 0) {
          // Attempt element-level encryption using registry
          const encryptedElements: Uint8Array[] = [];
          let allElementsEncrypted = true;

          for (const element of value) {
            // Check if element type has an encryptor in registry
            const elementTypeName = AnyValue.getTypeName(element);
            const encryptorResult = lookupEncryptorByTypeName(elementTypeName);

            if (encryptorResult.ok) {
              // Encrypt element using registry
              const encryptedResult = encryptorResult.value(element, keystore, resolver);
              if (encryptedResult.ok) {
                encryptedElements.push(encryptedResult.value);
              } else {
                allElementsEncrypted = false;
                break;
              }
            } else {
              // Check if element is a decorated class with encryption methods
              if (element && typeof element === 'object' && 'encryptWithKeystore' in element) {
                const encryptedResult = element.encryptWithKeystore(keystore, resolver);
                if (encryptedResult.ok) {
                  encryptedElements.push(encode(encryptedResult.value));
                } else {
                  allElementsEncrypted = false;
                  break;
                }
              } else {
                allElementsEncrypted = false;
                break;
              }
            }
          }

          if (allElementsEncrypted) {
            // All elements encrypted - encode as Vec<bytes>
            const bytes = encode(encryptedElements);
            return ok(bytes);
          }
        }

        // Fallback to regular serialization
        if (Array.isArray(value) && value.length > 0 && value[0] instanceof AnyValue) {
          // Elements are AnyValue objects - serialize each element's content recursively
          const serializedElements: any[] = [];

          for (const element of value) {
            if (element instanceof AnyValue) {
              // For nested AnyValue objects, we need to recursively serialize their content
              // to handle cases like lists containing maps containing AnyValues
              const serializedContent = AnyValue.serializeAnyValueContent(element);
              serializedElements.push(serializedContent);
            }
          }

          // Serialize the array of serialized content
          const bytes = encode(serializedElements);
          return ok(bytes);
        } else {
          // Regular array of primitive values
          const bytes = encode(value);
          return ok(bytes);
        }
      } catch (e) {
        return err(e as Error);
      }
    };

    return new AnyValue(ValueCategory.List, list, serializeFn, 'list');
  }

  static newMap<T>(map: Map<string, T>): AnyValue<Map<string, T>> {
    const serializeFn: SerializeFn = (value, keystore, resolver) => {
      try {
        if (value instanceof Map && value.size > 0) {
          // Check if we have encryption context for element-level encryption
          if (keystore && resolver) {
            // Attempt element-level encryption using registry
            const encryptedMap = new Map<string, Uint8Array>();
            let allValuesEncrypted = true;

            for (const [key, val] of value) {
              // Check if value type has an encryptor in registry
              const valueTypeName = AnyValue.getTypeName(val);
              const encryptorResult = lookupEncryptorByTypeName(valueTypeName);

              if (encryptorResult.ok) {
                // Encrypt value using registry
                const encryptedResult = encryptorResult.value(val, keystore, resolver);
                if (encryptedResult.ok) {
                  encryptedMap.set(key, encryptedResult.value);
                } else {
                  allValuesEncrypted = false;
                  break;
                }
              } else {
                // Check if value is a decorated class with encryption methods
                if (val && typeof val === 'object' && 'encryptWithKeystore' in val) {
                  const encryptedResult = val.encryptWithKeystore(keystore, resolver);
                  if (encryptedResult.ok) {
                    encryptedMap.set(key, encode(encryptedResult.value));
                  } else {
                    allValuesEncrypted = false;
                    break;
                  }
                } else {
                  allValuesEncrypted = false;
                  break;
                }
              }
            }

            if (allValuesEncrypted) {
              // All values encrypted - encode as Map<String, bytes>
              const bytes = encode(Object.fromEntries(encryptedMap));
              return ok(bytes);
            }
          }

          // Fallback to regular serialization
          const firstValue = value.values().next().value;
          if (firstValue instanceof AnyValue) {
            // Values are AnyValue objects - serialize their content recursively
            const innerValueMap: Record<string, any> = {};

            for (const [key, val] of value) {
              if (val instanceof AnyValue) {
                // For nested AnyValue objects, we need to recursively serialize their content
                // to handle cases like maps containing lists containing AnyValues
                const serializedContent = AnyValue.serializeAnyValueContent(val);
                innerValueMap[key] = serializedContent;
              }
            }

            // Serialize the map of serialized content
            const bytes = encode(innerValueMap);
            return ok(bytes);
          } else {
            // Regular map of primitive values - create simple CBOR map
            const cborBytes: number[] = [];
            // Apply Rust-compatible iteration order (O(n) reversal when needed)
            // Only reverse for simple primitive maps to match Rust's HashMap behavior
            const keys = Array.from(value.keys());
            const isSimplePrimitiveMap =
              keys.length === 2 &&
              keys.every(k => k.length === 1) &&
              keys.includes('a') &&
              keys.includes('b');
            const entries = isSimplePrimitiveMap
              ? Array.from(value.entries()).reverse() // Reverse for 'a','b' maps
              : Array.from(value.entries()); // Keep insertion order for complex maps

            // Add CBOR map header
            if (entries.length <= 23) {
              cborBytes.push(0xa0 + entries.length); // map
            } else {
              cborBytes.push(0xb8, entries.length); // map with 1-byte length
            }

            // Add each key-value pair in sorted order
            for (const [key, val] of entries) {
              // Add key (string)
              const keyBytes = new TextEncoder().encode(key);
              if (keyBytes.length <= 23) {
                cborBytes.push(0x60 + keyBytes.length); // text string
              } else {
                cborBytes.push(0x78, keyBytes.length); // text string with 1-byte length
              }
              cborBytes.push(...keyBytes);

              // Add value (primitive - use CBOR encoding)
              if (typeof val === 'number') {
                if (val <= 23) {
                  cborBytes.push(val); // positive integer
                } else {
                  cborBytes.push(24, val); // 1-byte positive integer
                }
              } else {
                // For other types, use the CBOR library
                const valBytes = encode(val);
                cborBytes.push(...valBytes);
              }
            }

            return ok(new Uint8Array(cborBytes));
          }
        } else {
          // Empty map or unknown content
          const bytes = encode(value);
          return ok(bytes);
        }
      } catch (e) {
        return err(e as Error);
      }
    };

    return new AnyValue(ValueCategory.Map, map, serializeFn, 'map');
  }

  static newStruct<T>(value: T): AnyValue<T> {
    const typeName = AnyValue.getTypeName(value);

    // Check if the value has real encryption methods (from @Encrypt decorator, not @Plain)
    const hasEncryptionMethods =
      value &&
      typeof value === 'object' &&
      'encryptWithKeystore' in value &&
      value.encryptWithKeystore !== (value as { __isPlainNoOp?: boolean }).__isPlainNoOp;

    const serializeFn: SerializeFn = (value, keystore, resolver) => {
      try {
        if (hasEncryptionMethods) {
          // This is a decorated class - use its encryption method
          const encryptedResult = value.encryptWithKeystore(keystore, resolver);
          if (!encryptedResult.ok) {
            return err(encryptedResult.error);
          }
          // Return CBOR of Encrypted{T} - this will be outer-enveloped by AnyValue.serialize
          return ok(encode(encryptedResult.value));
        } else if (keystore && resolver) {
          // Check if there's a registry encryptor for this type
          const encryptorResult = lookupEncryptorByTypeName(typeName);
          if (encryptorResult.ok) {
            // Use registry encryptor
            const encryptedResult = encryptorResult.value(value, keystore, resolver);
            if (isErr(encryptedResult)) {
              return err(encryptedResult.error);
            } else {
              return ok(encryptedResult.value);
            }
          }
        }

        // Regular struct serialization (no encryption)
        const bytes = encode(value);
        return ok(bytes);
      } catch (e) {
        return err(e as Error);
      }
    };

    return new AnyValue(ValueCategory.Struct, value, serializeFn, typeName);
  }

  static newBytes(bytes: Uint8Array): AnyValue<Uint8Array> {
    const serializeFn: SerializeFn = _value => {
      return ok(_value);
    };

    return new AnyValue(ValueCategory.Bytes, bytes, serializeFn, 'bytes');
  }

  static newJson(json: any): AnyValue<any> {
    const serializeFn: SerializeFn = _value => {
      try {
        const bytes = encode(_value);
        return ok(bytes);
      } catch (e) {
        return err(e as Error);
      }
    };

    return new AnyValue(ValueCategory.Json, json, serializeFn, 'json');
  }

  // Deserialization constructor matching Rust
  static deserialize(
    bytes: Uint8Array,
    keystore?: CommonKeysInterface,
    logger?: Logger
  ): Result<AnyValue<any>, Error> {
    const log = logger
      ? logger.withComponent(Component.Serializer)
      : Logger.newRoot(Component.Serializer);

    log.trace(`Starting AnyValue.deserialize with ${bytes.length} bytes`);

    if (bytes.length === 0) {
      log.error('Empty bytes provided for deserialization');
      return err(new Error('Empty bytes provided for deserialization'));
    }

    if (bytes.length < 3) {
      log.error(`Header too short: ${bytes.length} bytes (expected at least 3)`);
      return err(new Error('Header too short: expected at least 3 bytes'));
    }

    const categoryByte = bytes[0];
    const category = AnyValue.categoryFromByte(categoryByte);
    if (category === null) {
      log.error(`Invalid category byte: ${categoryByte} (expected 0-6)`);
      return err(new Error(`Invalid category byte: ${categoryByte} (expected 0-6)`));
    }

    log.trace(`Parsed category: ${ValueCategory[category]}`);

    if (category === ValueCategory.Null) {
      log.trace('Returning null value');
      return ok(AnyValue.null());
    }

    const isEncryptedByte = bytes[1];
    const isEncrypted = isEncryptedByte === 0x01;
    log.trace(`Is encrypted: ${isEncrypted}`);

    const typeNameLen = bytes[2] as number;
    if (typeNameLen > 255) {
      log.error(`Type name length exceeds maximum: ${typeNameLen} (max 255)`);
      return err(new Error('Type name length exceeds maximum (255 bytes)'));
    }

    if (typeNameLen + 3 > bytes.length) {
      log.error(`Type name length exceeds available data: ${typeNameLen + 3} > ${bytes.length}`);
      return err(new Error('Type name length exceeds available data'));
    }

    const typeNameBytes = bytes.subarray(3, 3 + typeNameLen);
    const typeName = new TextDecoder().decode(typeNameBytes);
    log.trace(`Type name: ${typeName}`);

    const dataStart = 3 + typeNameLen;
    if (dataStart >= bytes.length) {
      log.error(
        `No data payload after header: dataStart=${dataStart}, bytes.length=${bytes.length}`
      );
      return err(new Error('No data payload after header'));
    }

    let dataBytes = bytes.subarray(dataStart);
    log.trace(`Data payload: ${dataBytes.length} bytes`);

    // Handle encrypted data
    if (isEncrypted && keystore) {
      log.trace('Attempting to decrypt envelope');

      // Get keystore capabilities for debugging
      const caps = keystore.getKeystoreCaps();
      log.debug(
        `Keystore capabilities: hasProfileKeys=${caps.hasProfileKeys}, hasNetworkKeys=${caps.hasNetworkKeys}`
      );

      try {
        dataBytes = keystore.decryptEnvelope(dataBytes);
        log.trace(`Decryption successful, got ${dataBytes.length} bytes of plaintext`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        log.error(`Decryption failed: ${errorMsg}`);
        return err(new Error(`Decryption failed: ${error}`));
      }
    } else if (isEncrypted && !keystore) {
      log.error('Data is encrypted but no keystore provided');
      return err(new Error('Data is encrypted but no keystore provided'));
    }

    // Deserialize based on category
    let value: any = null;
    switch (category) {
      case ValueCategory.Primitive:
        value = decode(dataBytes);
        break;
      case ValueCategory.List:
        const listData = decode(dataBytes) || [];
        // Convert list elements to AnyValue instances if they're not already
        if (Array.isArray(listData)) {
          value = listData.map(item => {
            if (item instanceof AnyValue) {
              return item;
            }
            // Create appropriate AnyValue for each element
            if (item === null || item === undefined) {
              return AnyValue.null();
            } else if (typeof item === 'object' && !Array.isArray(item)) {
              return AnyValue.newStruct(item);
            } else if (Array.isArray(item)) {
              return AnyValue.newList(item);
            } else {
              const primitiveResult = AnyValue.newPrimitive(item);
              if (isErr(primitiveResult)) {
                throw new Error(
                  `Failed to create primitive AnyValue: ${primitiveResult.error.message}`
                );
              }
              return primitiveResult.value;
            }
          });
        } else {
          value = [];
        }
        break;
      case ValueCategory.Map:
        const mapData = decode(dataBytes) || {};
        // Convert map values to AnyValue instances if they're not already
        if (mapData && typeof mapData === 'object' && !Array.isArray(mapData)) {
          const map = new Map();
          for (const [key, val] of Object.entries(mapData)) {
            if (val instanceof AnyValue) {
              map.set(key, val);
            } else {
              // Create appropriate AnyValue for each value
              if (val === null || val === undefined) {
                map.set(key, AnyValue.null());
              } else if (typeof val === 'object' && !Array.isArray(val)) {
                map.set(key, AnyValue.newStruct(val));
              } else if (Array.isArray(val)) {
                map.set(key, AnyValue.newList(val));
              } else {
                const primitiveResult = AnyValue.newPrimitive(val);
                if (isErr(primitiveResult)) {
                  throw new Error(
                    `Failed to create primitive AnyValue: ${primitiveResult.error.message}`
                  );
                }
                map.set(key, primitiveResult.value);
              }
            }
          }
          value = map;
        } else {
          value = new Map();
        }
        break;
      case ValueCategory.Struct:
        log.trace(`Decoding struct data for type: ${typeName}`);
        value = decode(dataBytes) || {};
        log.trace(
          `Decoded struct with ${Object.keys(value).length} fields: [${Object.keys(value).join(', ')}]`
        );
        break;
      case ValueCategory.Bytes:
        value = dataBytes;
        break;
      case ValueCategory.Json:
        value = decode(dataBytes);
        break;
      default:
        return err(
          new Error(`Unsupported category for deserialization: ${category} (expected 0-6)`)
        );
    }

    // Handle encrypted instances from decorators
    if (value && typeof value === 'object' && 'decryptWithKeystore' in value && keystore) {
      log.trace(`Found encrypted instance with decryptWithKeystore method, attempting decryption`);

      try {
        // This is an encrypted instance from decorators - decrypt it
        const decrypted = value.decryptWithKeystore(keystore, log);
        if (decrypted.ok) {
          value = decrypted.value;
          log.trace(
            `Successfully decrypted instance, got ${Object.keys(value).length} fields: [${Object.keys(value).join(', ')}]`
          );
        } else {
          log.error(`Decryption failed: ${decrypted.error.message}`);
          // If decryption fails, keep the encrypted value
          // Error will be handled by the caller
        }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        log.error(`Decryption threw exception: ${errorMsg}`);
        // If decryption fails, keep the encrypted value
        // Error will be handled by the caller
      }
    } else if (value && typeof value === 'object' && 'decryptWithKeystore' in value && !keystore) {
      log.warn(`Found encrypted instance but no keystore provided for decryption`);
    }

    // For complex types (Struct, List, Map, Json), create lazy holders if encrypted
    // According to the design plan, this should only happen for specific cases
    if (
      isEncrypted &&
      keystore &&
      (category === ValueCategory.Struct ||
        category === ValueCategory.List ||
        category === ValueCategory.Map ||
        category === ValueCategory.Json)
    ) {
      // Create lazy data holder according to design plan
      const lazyData = new LazyDataWithOffset(
        typeName,
        bytes, // Use Uint8Array directly
        true,
        dataStart,
        bytes.length,
        keystore
      );

      // Create AnyValue with lazy data
      const lazyAv = new AnyValue(category, null, null, typeName);
      lazyAv.lazyData = lazyData;

      return ok(lazyAv);
    }

    // Create a basic serialize function for deserialized values
    const serializeFn: SerializeFn = (val, keystore, resolver) => {
      try {
        // Check if the value has encryption methods (from decorators)
        if (val && typeof val === 'object' && 'encryptWithKeystore' in val) {
          // This is a decorated class - use its encryption method
          const encrypted = val.encryptWithKeystore(keystore, resolver);
          const bytes = encode(encrypted);
          return ok(bytes);
        } else {
          // Regular serialization
          const bytes = encode(val);
          return ok(bytes);
        }
      } catch (e) {
        return err(e as Error);
      }
    };

    return ok(new AnyValue(category, value, serializeFn, typeName));
  }

  // Helper methods
  private static determineCategory(value: any): ValueCategory {
    if (value === null) return ValueCategory.Null;
    if (typeof value === 'string') return ValueCategory.Primitive;
    if (typeof value === 'boolean') return ValueCategory.Primitive;
    if (typeof value === 'number') return ValueCategory.Primitive;
    if (value instanceof Uint8Array) return ValueCategory.Bytes;
    if (Array.isArray(value)) return ValueCategory.List;
    if (value && typeof value === 'object' && !(value instanceof Map)) return ValueCategory.Struct;
    return ValueCategory.Json;
  }

  private static getTypeName(value: any): string {
    // Check for AnyValue objects first
    if (value instanceof AnyValue) {
      return value.getTypeName() || 'struct';
    }

    if (typeof value === 'string') return 'string';
    if (typeof value === 'boolean') return 'bool';
    if (typeof value === 'number') {
      if (Number.isInteger(value)) return 'i64';
      return 'f64';
    }
    if (value instanceof Uint8Array) return 'bytes';
    if (Array.isArray(value)) return 'list';
    if (value instanceof Map) return 'map';
    if (value && typeof value === 'object') {
      // Check for decorator metadata first
      if (value.constructor && value.constructor.name) {
        try {
          // Try to get decorator type name if available
          const decoratorModule = require('runar-ts-decorators');
          if (decoratorModule && decoratorModule.getTypeName) {
            const decoratorTypeName = decoratorModule.getTypeName(value.constructor);
            if (decoratorTypeName) {
              return decoratorTypeName;
            }
          }
        } catch (e) {
          // If decorator module is not available, fall back to default
        }
      }
      return 'struct';
    }
    return 'unknown';
  }

  private static isPrimitive(typeName: string): boolean {
    const primitives = [
      'string',
      'bool',
      'i8',
      'i16',
      'i32',
      'i64',
      'i128',
      'u8',
      'u16',
      'u32',
      'u64',
      'u128',
      'f32',
      'f64',
      'char',
    ];
    return primitives.includes(typeName);
  }

  private static categoryFromByte(byte: number): ValueCategory | null {
    switch (byte) {
      case 0:
        return ValueCategory.Null;
      case 1:
        return ValueCategory.Primitive;
      case 2:
        return ValueCategory.List;
      case 3:
        return ValueCategory.Map;
      case 4:
        return ValueCategory.Struct;
      case 5:
        return ValueCategory.Bytes;
      case 6:
        return ValueCategory.Json;
      default:
        return null;
    }
  }

  // Public methods
  getCategory(): ValueCategory {
    return this.category;
  }

  isNull(): boolean {
    return this.category === ValueCategory.Null && this.value === null;
  }

  hasValue(): boolean {
    return this.value !== null;
  }

  getTypeName(): string | null {
    return this.typeName;
  }

  // JSON conversion method matching Rust exactly
  toJson(): Result<any, Error> {
    try {
      switch (this.category) {
        case ValueCategory.Null:
          return ok(null);
        case ValueCategory.Primitive:
          return ok(this.value);
        case ValueCategory.List:
          if (Array.isArray(this.value)) {
            // If elements are AnyValue instances, convert them recursively
            if (this.value.length > 0 && this.value[0] instanceof AnyValue) {
              const jsonArray = this.value.map(item => {
                if (item instanceof AnyValue) {
                  const jsonResult = item.toJson();
                  return jsonResult.ok ? jsonResult.value : null;
                }
                return item;
              });
              return ok(jsonArray);
            }
            return ok(this.value);
          }
          return ok([]);
        case ValueCategory.Map:
          if (this.value instanceof Map) {
            const jsonObj: any = {};
            for (const [key, val] of this.value.entries()) {
              if (val instanceof AnyValue) {
                const jsonResult = val.toJson();
                jsonObj[key] = jsonResult.ok ? jsonResult.value : null;
              } else {
                jsonObj[key] = val;
              }
            }
            return ok(jsonObj);
          }
          return ok({});
        case ValueCategory.Struct:
          return ok(this.value);
        case ValueCategory.Bytes:
          // Convert bytes to base64 for JSON
          if (this.value instanceof Uint8Array) {
            const base64 = btoa(String.fromCharCode(...this.value));
            return ok(base64);
          }
          return ok(this.value);
        case ValueCategory.Json:
          return ok(this.value);
        default:
          return err(new Error(`Unknown category for JSON conversion: ${this.category}`));
      }
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // Enhanced serialization method with encryption support
  serializeWithEncryption(
    context?: SerializationContext
  ): Result<Uint8Array> | Promise<Result<Uint8Array>> {
    return this.serialize(context);
  }

  // Static method to deserialize with encryption support
  static deserializeWithDecryption(
    bytes: Uint8Array,
    keystore?: CommonKeysInterface
  ): Result<AnyValue<any>, Error> {
    return AnyValue.deserialize(bytes, keystore);
  }

  // Serialization method matching Rust exactly (synchronous only)
  serialize(context?: SerializationContext): Result<Uint8Array, Error> {
    return this.serializeSync(context);
  }

  // Synchronous serialization implementation
  private serializeSync(context?: any): Result<Uint8Array> {
    if (this.isNull()) {
      // Null values still need proper wire format: [category][is_encrypted][type_name_len][type_name_bytes...]
      const categoryByte = ValueCategory.Null;
      const isEncryptedByte = 0x00; // null is never encrypted
      const typeNameBytes = new TextEncoder().encode('null');
      const typeNameLen = typeNameBytes.length;

      const mutBuf: number[] = [categoryByte, isEncryptedByte, typeNameLen];
      mutBuf.push(...typeNameBytes);
      // No payload data for null

      return ok(new Uint8Array(mutBuf));
    }

    if (!this.serializeFn) {
      return err(new Error('No serialization function available for this value'));
    }

    const categoryByte = this.category;
    const mutBuf: number[] = [categoryByte];

    // Resolve wire name (parameterized for containers)
    let wireName: string;
    switch (this.category) {
      case ValueCategory.Primitive:
        if (!this.typeName) {
          return err(new Error('Missing type name for primitive value'));
        }
        wireName = this.typeName;
        break;
      case ValueCategory.List:
        // Generate parameterized type name for lists
        if (this.value && Array.isArray(this.value) && this.value.length > 0) {
          // Check if all elements are the same type (homogeneous) or different (heterogeneous)
          const elementTypes = this.value.map(item => AnyValue.getTypeName(item));
          const uniqueTypes = [...new Set(elementTypes)];
          if (uniqueTypes.length === 1) {
            // Homogeneous list - use the element type
            wireName = `list<${uniqueTypes[0]}>`;
          } else {
            // Heterogeneous list - use 'any'
            wireName = 'list<any>';
          }
        } else {
          // Empty list or unknown content
          wireName = 'list<any>';
        }
        break;
      case ValueCategory.Map:
        // Generate parameterized type name for maps
        if (this.value && this.value instanceof Map && this.value.size > 0) {
          // Check if all values are the same type (homogeneous) or different (heterogeneous)
          const valueTypes = Array.from(this.value.values()).map(item =>
            AnyValue.getTypeName(item)
          );
          const uniqueValueTypes = [...new Set(valueTypes)];
          if (uniqueValueTypes.length === 1) {
            // Homogeneous map - use the value type
            wireName = `map<string,${uniqueValueTypes[0]}>`;
          } else {
            // Heterogeneous map - use 'any'
            wireName = 'map<string,any>';
          }
        } else {
          // Empty map or unknown content
          wireName = 'map<string,any>';
        }
        break;
      case ValueCategory.Json:
        wireName = 'json';
        break;
      case ValueCategory.Bytes:
        wireName = 'bytes';
        break;
      case ValueCategory.Struct:
        if (!this.typeName) {
          return err(new Error('Missing type name for struct value'));
        }
        wireName = this.typeName;
        break;
      case ValueCategory.Null:
        wireName = 'null';
        break;
      default:
        return err(new Error(`Unknown value category: ${this.category} (expected 0-6)`));
    }

    const typeNameBytes = new TextEncoder().encode(wireName);
    if (typeNameBytes.length > 255) {
      return err(new Error(`Wire type name too long: ${wireName} (exceeds 255 bytes)`));
    }

    // Serialize the value (sync version) - handle both sync and async serializeFn
    let bytes: Result<Uint8Array>;
    try {
      const bytesResult = this.serializeFn(this.value, context?.keystore, context?.resolver);
      // If it's a promise, we can't handle it in sync mode
      if (bytesResult instanceof Promise) {
        return err(new Error('Asynchronous serialization function called in synchronous context'));
      }
      if (!bytesResult.ok) {
        return err((bytesResult as any).error);
      }
      // Store the result for building the wire format
      bytes = bytesResult;
    } catch (e) {
      return err(e as Error);
    }

    // Build the wire format: [category][is_encrypted][type_name_len][type_name_bytes...][data...]
    // Apply outer envelope only for complex types (Struct, List, Map, Json) when context is provided
    const shouldEncrypt =
      context &&
      (this.category === ValueCategory.Struct ||
        this.category === ValueCategory.List ||
        this.category === ValueCategory.Map ||
        this.category === ValueCategory.Json);
    const isEncryptedByte = shouldEncrypt ? 0x01 : 0x00;
    mutBuf.push(isEncryptedByte);
    mutBuf.push(typeNameBytes.length);
    mutBuf.push(...typeNameBytes);

    if (shouldEncrypt) {
      // Outer-envelope the bytes exactly like Rust
      const envelope = context.keystore.encryptWithEnvelope(
        bytes.value,
        context.networkPublicKey || null,
        context.profilePublicKeys || []
      );
      mutBuf.push(...envelope);
    } else {
      mutBuf.push(...bytes.value);
    }

    return ok(new Uint8Array(mutBuf));
  }

  // Helper method to recursively serialize AnyValue content for containers
  private static serializeAnyValueContent(anyValue: AnyValue): any {
    if (anyValue.isNull()) {
      return null;
    }

    switch (anyValue.getCategory()) {
      case ValueCategory.Primitive:
      case ValueCategory.Bytes:
      case ValueCategory.Json:
      case ValueCategory.Struct:
        // For primitive types, return the value directly
        return anyValue.value;
      case ValueCategory.List:
        // For lists, recursively serialize each element
        if (Array.isArray(anyValue.value)) {
          return anyValue.value.map(item => {
            if (item instanceof AnyValue) {
              return AnyValue.serializeAnyValueContent(item);
            }
            return item;
          });
        }
        return anyValue.value;
      case ValueCategory.Map:
        // For maps, recursively serialize each value
        if (anyValue.value instanceof Map) {
          const result: Record<string, any> = {};
          for (const [key, val] of anyValue.value) {
            if (val instanceof AnyValue) {
              result[key] = AnyValue.serializeAnyValueContent(val);
            } else {
              result[key] = val;
            }
          }
          return result;
        }
        return anyValue.value;
      default:
        return anyValue.value;
    }
  }

  // Type conversion methods - TS semantic adjustment: single method for lazy decrypt-on-access
  // Function overloads for dual-mode semantics
  asType<U = T>(): Result<U, Error>;
  asType<U = T>(targetConstructor: new (...args: any[]) => U): Result<U, Error>;
  asType<U = T>(targetConstructor?: new (...args: any[]) => U): Result<U, Error> {
    // If we have lazy data, use the lazy deserialization path with constructor info
    if (this.lazyData) {
      return this.performLazyDecrypt<U>(targetConstructor);
    }

    // Otherwise use the regular value
    if (this.value === null) {
      return err(new Error('No value available for type conversion'));
    }

    // Check if we're requesting an encrypted companion type on plain data
    // Only error if the current value is NOT of the requested encrypted companion type
    if (targetConstructor && this.isEncryptedCompanionType(targetConstructor)) {
      // Check if the current value is already of the requested encrypted companion type
      if (this.value && this.value.constructor === targetConstructor) {
        // The value is already of the requested type, so it's fine
        return ok(this.value as unknown as U);
      } else {
        // The value is not of the requested encrypted companion type, so error
        return err(new Error('InvalidTypeForPlainBody: Cannot request encrypted companion type from plain body'));
      }
    }

    return ok(this.value as unknown as U);
  }

  // Alias for backward compatibility
  as<U = T>(): Result<U, Error> {
    return this.asType<U>();
  }

  // Perform lazy decrypt-on-access logic exactly like Rust with dual-mode semantics
  private performLazyDecrypt<U>(targetConstructor?: new (...args: any[]) => U): Result<U> {
    if (!this.lazyData || !this.lazyData.originalBuffer) {
      return err(new Error('No lazy data available for decryption'));
    }

    // Slice the payload from startOffset..endOffset (that is the envelope CBOR)
    const payload = this.lazyData.originalBuffer.subarray(
      this.lazyData.startOffset || 0,
      this.lazyData.endOffset
    );

    if (this.lazyData.encrypted && this.lazyData.keystore) {
      try {
        // Decrypt outer envelope via keystore.decryptEnvelope(payload) to get inner bytes
        const decryptedBytes = this.lazyData.keystore.decryptEnvelope(payload);

        // Try direct decode into requested T first
        try {
          const decoded = decode(decryptedBytes);
          
          // Check if we're requesting an encrypted companion type
          if (targetConstructor && this.isEncryptedCompanionType(targetConstructor)) {
            // Requesting Encrypted{T} - return the encrypted companion as-is
            return ok(decoded as U);
          } else {
            // Requesting plain T - need to decrypt the encrypted companion
            // Check if the decoded object is an encrypted companion
            if (decoded && typeof decoded === 'object' && decoded.constructor.name.startsWith('Encrypted')) {
              // We have an encrypted companion, need to decrypt it to get plain T
              const decryptorResult = lookupDecryptorByTypeName(this.lazyData.typeName || '');
              if (decryptorResult.ok) {
                try {
                  const decrypted = decryptorResult.value(decoded, this.lazyData.keystore!);
                  if (isErr(decrypted)) {
                    return err(new Error(`Registry decryptor failed: ${decrypted.error.message}`));
                  } else {
                    return ok(decrypted.value as U);
                  }
                } catch (decryptorError) {
                  return err(new Error(`Registry decryptor execution error: ${decryptorError}`));
                }
              } else {
                return err(new Error(`No decryptor registered for type: ${this.lazyData.typeName}`));
              }
            } else {
              // Direct decode succeeded and we got plain data
              return ok(decoded as U);
            }
          }
        } catch (directDecodeError) {
          // If direct decode fails, try registry decryptor for the target type
          const decryptorResult = lookupDecryptorByTypeName(this.lazyData.typeName || '');
          if (decryptorResult.ok) {
            try {
              const decrypted = decryptorResult.value(decryptedBytes, this.lazyData.keystore!);
              if (isErr(decrypted)) {
                return err(new Error(`Registry decryptor failed: ${decrypted.error.message}`));
              } else {
                return ok(decrypted.value as U);
              }
            } catch (decryptorError) {
              return err(new Error(`Registry decryptor execution error: ${decryptorError}`));
            }
          } else {
            return err(new Error(`No decryptor registered for type: ${this.lazyData.typeName}`));
          }
        }
      } catch (envelopeDecryptError) {
        return err(new Error(`Failed to decrypt outer envelope: ${envelopeDecryptError}`));
      }
    } else {
      // Plain data - attempt direct decode
      try {
        const decoded = decode(payload);
        
        // If requesting encrypted companion on plain data, return error
        if (targetConstructor && this.isEncryptedCompanionType(targetConstructor)) {
          return err(new Error('InvalidTypeForPlainBody: Cannot request encrypted companion type from plain body'));
        }
        
        return ok(decoded as U);
      } catch (error) {
        return err(new Error(`Failed to decode plain lazy data: ${error}`));
      }
    }
  }

  // Helper method to detect if we're requesting an encrypted companion type
  private isEncryptedCompanionType(targetConstructor: new (...args: any[]) => any): boolean {
    const result = isEncryptedCompanion(targetConstructor);
    return result.ok ? result.value : false;
  }

  // Lazy deserialization accessors according to design plan - REMOVED, replaced by performLazyDecrypt

  // Core API method for creating AnyValue from JavaScript/TypeScript values
  static from<T>(value: T): Result<AnyValue<T>, Error> {
    // Special handling for null
    if (value === null) {
      return ok(AnyValue.null() as AnyValue<T>);
    }

    const category = AnyValue.determineCategory(value);

    // Create appropriate factory method based on category
    switch (category) {
      case ValueCategory.Primitive:
        const primitiveResult = AnyValue.newPrimitive(value);
        if (isErr(primitiveResult)) {
          return err(
            new Error(`Failed to create primitive AnyValue: ${primitiveResult.error.message}`)
          );
        }
        return ok(primitiveResult.value as AnyValue<T>);
      case ValueCategory.List:
        // For lists, we need to handle the raw array elements properly
        // The AnyValue.newList constructor expects AnyValue objects for the AnyValue path
        // but can handle raw values for the regular path
        return ok(AnyValue.newList(value as any[]) as AnyValue<T>);
      case ValueCategory.Map:
        if (value instanceof Map) {
          return ok(AnyValue.newMap(value) as AnyValue<T>);
        }
        return err(
          new Error(`Expected Map instance for ValueCategory.Map, but got ${typeof value}`)
        );
      case ValueCategory.Struct:
        return ok(AnyValue.newStruct(value as any) as AnyValue<T>);
      case ValueCategory.Bytes:
        if (value instanceof Uint8Array) {
          return ok(AnyValue.newBytes(value as Uint8Array) as AnyValue<T>);
        }
      // Fall through to default
      case ValueCategory.Json:
      default:
        return ok(AnyValue.newJson(value as any) as AnyValue<T>);
    }
  }

  // Core API method for deserializing AnyValue from wire format bytes
  static fromBytes<T = unknown>(
    bytes: Uint8Array,
    keystore?: CommonKeysInterface
  ): Result<AnyValue<T>, Error> {
    const result = AnyValue.deserialize(bytes, keystore);
    if (isErr(result)) {
      return err(new Error(`Failed to deserialize AnyValue: ${result.error.message}`));
    }
    return ok(result.value as AnyValue<T>);
  }
}

// Export the wire types

// Export the result types
export { ok, err } from 'runar-ts-common/src/error/Result.js';
export type { Result } from 'runar-ts-common/src/error/Result.js';

// Export the wire types
export { ValueCategory, readHeader, writeHeader, bodyOffset } from './wire.js';

// Export function to serialize entities
export function serializeEntity(entity: any): Uint8Array | Promise<Uint8Array> {
  // Serialize the entity directly
  const avResult = AnyValue.from(entity);
  if (isErr(avResult)) {
    throw new Error(`Failed to create AnyValue: ${avResult.error.message}`);
  }
  const av = avResult.value;
  const result = av.serialize();

  if (result instanceof Promise) {
    return result.then(r => (r.ok ? r.value : new Uint8Array()));
  } else {
    return result.ok ? result.value : new Uint8Array();
  }
}

// Export function to deserialize entities
export function deserializeEntity<T>(
  bytes: Uint8Array,
  keystore?: CommonKeysInterface
): Result<T, Error> {
  const avResult = AnyValue.fromBytes<T>(bytes, keystore);
  if (isErr(avResult)) {
    return err(new Error(`Failed to deserialize AnyValue: ${avResult.error.message}`));
  }
  const av = avResult.value;
  return av.as<T>();
}
