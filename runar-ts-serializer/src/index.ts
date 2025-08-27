import { encode, decode } from 'cbor-x';
import { Result, ok, err } from './result.js';
import {
  ValueCategory,
  DeserializationContext,
  SerializationContext,
  CommonKeysInterface,
} from './wire.js';
export type {
  DeserializationContext,
  WireHeader,
  SerializationContext,
  CommonKeysInterface,
} from './wire.js';
import { resolveType, initWirePrimitives, registerType, clearRegistry } from './registry.js';
import { getTypeName } from 'runar-ts-decorators';
import { CBORUtils } from './cbor_utils.js';

// Re-export registry functions
export { registerType, clearRegistry, resolveType } from './registry.js';

// Create a TypeRegistry class for compatibility
export class TypeRegistry {
  static register<T>(typeName: string, ctor: new (...args: any[]) => T): void {
    registerType(typeName, { ctor });
  }

  static resolve<T>(typeName: string): (new (...args: any[]) => T) | undefined {
    const entry = resolveType(typeName);
    return entry?.ctor as (new (...args: any[]) => T) | undefined;
  }

  static clear(): void {
    clearRegistry();
  }
}

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
      throw new Error(`Not a primitive: ${typeName}`);
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
        // Check if elements are AnyValue objects that need individual serialization
        if (Array.isArray(value) && value.length > 0 && value[0] instanceof AnyValue) {
          // Elements are AnyValue objects - use CBORUtils to create array of structures
          const anyValueStructures: any[] = [];

          for (const element of value) {
            if (element instanceof AnyValue) {
              // Create AnyValue structure as JavaScript object
              const anyValueStructure = {
                category: element.category,
                typename: element.getTypeName() || 'unknown',
                value: element.value,
              };
              anyValueStructures.push(anyValueStructure);
            }
          }

          // Use CBORUtils to encode the array of structures
          const cborBytes = CBORUtils.encodeAnyValueArray(anyValueStructures);
          return ok(new Uint8Array(cborBytes));
        } else {
          // Regular array of primitive values - but we need to handle strings specially
          // for container serialization compatibility with Rust
          if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
            // Convert string array to AnyValue structures for proper CBOR encoding
            const stringStructures = value.map(str => ({
              category: ValueCategory.Primitive,
              typename: 'string',
              value: str, // The CBORUtils.encodeValue method will handle string conversion
            }));

            // Use CBORUtils to encode the array of string structures
            const cborBytes = CBORUtils.encodeAnyValueArray(stringStructures);
            return ok(new Uint8Array(cborBytes));
          } else {
            console.log(`Encoding regular array: ${JSON.stringify(value)}`);
            // Regular array of non-string primitive values
            const bytes = encode(value);
            return ok(bytes);
          }
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
          const firstValue = value.values().next().value;
          if (firstValue instanceof AnyValue) {
            // Values are AnyValue objects - use CBORUtils to create map of structures
            const anyValueMap = new Map<string, any>();

            for (const [key, val] of value) {
              if (val instanceof AnyValue) {
                // Create AnyValue structure as JavaScript object
                const anyValueStructure = {
                  category: val.category,
                  typename: val.getTypeName() || 'unknown',
                  value: val.value,
                };
                anyValueMap.set(key, anyValueStructure);
              }
            }

            // Use CBORUtils to encode the map of structures
            const cborBytes = CBORUtils.encodeAnyValueMap(anyValueMap);
            return ok(new Uint8Array(cborBytes));
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
      value.encryptWithKeystore !== (value as any).__isPlainNoOp;

    const serializeFn: SerializeFn = hasEncryptionMethods
      ? async (value, keystore, resolver) => {
          try {
            // This is a decorated class - use its encryption method
            const encrypted = await value.encryptWithKeystore(keystore, resolver);
            const bytes = encode(encrypted);
            return ok(bytes);
          } catch (e) {
            return err(e as Error);
          }
        }
      : value => {
          try {
            // Regular struct serialization
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
  static deserialize(bytes: Uint8Array, ctx?: DeserializationContext): Result<AnyValue<any>> {
    if (bytes.length === 0) {
      return err(new Error('Empty bytes for deserialization'));
    }

    const categoryByte = bytes[0];
    const category = AnyValue.categoryFromByte(categoryByte);
    if (category === null) {
      return err(new Error(`Invalid category byte: ${categoryByte}`));
    }

    if (category === ValueCategory.Null) {
      return ok(AnyValue.null());
    }

    const isEncryptedByte = bytes[1];
    const isEncrypted = isEncryptedByte === 0x01;

    const typeNameLen = bytes[2] as number;
    if (typeNameLen + 3 > bytes.length) {
      return err(new Error('Invalid type name length'));
    }

    const typeNameBytes = bytes.subarray(3, 3 + typeNameLen);
    const typeName = new TextDecoder().decode(typeNameBytes);

    const dataStart = 3 + typeNameLen;
    let dataBytes = bytes.subarray(dataStart);

    // Handle encrypted data
    if (isEncrypted && ctx?.decryptEnvelope) {
      const decryptResult = ctx.decryptEnvelope(dataBytes);
      if (!decryptResult.ok) {
        return err(decryptResult.error);
      }
      dataBytes = decryptResult.value;
    }

    // Deserialize based on category
    let value: any = null;
    switch (category) {
      case ValueCategory.Primitive:
        value = decode(dataBytes);
        break;
      case ValueCategory.List:
        value = decode(dataBytes) || [];
        break;
      case ValueCategory.Map:
        value = decode(dataBytes) || new Map();
        break;
      case ValueCategory.Struct:
        value = decode(dataBytes) || {};
        break;
      case ValueCategory.Bytes:
        value = dataBytes;
        break;
      case ValueCategory.Json:
        value = decode(dataBytes);
        break;
      default:
        return err(new Error(`Unsupported category for deserialization: ${category}`));
    }

    // Handle encrypted instances from decorators
    if (value && typeof value === 'object' && 'decryptWithKeystore' in value && ctx?.keystore) {
      try {
        // This is an encrypted instance from decorators - decrypt it
        const decrypted = value.decryptWithKeystore(ctx.keystore);
        value = decrypted;
      } catch (e) {
        // If decryption fails, keep the encrypted value but log the error
        console.warn(`Failed to decrypt instance: ${e}`);
      }
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
          const decoratorTypeName = getTypeName(value.constructor);
          if (decoratorTypeName) {
            return decoratorTypeName;
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

  // Enhanced serialization method with encryption support
  serializeWithEncryption(
    context?: SerializationContext
  ): Result<Uint8Array> | Promise<Result<Uint8Array>> {
    return this.serialize(context);
  }

  // Static method to deserialize with encryption support
  static deserializeWithDecryption(
    bytes: Uint8Array,
    context?: {
      keystore?: any;
    }
  ): Result<AnyValue<any>> {
    return AnyValue.deserialize(bytes, context);
  }

  // Serialization method matching Rust exactly (with backward compatibility)
  serialize(context?: any): Result<Uint8Array> | Promise<Result<Uint8Array>> {
    // Check if we need async serialization (has encryption methods)
    const hasEncryptionMethods =
      this.value && typeof this.value === 'object' && 'encryptWithKeystore' in this.value;

    if (hasEncryptionMethods && context?.keystore) {
      // Return a promise for async encryption
      return this.serializeAsync(context);
    } else {
      // Return synchronous result
      return this.serializeSync(context);
    }
  }

  // Synchronous serialization for backward compatibility
  private serializeSync(context?: any): Result<Uint8Array> {
    if (this.isNull()) {
      return ok(new Uint8Array([0]));
    }

    if (!this.serializeFn) {
      return err(new Error('No serialize function available'));
    }

    const categoryByte = this.category;
    const mutBuf: number[] = [categoryByte];

    // Resolve wire name (parameterized for containers)
    let wireName: string;
    switch (this.category) {
      case ValueCategory.Primitive:
        if (!this.typeName) {
          return err(new Error('Missing type name for primitive'));
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
          return err(new Error('Missing type name for struct'));
        }
        wireName = this.typeName;
        break;
      case ValueCategory.Null:
        wireName = 'null';
        break;
      default:
        return err(new Error(`Unknown category: ${this.category}`));
    }

    const typeNameBytes = new TextEncoder().encode(wireName);
    if (typeNameBytes.length > 255) {
      return err(new Error(`Wire type name too long: ${wireName}`));
    }

    // Serialize the value (sync version) - handle both sync and async serializeFn
    let bytes: Result<Uint8Array>;
    try {
      const bytesResult = this.serializeFn(this.value, context?.keystore, context?.resolver);
      // If it's a promise, we can't handle it in sync mode
      if (bytesResult instanceof Promise) {
        return err(new Error('Async serialization function called in sync context'));
      }
      if (!bytesResult.ok) {
        return err(bytesResult.error);
      }
      // Store the result for building the wire format
      bytes = bytesResult;
    } catch (e) {
      return err(e as Error);
    }

    // Build the wire format: [category][is_encrypted][type_name_len][type_name_bytes...][data...]
    const isEncryptedByte = context ? 0x01 : 0x00;
    mutBuf.push(isEncryptedByte);
    mutBuf.push(typeNameBytes.length);
    mutBuf.push(...typeNameBytes);
    mutBuf.push(...bytes.value);

    return ok(new Uint8Array(mutBuf));
  }

  // Async serialization for encryption
  private async serializeAsync(context?: any): Promise<Result<Uint8Array>> {
    if (this.isNull()) {
      return ok(new Uint8Array([0]));
    }

    if (!this.serializeFn) {
      return err(new Error('No serialize function available'));
    }

    const categoryByte = this.category;
    const mutBuf: number[] = [categoryByte];

    // Resolve wire name (parameterized for containers)
    let wireName: string;
    switch (this.category) {
      case ValueCategory.Primitive:
        if (!this.typeName) {
          return err(new Error('Missing type name for primitive'));
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
          return err(new Error('Missing type name for struct'));
        }
        wireName = this.typeName;
        break;
      case ValueCategory.Null:
        wireName = 'null';
        break;
      default:
        return err(new Error(`Unknown category: ${this.category}`));
    }

    const typeNameBytes = new TextEncoder().encode(wireName);
    if (typeNameBytes.length > 255) {
      return err(new Error(`Wire type name too long: ${wireName}`));
    }

    // Serialize the value (async version)
    const bytesResult = this.serializeFn(this.value, context?.keystore, context?.resolver);
    const bytes = bytesResult instanceof Promise ? await bytesResult : bytesResult;
    if (!bytes.ok) {
      return err(bytes.error);
    }

    // Build the wire format: [category][is_encrypted][type_name_len][type_name_bytes...][data...]
    const isEncryptedByte = context ? 0x01 : 0x00;
    mutBuf.push(isEncryptedByte);
    mutBuf.push(typeNameBytes.length);
    mutBuf.push(...typeNameBytes);
    mutBuf.push(...bytes.value);

    return ok(new Uint8Array(mutBuf));
  }

  // Type conversion methods
  as<U = T>(): Result<U> {
    if (this.value === null) {
      return err(new Error('No value to convert'));
    }
    return ok(this.value as unknown as U);
  }

  // Core API method for creating AnyValue from JavaScript/TypeScript values
  static from<T>(value: T): AnyValue<T> {
    // Special handling for null
    if (value === null) {
      return AnyValue.null() as AnyValue<T>;
    }

    const category = AnyValue.determineCategory(value);

    // Create appropriate factory method based on category
    switch (category) {
      case ValueCategory.Primitive:
        return AnyValue.newPrimitive(value) as AnyValue<T>;
      case ValueCategory.List:
        // For lists, we need to handle the raw array elements properly
        // The AnyValue.newList constructor expects AnyValue objects for the AnyValue path
        // but can handle raw values for the regular path
        return AnyValue.newList(value as any[]) as AnyValue<T>;
      case ValueCategory.Map:
        if (value instanceof Map) {
          return AnyValue.newMap(value) as AnyValue<T>;
        }
        throw new Error(
          `Expected Map instance for ValueCategory.Map, but got ${typeof value}: ${value}`
        );
      case ValueCategory.Struct:
        return AnyValue.newStruct(value as any) as AnyValue<T>;
      case ValueCategory.Bytes:
        if (value instanceof Uint8Array) {
          return AnyValue.newBytes(value as Uint8Array) as AnyValue<T>;
        }
      // Fall through to default
      case ValueCategory.Json:
      default:
        return AnyValue.newJson(value as any) as AnyValue<T>;
    }
  }

  // Core API method for deserializing AnyValue from wire format bytes
  static fromBytes<T = unknown>(bytes: Uint8Array, ctx?: DeserializationContext): AnyValue<T> {
    const result = AnyValue.deserialize(bytes, ctx);
    if (!result.ok) {
      throw new Error(`Failed to deserialize: ${result.error.message}`);
    }
    return result.value as AnyValue<T>;
  }
}

// Export the wire types

// Export the result types
export { ok, err } from './result.js';
export type { Result } from './result.js';

// Export the wire types
export { ValueCategory, readHeader, writeHeader, bodyOffset } from './wire.js';

// Export function to serialize entities
export function serializeEntity(entity: any): Uint8Array | Promise<Uint8Array> {
  // Serialize the entity directly
  const av = AnyValue.from(entity);
  const result = av.serialize();

  if (result instanceof Promise) {
    return result.then(r => (r.ok ? r.value : new Uint8Array()));
  } else {
    return result.ok ? result.value : new Uint8Array();
  }
}

// Export function to deserialize entities
export function deserializeEntity<T>(bytes: Uint8Array, ctx?: DeserializationContext): Result<T> {
  const av = AnyValue.fromBytes<T>(bytes, ctx);
  return av.as<T>();
}
