import { describe, it, expect } from 'bun:test';
import { AnyValue, ValueCategory, writeHeader } from '../src';
import { createKeys, freeKeys, encryptWithEnvelope, decryptEnvelope, nodeGetPublicKey } from 'runar-ts-ffi/src/keys';

describe('Envelope encrypt/decrypt via FFI (smoke)', () => {
  it('encrypts and decrypts a small payload with at least one profile recipient', () => {
    const keys = createKeys();
    try {
      const payload = new TextEncoder().encode('hello');
      const pk = nodeGetPublicKey(keys);
      const eed = encryptWithEnvelope(keys, payload, null, [pk]);
      const plain = decryptEnvelope(keys, eed);
      expect(new TextDecoder().decode(plain)).toBe('hello');
    } finally {
      freeKeys(keys);
    }
  });
});


