import { encode, decode } from 'cbor-x';
import { EncryptedClass, EncryptedField, PlainField, getEncryptedClassOptions, getFieldMetadata } from 'runar-ts-decorators';
import { loadRunarFfi } from 'runar-ts-ffi';

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

// If needed, helpers for ValueUnion <-> CBOR can be added back later.

export class AnyValue<T = unknown> {
  private bytesInternal?: Uint8Array;
  private valueInternal?: T;

  private constructor(args: { bytes?: Uint8Array; value?: T }) {
    this.bytesInternal = args.bytes;
    this.valueInternal = args.value;
  }

  static from<T>(value: T): AnyValue<T> {
    return new AnyValue<T>({ value });
  }

  static fromBytes<T = unknown>(bytes: Uint8Array): AnyValue<T> {
    return new AnyValue<T>({ bytes });
  }

  serialize(): Uint8Array {
    if (!this.bytesInternal) {
      this.bytesInternal = encode(this.valueInternal as any);
    }
    return this.bytesInternal;
  }

  as<U = T>(): U {
    if (this.valueInternal === undefined) {
      this.valueInternal = decode(this.bytesInternal!) as T;
    }
    return this.valueInternal as unknown as U;
  }

  toJSON(): unknown {
    return this.as() as unknown;
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


