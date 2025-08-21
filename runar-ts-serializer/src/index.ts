import { encode, decode } from 'cbor-x';
import { Result, ok, err } from './result';
import { ValueCategory, DeserializationContext, readHeader, writeHeader, bodyOffset } from './wire';
export type { DeserializationContext, WireHeader } from './wire';
import { resolveType, initWirePrimitives, registerType, clearRegistry } from './registry';
import { getTypeName } from 'runar-ts-decorators';

// Re-export registry functions
export { registerType, clearRegistry, resolveType } from './registry';

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
type SerializeFn = (value: any, keystore?: any, resolver?: any) => Result<Uint8Array>;

export class AnyValue<T = unknown> {
  private category: ValueCategory;
  private value: T | null;
  private serializeFn: SerializeFn | null;
  private typeName: string | null;

  private constructor(cat: ValueCategory, val: T | null, serFn: SerializeFn | null, tn: string | null) {
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
        // TODO: Implement element-level encryption when keystore/resolver are available
        const bytes = encode(value);
        return ok(bytes);
      } catch (e) {
        return err(e as Error);
      }
    };

    return new AnyValue(ValueCategory.List, list, serializeFn, 'list');
  }

  static newMap<T>(map: Map<string, T>): AnyValue<Map<string, T>> {
    const serializeFn: SerializeFn = (value, keystore, resolver) => {
      try {
        // TODO: Implement element-level encryption when keystore/resolver are available
        const bytes = encode(value);
        return ok(bytes);
      } catch (e) {
        return err(e as Error);
      }
    };

    return new AnyValue(ValueCategory.Map, map, serializeFn, 'map');
  }

  static newStruct<T>(value: T): AnyValue<T> {
    const typeName = AnyValue.getTypeName(value);
    const serializeFn: SerializeFn = (value, keystore, resolver) => {
      try {
        // TODO: Implement struct encryption when keystore/resolver are available
        const bytes = encode(value);
        return ok(bytes);
      } catch (e) {
        return err(e as Error);
      }
    };

    return new AnyValue(ValueCategory.Struct, value, serializeFn, typeName);
  }

  static newBytes(bytes: Uint8Array): AnyValue<Uint8Array> {
    const serializeFn: SerializeFn = (value) => {
      return ok(value);
    };

    return new AnyValue(ValueCategory.Bytes, bytes, serializeFn, 'bytes');
  }

  static newJson(json: any): AnyValue<any> {
    const serializeFn: SerializeFn = (value) => {
      try {
        const bytes = encode(value);
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
    return ok(new AnyValue(category, value, null, typeName));
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
    if (typeof value === 'string') return 'string';
    if (typeof value === 'boolean') return 'bool';
    if (typeof value === 'number') {
      if (Number.isInteger(value)) return 'i64';
      return 'f64';
    }
    if (value instanceof Uint8Array) return 'bytes';
    if (Array.isArray(value)) return 'list';
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
    const primitives = ['string', 'bool', 'i8', 'i16', 'i32', 'i64', 'i128', 'u8', 'u16', 'u32', 'u64', 'u128', 'f32', 'f64', 'char'];
    return primitives.includes(typeName);
  }

  private static categoryFromByte(byte: number): ValueCategory | null {
    switch (byte) {
      case 0: return ValueCategory.Null;
      case 1: return ValueCategory.Primitive;
      case 2: return ValueCategory.List;
      case 3: return ValueCategory.Map;
      case 4: return ValueCategory.Struct;
      case 5: return ValueCategory.Bytes;
      case 6: return ValueCategory.Json;
      default: return null;
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

  // Serialization method matching Rust exactly
  serialize(context?: any): Result<Uint8Array> {
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
        wireName = 'list'; // TODO: Implement parameterized wire names
        break;
      case ValueCategory.Map:
        wireName = 'map'; // TODO: Implement parameterized wire names
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

    // Serialize the value
    const bytes = this.serializeFn(this.value, context?.keystore, context?.resolver);
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

  // Compatibility methods for existing tests
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
        return AnyValue.newList(value as any[]) as AnyValue<T>;
      case ValueCategory.Map:
        if (value instanceof Map) {
          return AnyValue.newMap(value) as AnyValue<T>;
        }
        // Convert object to Map for compatibility
        const map = new Map(Object.entries(value as Record<string, any>));
        return AnyValue.newMap(map) as AnyValue<T>;
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

  static fromBytes<T = unknown>(bytes: Uint8Array, ctx?: DeserializationContext): AnyValue<T> {
    const result = AnyValue.deserialize(bytes, ctx);
    if (!result.ok) {
      throw new Error(`Failed to deserialize: ${result.error.message}`);
    }
    return result.value as AnyValue<T>;
  }

  // Legacy methods for compatibility
  bytes(): Uint8Array | undefined {
    return undefined; // TODO: Implement when needed
  }
}

// Export the wire types

// Export the result types
export { ok, err } from './result.js';
export type { Result } from './result';

// Export the wire types
export { ValueCategory, readHeader, writeHeader, bodyOffset } from './wire.js';

// Helper function to determine category and wire name
function determineCategoryAndWireName(val: any): { category: ValueCategory; wireName: string } {
  if (val === null) return { category: ValueCategory.Null, wireName: 'null' };
  if (typeof val === 'boolean') return { category: ValueCategory.Primitive, wireName: 'bool' };
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return { category: ValueCategory.Primitive, wireName: 'int' };
    return { category: ValueCategory.Primitive, wireName: 'float' };
  }
  if (typeof val === 'string') return { category: ValueCategory.Primitive, wireName: 'string' };
  if (val instanceof Uint8Array) return { category: ValueCategory.Bytes, wireName: 'bytes' };
  if (Array.isArray(val)) return { category: ValueCategory.List, wireName: 'list' };
  if (typeof val === 'object') {
    // Check for decorator metadata
    if (val.constructor && val.constructor.name) {
      try {
        // TODO: Implement decorator metadata lookup when available
        // For now, fall back to default behavior
      } catch (e) {
        // If decorator module is not available, fall back to default
      }
    }
    return { category: ValueCategory.Struct, wireName: 'json' };
  }
  return { category: ValueCategory.Json, wireName: 'json' };
}

// Export function to serialize entities
export function serializeEntity(entity: any): Uint8Array {
  // Serialize the entity directly
  const av = AnyValue.from(entity);
  const result = av.serialize();
  return result.ok ? result.value : new Uint8Array();
}

// Export function to deserialize entities
export function deserializeEntity<T>(bytes: Uint8Array, ctx?: DeserializationContext): Result<T> {
  const av = AnyValue.fromBytes<T>(bytes, ctx);
  return av.as<T>();
}
