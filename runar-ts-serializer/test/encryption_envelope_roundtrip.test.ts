import { describe, it, expect } from 'bun:test';
import { AnyValue, ValueCategory, writeHeader } from '../src';
import { createKeys, freeKeys, encryptWithEnvelope, decryptEnvelope, nodeGetPublicKey, setPersistenceDir, enableAutoPersist, registerLinuxDeviceKeystore, mobileInitializeUserRootKey, mobileGenerateNetworkDataKey, mobileGetNetworkPublicKey, mobileDeriveUserProfileKey, nodeGenerateCsr, mobileCreateNetworkKeyMessage, nodeInstallNetworkKey, flushState } from 'runar-ts-ffi/src/keys';

describe('Envelope encrypt/decrypt via FFI (smoke)', () => {
  it('encrypts and decrypts a small payload with at least one profile recipient', () => {
    const keys = createKeys();
    try {
      // Register Linux keystore + persistence
      setPersistenceDir(keys, '/tmp/runar-keys-test');
      enableAutoPersist(keys, true);
      registerLinuxDeviceKeystore(keys, 'com.runar.keys', 'state.aead.v1');

      // Mobile setup: root key and network generation
      mobileInitializeUserRootKey(keys);
      const networkId = mobileGenerateNetworkDataKey(keys);
      const networkPub = mobileGetNetworkPublicKey(keys, networkId);
      mobileDeriveUserProfileKey(keys, 'user');

      // Node CSR → NKM → install
      const csr = nodeGenerateCsr(keys);
      const nkm = mobileCreateNetworkKeyMessage(keys, networkId, csr);
      nodeInstallNetworkKey(keys, nkm);
      flushState(keys);

      const payload = new TextEncoder().encode('hello');
      const eed = encryptWithEnvelope(keys, payload, networkId, []);
      const plain = decryptEnvelope(keys, eed);
      expect(new TextDecoder().decode(plain)).toBe('hello');
    } finally {
      freeKeys(keys);
    }
  });
});


