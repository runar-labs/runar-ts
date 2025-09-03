import { Result, ok, err } from 'runar-ts-common/src/error/Result.js';

// Device capabilities interface as specified in Section 25.5
export interface DeviceKeystoreCaps {
  readonly canEncrypt: boolean;
  readonly canDecrypt: boolean;
  readonly hasNetworkKeys: boolean;
  readonly hasProfileKeys: boolean;
}

// Common interface for serialization and functionality that should NOT be aware of platform differences
export interface CommonKeysInterface {
  // === CORE SERIALIZER METHODS (Section 25.5) ===
  encryptWithEnvelope(
    data: Uint8Array,
    networkPublicKey: Uint8Array | undefined | null,
    profilePublicKeys: Uint8Array[]
  ): Uint8Array;

  decryptEnvelope(eedCbor: Uint8Array): Uint8Array;

  getKeystoreState(): number;

  getKeystoreCaps(): DeviceKeystoreCaps;

  // === ADMINISTRATIVE/UTILITY METHODS (Section 25.5) ===
  ensureSymmetricKey(keyName: string): Uint8Array;
  setLocalNodeInfo(nodeInfoCbor: Uint8Array): void;
  setPersistenceDir(dir: string): void;
  enableAutoPersist(enabled: boolean): void;
  wipePersistence(): Promise<void>;
  flushState(): Promise<void>;
  setLabelMapping(label: string, networkPublicKey?: Uint8Array, userKeySpec?: unknown): void;
}

// Value categories exactly matching Rust runar-serializer
export enum ValueCategory {
  Null = 0,
  Primitive = 1,
  List = 2,
  Map = 3,
  Struct = 4,
  Bytes = 5,
  Json = 6,
}

export class SerializationContext {
  constructor(
    public keystore: CommonKeysInterface,
    public resolver: import('./label_resolver.js').LabelResolver,
    public networkPublicKey: Uint8Array,
    public profilePublicKeys: Uint8Array[]
  ) {}
}

export class DeserializationContext {
  constructor(
    public keystore?: CommonKeysInterface,
    public resolver?: import('./label_resolver.js').LabelResolver,
    public decryptEnvelope?: (eed: Uint8Array) => Result<Uint8Array>
  ) {}
}

/**
 * Lazy data holder for complex types that are not immediately deserialized
 */
export class LazyDataWithOffset {
  constructor(
    public typeName: string,
    public originalBuffer: Uint8Array,
    public encrypted: boolean,
    public startOffset?: number,
    public endOffset?: number,
    public keystore?: CommonKeysInterface
  ) {}
}

export interface WireHeader {
  category: ValueCategory;
  isEncrypted: boolean;
  typeName?: string; // present for Struct/Encrypted and primitives with wire names per spec
  // Byte offsets/lengths if needed later
}

// Minimal wire reader/writer scaffolding; will be extended to match Rust byte-for-byte
export function readHeader(bytes: Uint8Array): Result<WireHeader> {
  if (bytes.length < 3) {
    return err(new Error('Header too short: expected at least 3 bytes'));
  }
  const category = bytes[0] as ValueCategory;
  const encFlag = bytes[1];
  const typeLen = bytes[2];
  if (category > ValueCategory.Json) {
    return err(new Error(`Invalid category: ${category} (expected 0-6)`));
  }
  if (typeLen > 0) {
    const start = 3;
    const end = 3 + typeLen;
    if (end > bytes.length) {
      return err(new Error('Type name length exceeds available data'));
    }
    const typeName = new TextDecoder().decode(bytes.subarray(start, end));
    return ok({ category, isEncrypted: encFlag !== 0, typeName });
  }
  return ok({ category, isEncrypted: encFlag !== 0 });
}

export function bodyOffset(bytes: Uint8Array): number {
  if (bytes.length < 3) return 0;
  const typeLen = bytes[2];
  return 3 + typeLen;
}

export function writeHeader(h: WireHeader): Uint8Array {
  const typeBytes = h.typeName ? new TextEncoder().encode(h.typeName) : new Uint8Array();
  const buf = new Uint8Array(3 + typeBytes.length);
  buf[0] = h.category;
  buf[1] = h.isEncrypted ? 1 : 0;
  buf[2] = typeBytes.length;
  if (typeBytes.length) buf.set(typeBytes, 3);
  return buf;
}
