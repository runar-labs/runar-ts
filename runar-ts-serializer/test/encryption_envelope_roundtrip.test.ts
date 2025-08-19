import { describe, it, expect } from 'bun:test';
import { AnyValue, ValueCategory, writeHeader } from '../src';
import { createKeys, freeKeys, encryptWithEnvelope, decryptEnvelope, nodeGetPublicKey } from 'runar-ts-ffi/src/keys';

describe('Envelope encrypt/decrypt via FFI (smoke)', () => {
  it('encrypts and decrypts a small payload without network/profile recipients', () => {
    const keys = createKeys();
    try {
      const payload = new TextEncoder().encode('hello');
      const eed = encryptWithEnvelope(keys, payload, null, []);
      const plain = decryptEnvelope(keys, eed);
      expect(new TextDecoder().decode(plain)).toBe('hello');
    } finally {
      freeKeys(keys);
    }
  });
});


