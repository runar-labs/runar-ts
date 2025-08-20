import { describe, it, expect } from 'bun:test';
import {
  createKeys, freeKeys,
  setPersistenceDir, enableAutoPersist, registerLinuxDeviceKeystore, flushState,
  mobileInitializeUserRootKey, mobileGenerateNetworkDataKey, mobileGetNetworkPublicKey, mobileDeriveUserProfileKey,
  nodeGenerateCsr, mobileCreateNetworkKeyMessage, nodeInstallNetworkKey,
} from 'runar-ts-ffi/src/keys';

describe('FFI setup steps (isolation)', () => {
  it('step1: create keys', () => {
    const keys = createKeys();
    freeKeys(keys);
    expect(1).toBe(1);
  });

  it('step2: persistence + register keystore', () => {
    const keys = createKeys();
    try {
      setPersistenceDir(keys, '/tmp/runar-keys-test');
      enableAutoPersist(keys, true);
      registerLinuxDeviceKeystore(keys, 'com.runar.keys', 'state.aead.v1');
    } finally {
      freeKeys(keys);
    }
    expect(1).toBe(1);
  });

  it('step3a: mobile initialize user root key', () => {
    const keys = createKeys();
    try {
      setPersistenceDir(keys, '/tmp/runar-keys-test');
      enableAutoPersist(keys, true);
      registerLinuxDeviceKeystore(keys, 'com.runar.keys', 'state.aead.v1');
      mobileInitializeUserRootKey(keys);
    } finally {
      freeKeys(keys);
    }
    expect(1).toBe(1);
  });

  it('step3b: generate network id and get public key', () => {
    const keys = createKeys();
    try {
      setPersistenceDir(keys, '/tmp/runar-keys-test');
      enableAutoPersist(keys, true);
      registerLinuxDeviceKeystore(keys, 'com.runar.keys', 'state.aead.v1');
      mobileInitializeUserRootKey(keys);
      const networkId = mobileGenerateNetworkDataKey(keys);
      const _netPub = mobileGetNetworkPublicKey(keys, networkId);
    } finally {
      freeKeys(keys);
    }
    expect(1).toBe(1);
  });

  it('step3c: derive user profile key', () => {
    const keys = createKeys();
    try {
      setPersistenceDir(keys, '/tmp/runar-keys-test');
      enableAutoPersist(keys, true);
      registerLinuxDeviceKeystore(keys, 'com.runar.keys', 'state.aead.v1');
      mobileInitializeUserRootKey(keys);
      const _profilePk = mobileDeriveUserProfileKey(keys, 'user');
    } finally {
      freeKeys(keys);
    }
    expect(1).toBe(1);
  });

  it('step4: CSR → NKM → install → flush', () => {
    const keys = createKeys();
    try {
      setPersistenceDir(keys, '/tmp/runar-keys-test');
      enableAutoPersist(keys, true);
      registerLinuxDeviceKeystore(keys, 'com.runar.keys', 'state.aead.v1');
      mobileInitializeUserRootKey(keys);
      const networkId = mobileGenerateNetworkDataKey(keys);
      const csr = nodeGenerateCsr(keys);
      const nkm = mobileCreateNetworkKeyMessage(keys, networkId, csr);
      nodeInstallNetworkKey(keys, nkm);
      flushState(keys);
    } finally {
      freeKeys(keys);
    }
    expect(1).toBe(1);
  });
});


