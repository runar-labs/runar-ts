import { encode, decode } from 'cbor-x';
import { EncryptedClass, EncryptedField, PlainField, getEncryptedClassOptions, getFieldMetadata, getTypeName as getDecoratedTypeName } from 'runar-ts-decorators';
import { loadRunarFfi } from 'runar-ts-ffi';
import { Result, ok, err } from './result';
import { ValueCategory, DeserializationContext, readHeader, writeHeader, bodyOffset } from './wire';
import { resolveType, initWirePrimitives, resolvePrimitive } from './registry';
export * from './result';
export * from './wire';
export * from './registry';

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

      let decoded: any = decode(body);
      // Primitive mapping by wire name if provided
      if (hdr.ok && hdr.value.typeName) {
        const prim = resolvePrimitive(hdr.value.typeName);
        if (prim) decoded = prim(decoded);
      }
      if (hdr.ok && hdr.value.typeName && !resolvePrimitive(hdr.value.typeName)) {
        const entry = resolveType(hdr.value.typeName);
        if (entry && entry.ctor) {
          try {
            const instance = new (entry.ctor as any)();
            Object.assign(instance, decoded);
            decoded = instance;
          } catch (_) {
            // Fallback to plain decoded object
          }
        }
      }
      this.valueInternal = decoded as unknown as T;
      this.cacheByType.set(key, decoded as U);
      return ok(decoded as U);
    } catch (e) {
      return err(e as Error);
    }
  }

  toJSON(): unknown {
    const r = this.as<unknown>();
    return r.ok ? r.value : undefined;
  }
}

function determineCategoryAndWireName(val: any): { category: ValueCategory; wireName?: string } {
  if (val === null || val === undefined) return { category: ValueCategory.Null, wireName: 'null' };
  if (val instanceof Uint8Array) return { category: ValueCategory.Bytes, wireName: 'bytes' };
  const t = typeof val;
  if (t === 'string') return { category: ValueCategory.Primitive, wireName: 'string' };
  if (t === 'boolean') return { category: ValueCategory.Primitive, wireName: 'bool' };
  if (t === 'number') {
    // Future: detect integer ranges for i32/u32 vs f64
    return { category: ValueCategory.Primitive, wireName: 'f64' };
  }
  if (Array.isArray(val)) return { category: ValueCategory.List, wireName: 'list' };
  if (t === 'object') {
    const tn = getDecoratedTypeName(val.constructor);
    if (tn) return { category: ValueCategory.Struct, wireName: tn };
    return { category: ValueCategory.Json, wireName: 'json' };
  }
  return { category: ValueCategory.Json, wireName: 'json' };
}

export function serializeEntity(entity: any): Uint8Array {
  const ctor = entity.constructor;
  const classOpts = getEncryptedClassOptions(ctor) ?? {};
  const fields = getFieldMetadata(ctor);
  const plain: Record<string, unknown> = {};
  const encryptedPayload: Record<string, unknown> = {};

  for (const key of Object.keys(entity)) {
    const fieldMeta = fields.find((f) => String(f.key) === key);
    if (!fieldMeta) {
      encryptedPayload[key] = entity[key];
      continue;
    }
    if ((fieldMeta as any).plain) {
      plain[key] = entity[key];
    } else {
      encryptedPayload[key] = entity[key];
    }
  }

  const canonical = encode({ v: 1, m: classOpts, p: plain, e: encryptedPayload });
  return canonical;
}

export function deserializeEntity<T>(buf: Uint8Array): T {
  const obj = decode(buf) as any;
  return obj as T;
}

// Helper CBOR encode/decode wrappers (internal transitions only; wire format is separate)
export function toCbor(value: unknown): Uint8Array {
  return encode(value as any);
}

export function fromCbor<T>(data: Uint8Array): T {
  return decode(data) as T;
}


