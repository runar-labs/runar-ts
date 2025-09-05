import { Result, ok, err } from 'runar-ts-common/src/error/Result';
import { ValueCategory } from './value_category';

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
