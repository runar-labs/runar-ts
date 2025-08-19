import { encode, decode } from 'cbor-x';
import { EncryptedClass, EncryptedField, PlainField, getEncryptedClassOptions, getFieldMetadata } from 'runar-ts-decorators';
import { loadRunarFfi } from 'runar-ts-ffi';
import { Result, ok, err } from './result';
import { ValueCategory, DeserializationContext, readHeader, writeHeader } from './wire';
export * from './result';
export * from './wire';
export * from './registry';

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
    // Header parsing is deferred until needed; we can parse here to set category/type if present.
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
      // For now, encode as CBOR payload w/o Rust header. Will replace with exact wire format writer next.
      const body = encode(this.valueInternal as any);
      // Placeholder header: Primitive
      const header = writeHeader({ category: ValueCategory.Primitive, isEncrypted: false });
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
    // Cache by requested type name key
    const key = 'type';
    if (this.cacheByType.has(key)) return ok(this.cacheByType.get(key) as U);

    try {
      if (this.valueInternal !== undefined) {
        const v = this.valueInternal as unknown as U;
        this.cacheByType.set(key, v);
        return ok(v);
      }
      if (!this.bytesInternal) return err(new Error('No bytes to decode'));
      // For now, skip header and decode CBOR body
      const hdr = readHeader(this.bytesInternal);
      let bodyOffset = 0;
      if (hdr.ok) {
        const typeLen = hdr.value.typeName ? new TextEncoder().encode(hdr.value.typeName).length : 0;
        bodyOffset = 3 + typeLen;
      } else {
        // Fallback: assume no header
        bodyOffset = 0;
      }
      const body = this.bytesInternal.subarray(bodyOffset);
      const decoded = decode(body) as U;
      this.valueInternal = decoded as unknown as T;
      this.cacheByType.set(key, decoded);
      return ok(decoded);
    } catch (e) {
      return err(e as Error);
    }
  }

  toJSON(): unknown {
    const r = this.as<unknown>();
    return r.ok ? r.value : undefined;
  }
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
      // default to encrypted unless PlainField
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


