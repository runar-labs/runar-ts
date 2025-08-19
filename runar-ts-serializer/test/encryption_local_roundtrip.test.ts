import { describe, it, expect, skip } from 'bun:test';
import { openEncryptionFfi } from 'runar-ts-ffi/src/index';
// We only test presence of symbols to ensure FFI loads; full roundtrip needs keys setup not ready yet

describe('FFI encryption symbols load', () => {
  it('loads encryption symbol map', () => {
    const lib = openEncryptionFfi();
    expect(typeof lib.symbols.rn_keys_encrypt_local_data).toBe('function');
    expect(typeof lib.symbols.rn_free).toBe('function');
  });
});


