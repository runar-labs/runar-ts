import { encode, decode } from 'cbor-x';
import type { Keys } from 'runar-nodejs-api';
import { Result, ok, err } from './result';
import { ValueCategory, DeserializationContext, WireHeader, readHeader, writeHeader, bodyOffset } from './wire';
export type { DeserializationContext, WireHeader } from './wire';
import { resolveType, initWirePrimitives, resolvePrimitive, registerType, clearRegistry } from './registry';

// Re-export registry functions
export { registerType, clearRegistry, resolveType, resolvePrimitive } from './registry';

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

export class AnyValue<T = unknown> {
  private bytesInternal?: Uint8Array;
  private valueInternal?: T;
  private categoryInternal?: ValueCategory;
  private typeNameInternal?: string;
  private lazyCtx?: DeserializationContext;
  private cacheByType: Map<string, unknown> = new Map();

  private constructor(args: { bytes?: Uint8Array; value?: T; ctx?: DeserializationContext }) {
    this.bytesInternal = args.bytes;
    this.valueInternal = args.value;
    this.lazyCtx = args.ctx;
  }

  static from<T>(value: T): AnyValue<T> {
    return new AnyValue<T>({ value });
  }

  static fromBytes<T = unknown>(bytes: Uint8Array, ctx?: DeserializationContext): AnyValue<T> {
    const inst = new AnyValue<T>({ bytes, ctx });
    const hdr = readHeader(bytes);
    if (hdr.ok) {
      inst.categoryInternal = hdr.value.category;
      inst.typeNameInternal = hdr.value.typeName;
    }
    return inst;
  }

  category(): ValueCategory | undefined {
    return this.categoryInternal;
  }

  isNull(): boolean {
    if (this.valueInternal === null) return true;
    if (this.categoryInternal === ValueCategory.Null) return true;
    return false;
  }

  serialize(): Result<Uint8Array> {
    if (this.bytesInternal) return ok(this.bytesInternal);
    try {
      const val: any = this.valueInternal;
      const { category, wireName } = determineCategoryAndWireName(val);
      const body = encode(val);
      const header = writeHeader({ category, isEncrypted: false, typeName: wireName });
      const merged = new Uint8Array(header.length + body.length);
      merged.set(header, 0);
      merged.set(body, header.length);
      this.bytesInternal = merged;
      return ok(merged);
    } catch (e) {
      return err(e as Error);
    }
  }

  as<U = T>(): Result<U> {
    const key = 'type';
    if (this.cacheByType.has(key)) return ok(this.cacheByType.get(key) as U);

    try {
      if (this.valueInternal !== undefined) {
        const v = this.valueInternal as unknown as U;
        this.cacheByType.set(key, v);
        return ok(v);
      }
      if (!this.bytesInternal) return err(new Error('No bytes to decode'));
      const hdr = readHeader(this.bytesInternal);
      const offset = hdr.ok ? bodyOffset(this.bytesInternal) : 0;
      let body = this.bytesInternal.subarray(offset);

      // Encrypted path: decrypt via embedded ctx then decode
      if (hdr.ok && hdr.value.category === ValueCategory.Encrypted) {
        if (!this.lazyCtx?.decryptEnvelope) {
          return err(new Error('Missing decrypt context'));
        }
        const dec = this.lazyCtx.decryptEnvelope(body);
        if (!dec.ok) return err(dec.error);
        body = dec.value;
      }

      // Decode the body
      try {
        const decoded = decode(body);
        const v = decoded as unknown as U;
        this.cacheByType.set(key, v);
        return ok(v);
      } catch (e) {
        return err(e as Error);
      }
    } catch (e) {
      return err(e as Error);
    }
  }

  bytes(): Uint8Array | undefined {
    return this.bytesInternal;
  }

  typeName(): string | undefined {
    return this.typeNameInternal;
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
        // Import getMetadata dynamically to avoid circular dependencies
        const { getMetadata } = require('runar-ts-decorators');
        const metadata = getMetadata(val.constructor.name);
        if (metadata && metadata.typeName) {
          return { category: ValueCategory.Struct, wireName: metadata.typeName };
        }
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
  const ctor = entity.constructor;
  // Removed getEncryptedClassOptions and getFieldMetadata as they are no longer imported
  const classOpts = {}; // Placeholder, as getEncryptedClassOptions is removed
  const fields: Array<{ key: string | symbol; options?: any; plain?: boolean }> = []; // Placeholder, as getFieldMetadata is removed
  const plain: Record<string, unknown> = {};
  const encryptedPayload: Record<string, unknown> = {};

  // Process fields based on metadata
  for (const [key, value] of Object.entries(entity)) {
    const fieldMeta = fields.find(f => String(f.key) === key);
    if (fieldMeta?.plain) {
      plain[key] = value;
    } else {
      encryptedPayload[key] = value;
    }
  }

  // Serialize the entity
  const av = AnyValue.from(entity);
  const result = av.serialize();
  return result.ok ? result.value : new Uint8Array();
}

// Export function to deserialize entities
export function deserializeEntity<T>(bytes: Uint8Array, ctx?: DeserializationContext): Result<T> {
  const av = AnyValue.fromBytes<T>(bytes, ctx);
  return av.as<T>();
}
