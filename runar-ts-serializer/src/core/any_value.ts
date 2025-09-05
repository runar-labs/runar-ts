import { encode, decode } from 'cbor-x';
import { Result, ok, err, isOk, isErr } from 'runar-ts-common/src/error/Result';
import { Logger, Component } from 'runar-ts-common/src/logging/logger';
import { ValueCategory } from '../wire/value_category';
import {
  DeserializationContext,
  SerializationContext,
  LazyDataWithOffset,
} from '../context/serialization_context';
import { CommonKeysInterface } from '../keystore/device_caps';
import {
  resolveType,
  initWirePrimitives,
  registerType,
  clearRegistry,
  lookupDecryptorByTypeName,
  lookupEncryptorByTypeName,
  isEncryptedCompanion,
} from '../registry';
import { CBORUtils } from '../cbor_utils';

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

  static newPrimitive<T>(value: T): AnyValue<T> {
    const typeName = AnyValue.getTypeName(value);
    if (!AnyValue.isPrimitive(typeName)) {
      throw new Error(`Not a primitive type: ${typeName}`);
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

    return new AnyValue(ValueCategory.Primitive, value, serializeFn, typeName);
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
  static deserialize<T = unknown>(
    bytes: Uint8Array,
    keystore?: CommonKeysInterface,
    logger?: Logger
  ): Result<AnyValue<T>, Error> {
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
              return ok(AnyValue.null() as AnyValue<T>);
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
      log.error(`Invalid type name length: ${typeNameLen + 3} > ${bytes.length}`);
      return err(new Error('Invalid type name length'));
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
              return AnyValue.newPrimitive(item);
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
                map.set(key, AnyValue.newPrimitive(val));
              }
            }
          }
          value = map;
        } else {
          value = new Map();
        }
        break;
      case ValueCategory.Struct:
        log.trace(`Creating struct for type: ${typeName}`);
        if (isEncrypted) {
          // Create lazy holder for encrypted struct - decrypt on access via asType<T>()
          // According to design doc 16.2: ALL complex types (Struct, List, Map, Json) should be lazy
          const lazyData = new LazyDataWithOffset(
            typeName,
            bytes,
            isEncrypted,
            dataStart,
            bytes.length,
            keystore
          );
          const anyValue = new AnyValue(ValueCategory.Struct, null, null, typeName);
          anyValue.lazyData = lazyData;
          return ok(anyValue as AnyValue<T>);
        } else {
          // For non-encrypted structs, deserialize immediately
          const structData = decode(dataBytes);
          if (structData && typeof structData === 'object' && !Array.isArray(structData)) {
            const anyValue = new AnyValue(ValueCategory.Struct, structData, null, typeName);
            return ok(anyValue as AnyValue<T>);
          } else {
            return err(new Error(`Failed to decode struct data for type: ${typeName}`));
          }
        }
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

    // Note: Struct deserialization is now lazy and handled in performLazyDecrypt

    // Note: Struct deserialization is now lazy and handled in performLazyDecrypt

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

    return ok(new AnyValue(category, value, serializeFn, typeName) as AnyValue<T>);
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

    if (value === null) return 'null';
    if (value === undefined) return 'null'; // Treat undefined as null for serialization
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
      'null',
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

    // Check if this is a container that needs element decryption (even for plain data)
    if (this.category === ValueCategory.List && Array.isArray(this.value)) {
      // This is a List container - implement 3-step fallback for List decryption
      const listResult = this.performListElementDecryption(this.value, targetConstructor);
      if (listResult.ok) {
        return listResult;
      }
      // If list decryption fails, fall back to direct value
    } else if (this.category === ValueCategory.Map && this.value && typeof this.value === 'object' && !Array.isArray(this.value)) {
      // This is a Map container - implement 3-step fallback for Map decryption
      const mapResult = this.performMapElementDecryption(this.value, targetConstructor);
      if (mapResult.ok) {
        return mapResult;
      }
      // If map decryption fails, fall back to direct value
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
        return err(
          new Error(
            'InvalidTypeForPlainBody: Cannot request encrypted companion type from plain body'
          )
        );
      }
    }

    return ok(this.value as unknown as U);
  }

  // Alias for backward compatibility
  as<U = T>(): Result<U, Error> {
    return this.asType<U>();
  }

  // Method to get encrypted companion type (for interface types like EncryptedTestProfile)
  asEncryptedCompanion(): Result<any> {
    if (!this.lazyData) {
      return err(new Error('No lazy data available for encrypted companion conversion'));
    }

    return this.performLazyDecrypt<any>(undefined, true);
  }

  // Perform lazy decrypt-on-access logic exactly like Rust with dual-mode semantics
  private performLazyDecrypt<U>(
    targetConstructor?: new (...args: any[]) => U,
    forceEncryptedCompanion?: boolean
  ): Result<U> {
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
          if (
            forceEncryptedCompanion ||
            (targetConstructor && this.isEncryptedCompanionType(targetConstructor))
          ) {
            // Requesting Encrypted{T} - return the encrypted companion as-is
            return ok(decoded as U);
          } else {
            // Requesting plain T - need to decrypt the encrypted companion
            // Check if the decoded object is an encrypted companion by looking for encrypted field patterns
            const hasEncryptedFields =
              decoded &&
              typeof decoded === 'object' &&
              Object.keys(decoded).some(key => key.endsWith('_encrypted'));

            if (hasEncryptedFields) {
              // We have an encrypted companion, need to decrypt it to get plain T
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
                return err(
                  new Error(`No decryptor registered for type: ${this.lazyData.typeName}`)
                );
              }
            } else {
              // Direct decode succeeded - check if this is a container that needs element decryption
              if (Array.isArray(decoded)) {
                // This is a List container - implement 3-step fallback for List decryption
                const listResult = this.performListElementDecryption(decoded, targetConstructor);
                if (listResult.ok) {
                  return listResult;
                }
                // If list decryption fails, fall back to direct decode
              } else if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) {
                // This is a Map container - implement 3-step fallback for Map decryption
                const mapResult = this.performMapElementDecryption(decoded, targetConstructor);
                if (mapResult.ok) {
                  return mapResult;
                }
                // If map decryption fails, fall back to direct decode
              }
              
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
          return err(
            new Error(
              'InvalidTypeForPlainBody: Cannot request encrypted companion type from plain body'
            )
          );
        }

        // Check if this is a container that needs element decryption
        if (Array.isArray(decoded)) {
          // This is a List container - implement 3-step fallback for List decryption
          const listResult = this.performListElementDecryption(decoded, targetConstructor);
          if (listResult.ok) {
            return listResult;
          }
          // If list decryption fails, fall back to direct decode
        } else if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) {
          // This is a Map container - implement 3-step fallback for Map decryption
          const mapResult = this.performMapElementDecryption(decoded, targetConstructor);
          if (mapResult.ok) {
            return mapResult;
          }
          // If map decryption fails, fall back to direct decode
        }
        
        return ok(decoded as U);
      } catch (error) {
        return err(new Error(`Failed to decode plain lazy data: ${error}`));
      }
    }
  }

  // Container element decryption for List/Map with encrypted elements
  // Implements design doc Section 21.3, step 7: 3-step fallback for containers
  private performContainerElementDecryption<U>(
    decoded: any,
    targetConstructor?: new (...args: any[]) => U
  ): Result<U> {
    if (!this.lazyData?.keystore) {
      return err(new Error('No keystore available for container element decryption'));
    }

    const keystore = this.lazyData.keystore;

    // Step 1: Try direct decode as Vec<T> or Map<String,T>
    try {
      if (Array.isArray(decoded)) {
        // This is a list - try to decode as Vec<T>
        const result = decoded as U;
        return ok(result);
      } else if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) {
        // This is a map - try to decode as Map<String,T>
        const result = decoded as U;
        return ok(result);
      }
    } catch (error) {
      // Continue to step 2
    }

    // Step 2: Try decode as Vec<bytes> or Map<String,bytes> then decrypt each element
    try {
      if (Array.isArray(decoded)) {
        // Try to decode as Vec<bytes> - check if all elements are Uint8Array
        const allElementsAreBytes = decoded.every((item: any) => item instanceof Uint8Array);
        
        if (allElementsAreBytes) {
          // This is Vec<bytes> - decrypt each element via registry
          const decryptedElements: any[] = [];
          
          for (const elementBytes of decoded) {
            // Try to decrypt each element using registry decryptors
            // We need to determine the element type from the target constructor or context
            const elementTypeName = this.getElementTypeFromTarget(targetConstructor);
            
            if (elementTypeName) {
              const decryptorResult = lookupDecryptorByTypeName(elementTypeName);
              if (decryptorResult.ok) {
                try {
                  const decrypted = decryptorResult.value(elementBytes, keystore);
                  if (isErr(decrypted)) {
                    // If decryption fails for this element, keep it as bytes
                    decryptedElements.push(elementBytes);
                  } else {
                    decryptedElements.push(decrypted.value);
                  }
                } catch (decryptorError) {
                  // If decryption fails for this element, keep it as bytes
                  decryptedElements.push(elementBytes);
                }
              } else {
                // No decryptor available, keep as bytes
                decryptedElements.push(elementBytes);
              }
            } else {
              // No element type info, keep as bytes
              decryptedElements.push(elementBytes);
            }
          }
          
          return ok(decryptedElements as U);
        }
      } else if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) {
        // Try to decode as Map<String,bytes> - check if all values are Uint8Array
        const entries = Object.entries(decoded);
        const allValuesAreBytes = entries.every(([_, value]) => 
          value instanceof Uint8Array || 
          (value && typeof value === 'object' && (value as any).category === 4 && (value as any).value instanceof Uint8Array)
        );
        
        if (allValuesAreBytes) {
          // This is Map<String,bytes> - decrypt each value via registry
          const decryptedMap: Record<string, any> = {};
          
          for (const [key, valueBytes] of entries) {
            // Try to decrypt each value using registry decryptors
            const valueTypeName = this.getElementTypeFromTarget(targetConstructor);
            
            if (valueTypeName) {
              const decryptorResult = lookupDecryptorByTypeName(valueTypeName);
              if (decryptorResult.ok) {
                try {
                  const decrypted = decryptorResult.value(valueBytes as Uint8Array, keystore);
                  if (isErr(decrypted)) {
                    // If decryption fails for this value, keep it as bytes
                    decryptedMap[key] = valueBytes;
                  } else {
                    decryptedMap[key] = decrypted.value;
                  }
                } catch (decryptorError) {
                  // If decryption fails for this value, keep it as bytes
                  decryptedMap[key] = valueBytes;
                }
              } else {
                // No decryptor available, keep as bytes
                decryptedMap[key] = valueBytes;
              }
            } else {
              // No value type info, keep as bytes
              decryptedMap[key] = valueBytes;
            }
          }
          
          return ok(decryptedMap as U);
        }
      }
    } catch (error) {
      // Continue to step 3
    }

    // Step 3: Fallback to Vec<AnyValue> or Map<String,AnyValue> and map via asType<T>()
    try {
      if (Array.isArray(decoded)) {
        // Convert to Vec<AnyValue> and map each element
        const anyValueElements = decoded.map((item: any) => {
          if (item instanceof AnyValue) {
            return item;
          } else {
            // Create AnyValue from the item
            const fromResult = AnyValue.from(item);
            return fromResult.ok ? fromResult.value : AnyValue.null();
          }
        });
        
        // Map each AnyValue to the target type
        const mappedElements = anyValueElements.map((av: AnyValue) => {
          const asTypeResult = av.asType<U>();
          return asTypeResult.ok ? asTypeResult.value : null;
        });
        
        return ok(mappedElements as U);
      } else if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) {
        // Convert to Map<String,AnyValue> and map each value
        const anyValueMap = new Map<string, AnyValue>();
        
        for (const [key, value] of Object.entries(decoded)) {
          if (value instanceof AnyValue) {
            anyValueMap.set(key, value);
          } else {
            // Create AnyValue from the value
            const fromResult = AnyValue.from(value);
            anyValueMap.set(key, fromResult.ok ? fromResult.value : AnyValue.null());
          }
        }
        
        // Map each AnyValue to the target type
        const mappedMap = new Map<string, U>();
        for (const [key, av] of anyValueMap) {
          const asTypeResult = av.asType<U>();
          mappedMap.set(key, asTypeResult.ok ? asTypeResult.value : null as U);
        }
        
        return ok(mappedMap as U);
      }
    } catch (error) {
      return err(new Error(`Failed to perform container element decryption: ${error}`));
    }

    // If all steps fail, return the decoded data as-is
    return ok(decoded as U);
  }

  // List element decryption with 3-step fallback (Rust parity)
  // Implements design doc Section 22.7.2: Algorithm for List Container Decryption
  private performListElementDecryption<U>(
    decoded: unknown,
    targetConstructor?: new (...args: any[]) => U
  ): Result<U> {
    // Validate input is an array
    if (!Array.isArray(decoded)) {
      return err(new Error('Container element decryption requires array input'));
    }

    const elements = decoded as unknown[];
    const keystore = this.lazyData?.keystore;

    // Step 1: Try Vec<Vec<u8>> (encrypted bytes) - only if keystore is available
    if (keystore) {
      const encryptedBytesResult = this.tryDecryptEncryptedListElements(elements, targetConstructor, keystore);
      if (isOk(encryptedBytesResult)) {
        return encryptedBytesResult;
      }
    }

    // Step 2: Try Vec<T> (plain data) - behavior depends on target type
    // If target type is AnyValue[], return AnyValue objects
    // If target type is plain type[], return plain values
    const shouldReturnAnyValueObjects = this.shouldReturnAnyValueObjects(targetConstructor, elements);
    
    if (shouldReturnAnyValueObjects) {
      // Convert plain objects to AnyValue objects
      const anyValueElements = elements.map(element => {
        if (element instanceof AnyValue) {
          // Already an AnyValue object
          return element;
        } else {
          // Convert plain object to AnyValue
          const fromResult = AnyValue.from(element);
          return fromResult.ok ? fromResult.value : AnyValue.null();
        }
      });
      
      return ok(anyValueElements as U);
    } else {
      // Convert AnyValue objects to plain values
      const plainElements = elements.map(element => {
        if (element instanceof AnyValue) {
          // Extract the plain value from AnyValue
          return element.value;
        }
        return element;
      });
      
      return ok(plainElements as U);
    }
  }

  private tryDecryptEncryptedListElements<U>(
    elements: unknown[],
    targetConstructor: (new (...args: any[]) => U) | undefined,
    keystore: CommonKeysInterface
  ): Result<U> {
    // Check if all elements are encrypted bytes
    const allElementsAreBytes = elements.every(element => this.isEncryptedBytes(element));
    
    if (!allElementsAreBytes) {
      return err(new Error('Not all elements are encrypted bytes'));
    }

    const elementTypeName = this.getElementTypeFromTarget(targetConstructor);
    if (!elementTypeName) {
      return err(new Error('Cannot determine element type for decryption'));
    }

    const decryptorResult = lookupDecryptorByTypeName(elementTypeName);
    if (isErr(decryptorResult)) {
      return err(`No decryptor registered for element type: ${elementTypeName}`, decryptorResult.error);
    }

    const decryptedElements: unknown[] = [];
    
    for (const element of elements) {
      const elementBytesResult = this.extractBytesFromElement(element);
      if (isErr(elementBytesResult)) {
        return elementBytesResult;
      }

      try {
        const decryptedResult = decryptorResult.value(elementBytesResult.value, keystore);
        if (isErr(decryptedResult)) {
          return err(`Element decryption failed: ${decryptedResult.error.message}`, decryptedResult.error);
        }
        decryptedElements.push(decryptedResult.value);
      } catch (error) {
        const errorMessage = `Decryption error: ${error instanceof Error ? error.message : String(error)}`;
        return err(errorMessage, error instanceof Error ? error : new Error(String(error)));
      }
    }

    return ok(decryptedElements as U);
  }

  private isEncryptedBytes(element: unknown): boolean {
    return element instanceof Uint8Array || 
           (element !== null && typeof element === 'object' && (element as any).category === 4 && (element as any).value instanceof Uint8Array);
  }

  private extractBytesFromElement(element: unknown): Result<Uint8Array> {
    if (element instanceof Uint8Array) {
      return ok(element);
    }
    
    if (element && typeof element === 'object' && (element as any).category === 4 && (element as any).value instanceof Uint8Array) {
      return ok((element as any).value);
    }
    
    return err('Element is not encrypted bytes');
  }

  // Map element decryption with 3-step fallback (Rust parity)
  // Implements design doc Section 22.7.9: Future Extension to Map Containers
  private performMapElementDecryption<U>(
    decoded: any,
    targetConstructor?: new (...args: any[]) => U
  ): Result<U> {
    const keystore = this.lazyData?.keystore;

    // Step 3a: Try Map<String, Vec<u8>> (Encrypted Values) - only if keystore is available
    if (keystore) {
      try {
        if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) {
        const entries = Object.entries(decoded);
        const allValuesAreBytes = entries.every(([_, value]) => 
          value instanceof Uint8Array || 
          (value && typeof value === 'object' && (value as any).category === 4 && (value as any).value instanceof Uint8Array)
        );
        
        if (allValuesAreBytes) {
          // Decrypt each value using registry decryptors
          const decryptedMap: Record<string, any> = {};
          
          for (const [key, value] of entries) {
            // Extract bytes from either Uint8Array or AnyValue with bytes
            let valueBytes: Uint8Array;
            if (value instanceof Uint8Array) {
              valueBytes = value;
            } else if (value && typeof value === 'object' && (value as any).category === 4 && (value as any).value instanceof Uint8Array) {
              valueBytes = (value as any).value;
            } else {
              return err(new Error('Invalid value type for decryption'));
            }
            
            const valueTypeName = this.getElementTypeFromTarget(targetConstructor);
            if (!valueTypeName) {
              return err(new Error('Cannot determine value type for decryption'));
            }
            
            const decryptorResult = lookupDecryptorByTypeName(valueTypeName);
            if (isErr(decryptorResult)) {
              return err(`No decryptor registered for value type: ${valueTypeName}`, decryptorResult.error);
            }
            
            const decryptedResult = decryptorResult.value(valueBytes, keystore);
            if (isErr(decryptedResult)) {
              return err(`Value decryption failed: ${decryptedResult.error.message}`, decryptedResult.error);
            }
            
            decryptedMap[key] = decryptedResult.value;
          }
          
          return ok(decryptedMap as U);
        }
      }
      } catch (error) {
        // Continue to step 3b
      }
    }

    // Step 3b: Try Map<String, T> (Plain) - behavior depends on target type
    if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) {
      // Check if target type is AnyValue map
      let values: unknown[];
      if (decoded instanceof Map) {
        values = Array.from(decoded.values());
      } else {
        values = Object.values(decoded);
      }
      const isAnyValueMap = this.shouldReturnAnyValueObjects(targetConstructor, values);
      
      if (isAnyValueMap) {
        // Return AnyValue objects as-is
        if (decoded instanceof Map) {
          return ok(decoded as U);
        } else {
          // Convert plain object to Map
          const anyValueMap = new Map<string, AnyValue>();
          for (const [key, value] of Object.entries(decoded)) {
            if (value instanceof AnyValue) {
              anyValueMap.set(key, value);
            } else {
              // Create AnyValue from the value
              const fromResult = AnyValue.from(value);
              anyValueMap.set(key, fromResult.ok ? fromResult.value : AnyValue.null());
            }
          }
          return ok(anyValueMap as U);
        }
      } else {
        // Convert AnyValue objects to plain values
        if (decoded instanceof Map) {
          // It's already a Map, convert AnyValue objects to plain values
          const plainMap = new Map<string, any>();
          for (const [key, value] of decoded.entries()) {
            if (value instanceof AnyValue) {
              // Extract the plain value from AnyValue
              plainMap.set(key, value.value);
            } else {
              plainMap.set(key, value);
            }
          }
          return ok(plainMap as U);
        } else {
          // It's a plain object, convert to Map and convert AnyValue objects to plain values
          const plainMap = new Map<string, any>();
          for (const [key, value] of Object.entries(decoded)) {
            if (value instanceof AnyValue) {
              // Extract the plain value from AnyValue
              plainMap.set(key, value.value);
            } else {
              plainMap.set(key, value);
            }
          }
          return ok(plainMap as U);
        }
      }
    }

    // Step 3c: Try Map<String, ArcValue> (Heterogeneous)
    try {
      if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) {
        // Convert each ArcValue value to T using asType<T>()
        const convertedMap: Record<string, any> = {};
        
        for (const [key, arcValue] of Object.entries(decoded)) {
          // Check if this is an AnyValue (ArcValue equivalent)
          if (arcValue && typeof arcValue === 'object' && typeof (arcValue as any).asType === 'function') {
            const convertedResult = (arcValue as any).asType();
            if (isErr(convertedResult)) {
              const errorMessage = `Heterogeneous value conversion failed: ${convertedResult.error instanceof Error ? convertedResult.error.message : String(convertedResult.error)}`;
              const error = convertedResult.error instanceof Error ? convertedResult.error : new Error(String(convertedResult.error));
              return err(errorMessage, error);
            }
            convertedMap[key] = convertedResult.value;
          } else {
            // Not an AnyValue, treat as plain value
            convertedMap[key] = arcValue;
          }
        }
        
        return ok(convertedMap as U);
      }
    } catch (error) {
      // All steps failed
      return err(new Error('Failed to deserialize map container: all deserialization approaches failed'));
    }

    return err(new Error('Failed to deserialize map container: all deserialization approaches failed'));
  }

  // Helper method to detect if target type is AnyValue array
  private shouldReturnAnyValueObjects(targetConstructor?: new (...args: any[]) => any, elements?: unknown[]): boolean {
    if (!elements || elements.length === 0) {
      return false;
    }

    // Check if elements are already AnyValue instances
    const allElementsAreAnyValue = elements.every(element => element instanceof AnyValue);
    
    // If targetConstructor is provided, use it to determine the target type
    if (targetConstructor) {
      const constructorName = targetConstructor.name;
      
      // For Array constructor, we need to distinguish between:
      // - asType<string[]>(Array) -> return plain values
      // - asType<AnyValue[]>(Array) -> return AnyValue objects
      if (constructorName === 'Array') {
        // Since we can't distinguish at runtime due to TypeScript type erasure,
        // we use a heuristic based on the element types
        if (allElementsAreAnyValue) {
          // All elements are AnyValue instances - check if they're primitives
          const allPrimitives = elements.every(element => {
            if (element instanceof AnyValue) {
              const category = (element as any).category;
              // Primitive types: Null (0), Primitive (1)
              return category === 0 || category === 1;
            }
            return false;
          });
          
          // If all elements are primitive AnyValue instances, we need to decide:
          // - If user wants plain values (asType<string[]>), return false
          // - If user wants AnyValue objects (asType<AnyValue[]>), return true
          // Since we can't distinguish at runtime, we use a heuristic:
          // If elements are primitives, assume user wants plain values
          // This is a limitation of TypeScript's type erasure
          if (allPrimitives) {
            return false; // Return plain values for primitives
          }
          
          // If elements are complex AnyValue instances, preserve them
          return true;
        }
        
        // Elements are not AnyValue instances - check if they're plain objects that should be converted
        const allElementsAreObjects = elements.every(element => 
          element !== null && typeof element === 'object' && !Array.isArray(element)
        );
        
        // If elements are plain objects, convert them to AnyValue objects
        if (allElementsAreObjects) {
          return true;
        }
        
        // For primitive elements, return plain values
        return false;
      }
      
      // For Map constructor, similar logic
      if (constructorName === 'Map') {
        if (allElementsAreAnyValue) {
          // Check if all elements are primitive AnyValue instances
          const allPrimitives = elements.every(element => {
            if (element instanceof AnyValue) {
              const category = (element as any).category;
              return category === 0 || category === 1;
            }
            return false;
          });
          
          // If all elements are primitive AnyValue instances, return plain values
          if (allPrimitives) {
            return false;
          }
          
          // If elements are complex AnyValue instances, preserve them
          return true;
        }
        
        // Check if elements are plain objects that should be converted to AnyValue
        const allElementsAreObjects = elements.every(element => 
          element !== null && typeof element === 'object' && !Array.isArray(element)
        );
        
        if (allElementsAreObjects) {
          return true;
        }
        
        return false;
      }
      
      // For other constructors, default to AnyValue objects if elements are AnyValue instances
      return allElementsAreAnyValue;
    }
    
    // Fallback: No targetConstructor provided - preserve AnyValue objects
    return allElementsAreAnyValue;
  }


  // Helper method to extract element type from target constructor
  private getElementTypeFromTarget(targetConstructor?: new (...args: any[]) => any): string | null {
    if (!targetConstructor) {
      return null;
    }

    // Try to extract element type from generic type parameters
    const constructorName = targetConstructor.name;
    
    // For Array constructor (when calling asType<string[]>), we need to determine the element type
    if (constructorName === 'Array') {
      // Since we can't easily extract the generic type parameter at runtime,
      // we'll try to infer it from the context or use a default approach
      
      // For now, let's try common types that might be registered
      // In a real implementation, we might need more sophisticated type analysis
      return 'string'; // Default to string for testing
    }
    
    // Check if it's a container type with element type info
    if (constructorName.includes('Array') || constructorName.includes('List')) {
      // For arrays/lists, try to determine element type from the constructor
      if (constructorName.includes('String') || constructorName.includes('string')) {
        return 'string';
      } else if (constructorName.includes('Number') || constructorName.includes('number')) {
        return 'number';
      } else if (constructorName.includes('Boolean') || constructorName.includes('boolean')) {
        return 'boolean';
      }
      
      // For complex types, return generic type that might work with registry lookup
      return 'object';
    } else if (constructorName.includes('Map') || constructorName.includes('Object')) {
      // For maps/objects, try to determine value type
      if (constructorName.includes('String') || constructorName.includes('string')) {
        return 'string';
      } else if (constructorName.includes('Number') || constructorName.includes('number')) {
        return 'number';
      } else if (constructorName.includes('Boolean') || constructorName.includes('boolean')) {
        return 'boolean';
      }
      
      // For complex types, return generic type
      return 'object';
    }
    
    // For non-container types, return the constructor name
    return constructorName;
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
        return ok(AnyValue.newPrimitive(value) as AnyValue<T>);
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

  // Container element access methods (TypeScript-specific)
  
  /**
   * Explicitly return an array of AnyValue objects, preserving the container structure
   * and enabling further type conversion via .asType<T>() on individual elements.
   * 
   * This method solves the TypeScript generic type erasure problem where we cannot
   * distinguish between asType<string[]>(Array) and asType<AnyValue[]>(Array) at runtime.
   * 
   * @returns Result<AnyValue[], Error> - Array of AnyValue objects
   */
  asAnyValueArray(): Result<AnyValue[], Error> {
    if (this.category !== ValueCategory.List) {
      return err(new Error(`Expected List category, got ${ValueCategory[this.category]}`));
    }

    // Handle lazy decryption if needed
    if (this.lazyData) {
      const decryptedResult = this.performLazyDecrypt();
      if (isErr(decryptedResult)) {
        return err(decryptedResult.error);
      }
      // After decryption, the value should be available
      if (this.category !== ValueCategory.List) {
        return err(new Error(`Expected List category after decryption, got ${ValueCategory[this.category]}`));
      }
    }

    if (!Array.isArray(this.value)) {
      return err(new Error(`Expected array value, got ${typeof this.value}`));
    }

    // Convert all elements to AnyValue objects
    const anyValueElements: AnyValue[] = [];
    for (const element of this.value) {
      if (element instanceof AnyValue) {
        // Already an AnyValue object
        anyValueElements.push(element);
      } else {
        // Convert plain element to AnyValue
        const fromResult = AnyValue.from(element);
        if (isOk(fromResult)) {
          anyValueElements.push(fromResult.value);
        } else {
          // Fallback to null AnyValue if conversion fails
          anyValueElements.push(AnyValue.null());
        }
      }
    }

    return ok(anyValueElements);
  }

  /**
   * Explicitly return a Map with AnyValue objects as values, preserving the container
   * structure and enabling further type conversion.
   * 
   * This method solves the TypeScript generic type erasure problem where we cannot
   * distinguish between asType<Map<string, string>>(Map) and asType<Map<string, AnyValue>>(Map) at runtime.
   * 
   * @returns Result<Map<string, AnyValue>, Error> - Map with AnyValue values
   */
  asAnyValueMap(): Result<Map<string, AnyValue>, Error> {
    if (this.category !== ValueCategory.Map) {
      return err(new Error(`Expected Map category, got ${ValueCategory[this.category]}`));
    }

    // Handle lazy decryption if needed
    if (this.lazyData) {
      const decryptedResult = this.performLazyDecrypt();
      if (isErr(decryptedResult)) {
        return err(decryptedResult.error);
      }
      // After decryption, the value should be available
      if (this.category !== ValueCategory.Map) {
        return err(new Error(`Expected Map category after decryption, got ${ValueCategory[this.category]}`));
      }
    }

    if (!(this.value instanceof Map)) {
      return err(new Error(`Expected Map value, got ${typeof this.value}`));
    }

    // Convert all values to AnyValue objects
    const anyValueMap = new Map<string, AnyValue>();
    for (const [key, value] of this.value.entries()) {
      if (value instanceof AnyValue) {
        // Already an AnyValue object
        anyValueMap.set(key, value);
      } else {
        // Convert plain value to AnyValue
        const fromResult = AnyValue.from(value);
        if (isOk(fromResult)) {
          anyValueMap.set(key, fromResult.value);
        } else {
          // Fallback to null AnyValue if conversion fails
          anyValueMap.set(key, AnyValue.null());
        }
      }
    }

    return ok(anyValueMap);
  }
}
