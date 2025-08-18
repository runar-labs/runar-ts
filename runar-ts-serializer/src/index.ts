import { encode, decode } from 'cbor-x';
import { EncryptedClass, EncryptedField, PlainField, getEncryptedClassOptions, getFieldMetadata } from 'runar-ts-decorators';
import { loadRunarFfi } from 'runar-ts-ffi';

export type AnyValue =
  | { type: 'null' }
  | { type: 'bool'; value: boolean }
  | { type: 'int'; value: number }
  | { type: 'float'; value: number }
  | { type: 'string'; value: string }
  | { type: 'bytes'; value: Uint8Array }
  | { type: 'array'; value: AnyValue[] }
  | { type: 'map'; value: Record<string, AnyValue> };

export class ArcValue<T = unknown> {
  private readonly bytes: Uint8Array;
  private decoded: T | undefined;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  static from<T>(value: T): ArcValue<T> {
    const bytes = encode(value as any);
    return new ArcValue<T>(bytes);
  }

  serialize(): Uint8Array {
    return this.bytes;
  }

  as(): T {
    if (this.decoded === undefined) {
      this.decoded = decode(this.bytes) as T;
    }
    return this.decoded;
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
  // Envelope encryption will be wired via FFI later; return canonical for now
  return canonical;
}

export function deserializeEntity<T>(buf: Uint8Array): T {
  const obj = decode(buf) as any;
  return obj as T;
}

// Helper CBOR encode/decode wrappers
export function toCbor(value: unknown): Uint8Array {
  return encode(value as any);
}

export function fromCbor<T>(data: Uint8Array): T {
  return decode(data) as T;
}


