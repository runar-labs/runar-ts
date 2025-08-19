import { describe, it, expect } from 'bun:test';
import { createKeys, freeKeys, nodeGetPublicKey } from 'runar-ts-ffi/src/keys';

describe('FFI keys smoke', () => {
  it('creates keys and gets public key', () => {
    const keys = createKeys();
    try {
      const pk = nodeGetPublicKey(keys);
      expect(pk.length).toBeGreaterThan(0);
    } finally {
      freeKeys(keys);
    }
  });
});


