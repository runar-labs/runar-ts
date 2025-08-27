import { Result, ok, err } from './result.js';

// Common interface for serialization and functionality that should NOT be aware of platform differences
export interface CommonKeysInterface {
  // === ENVELOPE ENCRYPTION (WORKS ON BOTH) ===
  encryptWithEnvelope(
    data: Buffer, 
    networkId: string | null, 
    profilePublicKeys: Buffer[]
  ): Buffer;
  
  decryptEnvelope(eedCbor: Buffer): Buffer;
  
  // === UTILITY METHODS (BOTH PLATFORMS) ===
  ensureSymmetricKey(keyName: string): Buffer;
  setLabelMapping(mappingCbor: Buffer): void;
  setLocalNodeInfo(nodeInfoCbor: Buffer): void;
  
  // === CONFIGURATION (BOTH PLATFORMS) ===
  setPersistenceDir(dir: string): void;
  enableAutoPersist(enabled: boolean): void;
  wipePersistence(): Promise<void>;
  flushState(): Promise<void>;
  
  // === STATE QUERIES (BOTH PLATFORMS) ===
  getKeystoreState(): number; // Common method, not platform-specific
  
  // === CAPABILITIES ===
  getKeystoreCaps(): any; // DeviceKeystoreCaps type
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

export interface SerializationContext {
  keystore?: CommonKeysInterface;
  resolver?: any;
}

export interface DeserializationContext {
  // Placeholder for label resolver, key info, etc.
  // Actual fields will be aligned with Rust serializer context once FFI is wired
  labelResolverName?: string;
  keystore?: CommonKeysInterface;
  decryptEnvelope?: (eed: Uint8Array) => Result<Uint8Array>;
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
    return err(new Error('Invalid header: too short'));
  }
  const category = bytes[0] as ValueCategory;
  const encFlag = bytes[1];
  const typeLen = bytes[2];
  if (category > ValueCategory.Json) {
    return err(new Error('Invalid category'));
  }
  if (typeLen > 0) {
    const start = 3;
    const end = 3 + typeLen;
    if (end > bytes.length) {
      return err(new Error('Invalid type name length'));
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
