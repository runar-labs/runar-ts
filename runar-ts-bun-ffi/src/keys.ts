import { RunarFfiError, openEncryptionFfi } from './index';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { ptr, toArrayBuffer } from 'bun:ffi';

const f = (openEncryptionFfi() as any).symbols as any;

export type KeysPtr = number; // Bun pointers are numbers per docs

function lastError(): string {
  const buf = new Uint8Array(1024);
  f.rn_last_error(ptr(buf), buf.length);
  const s = new TextDecoder().decode(buf);
  const n = s.indexOf('\u0000');
  return n >= 0 ? s.slice(0, n) : s;
}

export function createKeys(): KeysPtr {
  const err = new Uint8Array(24);
  const raw = f.rn_keys_new_return(ptr(err)) as number;
  if (!raw) {
    throw new RunarFfiError(`rn_keys_new returned invalid pointer`);
  }
  return raw;
}

export function freeKeys(_ptr: KeysPtr): void {
  f.rn_keys_free(_ptr);
}

export function setPersistenceDir(keys: KeysPtr, dir: string): void {
  const err = new Uint8Array(24);
  const cstr = new Uint8Array([...new TextEncoder().encode(dir), 0]);
  const rc = f.rn_keys_set_persistence_dir(keys, ptr(cstr), ptr(err));
  if (rc !== 0) throw new RunarFfiError(`set_persistence_dir failed: ${lastError()}`, rc);
}

export function enableAutoPersist(keys: KeysPtr, enabled: boolean): void {
  const err = new Uint8Array(24);
  const rc = f.rn_keys_enable_auto_persist(keys, enabled, ptr(err));
  if (rc !== 0) throw new RunarFfiError(`enable_auto_persist failed: ${lastError()}`, rc);
}

export function flushState(keys: KeysPtr): void {
  const err = new Uint8Array(24);
  const rc = f.rn_keys_flush_state(keys, ptr(err));
  if (rc !== 0) throw new RunarFfiError(`flush_state failed: ${lastError()}`, rc);
}

export function wipePersistence(keys: KeysPtr): void {
  const err = new Uint8Array(24);
  const rc = f.rn_keys_wipe_persistence(keys, ptr(err));
  if (rc !== 0) throw new RunarFfiError(`wipe_persistence failed: ${lastError()}`, rc);
}

export function registerLinuxDeviceKeystore(keys: KeysPtr, service: string, account: string): void {
  const err = new Uint8Array(24);
  const svc = new Uint8Array([...new TextEncoder().encode(service), 0]);
  const acc = new Uint8Array([...new TextEncoder().encode(account), 0]);
  const rc = f.rn_keys_register_linux_device_keystore(keys, ptr(svc), ptr(acc), ptr(err));
  if (rc !== 0) throw new RunarFfiError(`register_linux_device_keystore failed: ${lastError()}`, rc);
}

export function mobileInstallNetworkPublicKey(keys: KeysPtr, networkPublicKey: Uint8Array): void {
  const err = new Uint8Array(24);
  const rc = f.rn_keys_mobile_install_network_public_key(keys, ptr(networkPublicKey), networkPublicKey.length, ptr(err));
  if (rc !== 0) throw new RunarFfiError(`mobile_install_network_public_key failed: ${lastError()}`, rc);
}

export function mobileGenerateNetworkDataKey(keys: KeysPtr): string {
  const outPtr = new BigUint64Array(1);
  const outLen = new BigUint64Array(1);
  const err = new Uint8Array(24);
  const rc = f.rn_keys_mobile_generate_network_data_key(keys, ptr(outPtr), ptr(outLen), ptr(err));
  if (rc !== 0) throw new RunarFfiError(`mobile_generate_network_data_key failed: ${lastError()}`, rc);
  const len = Number(outLen[0]);
  const view = new Uint8Array(toArrayBuffer(Number(outPtr[0]), 0, len));
  const s = new TextDecoder().decode(view);
  f.rn_string_free(Number(outPtr[0]));
  return s;
}

export function mobileGenerateNetworkDataKeyMock(keys: KeysPtr): string {
  const outPtr = new BigUint64Array(1);
  const outLen = new BigUint64Array(1);
  // Try passing null err to rule out struct write issues
  const rc = f.rn_keys_mobile_generate_network_data_key_mock(keys, ptr(outPtr), ptr(outLen), 0);
  if (rc !== 0) throw new RunarFfiError(`mobile_generate_network_data_key_mock failed: ${lastError()}`, rc);
  const len = Number(outLen[0]);
  const view = new Uint8Array(toArrayBuffer(Number(outPtr[0]), 0, len));
  const s = new TextDecoder().decode(view);
  f.rn_string_free(Number(outPtr[0]));
  return s;
}

export function mobileGenerateNetworkDataKeyMockDataView(keys: KeysPtr): string {
  const bufPtr = new ArrayBuffer(8);
  const bufLen = new ArrayBuffer(8);
  const dvPtr = new DataView(bufPtr);
  const dvLen = new DataView(bufLen);
  const rc = f.rn_keys_mobile_generate_network_data_key_mock(keys, dvPtr, dvLen, 0);
  if (rc !== 0) throw new RunarFfiError(`mobile_generate_network_data_key_mock(dv) failed: ${lastError()}`, rc);
  const ptrNum = Number((dvPtr.getBigUint64 as any).call(dvPtr, 0, true));
  const lenNum = Number((dvLen.getBigUint64 as any).call(dvLen, 0, true));
  const view = new Uint8Array(toArrayBuffer(ptrNum, 0, lenNum));
  const s = new TextDecoder().decode(view);
  f.rn_string_free(ptrNum);
  return s;
}

export function testCStringOutPPP(keys: KeysPtr): string {
  const outPtr = new BigUint64Array(1);
  const outLen = new BigUint64Array(1);
  const rc = f.rn_test_cstring_out_ppp(keys, ptr(outPtr), ptr(outLen));
  if (rc !== 0) throw new RunarFfiError(`rn_test_cstring_out_ppp failed: ${lastError()}`, rc);
  const len = Number(outLen[0]);
  const view = new Uint8Array(toArrayBuffer(Number(outPtr[0]), 0, len));
  const s = new TextDecoder().decode(view);
  f.rn_string_free(Number(outPtr[0]));
  return s;
}

export function testCStringOutPP(): string {
  const outPtr = new BigUint64Array(1);
  const outLen = new BigUint64Array(1);
  const rc = f.rn_test_cstring_out_pp(ptr(outPtr), ptr(outLen));
  if (rc !== 0) throw new RunarFfiError(`rn_test_cstring_out_pp failed: ${lastError()}`, rc);
  const len = Number(outLen[0]);
  const view = new Uint8Array(toArrayBuffer(Number(outPtr[0]), 0, len));
  const s = new TextDecoder().decode(view);
  f.rn_string_free(Number(outPtr[0]));
  return s;
}

export function testCStringReturn(): string {
  const s = f.rn_test_cstring_return() as string;
  return s;
}

export function mobileGenerateNetworkDataKeyReturn(keys: KeysPtr): string {
  const s = f.rn_keys_mobile_generate_network_data_key_return(keys) as string;
  return s;
}

export function mobileGenerateNetworkDataKeyBytes(keys: KeysPtr): string {
  const outPtr = new BigUint64Array(1);
  const outLen = new BigUint64Array(1);
  const err = new Uint8Array(24);
  const rc = f.rn_keys_mobile_generate_network_data_key_bytes(keys, ptr(outPtr), ptr(outLen), ptr(err));
  if (rc !== 0) throw new RunarFfiError(`mobile_generate_network_data_key_bytes failed: ${lastError()}`, rc);
  const len = Number(outLen[0]);
  const view = new Uint8Array(toArrayBuffer(Number(outPtr[0]), 0, len));
  const s = new TextDecoder().decode(view);
  f.rn_free(Number(outPtr[0]), len);
  return s;
}

export function mobileGetNetworkPublicKey(keys: KeysPtr, networkId: string): Uint8Array {
  const outPtr = new BigUint64Array(1);
  const outLen = new BigUint64Array(1);
  const err = new Uint8Array(24);
  const nid = new Uint8Array([...new TextEncoder().encode(networkId), 0]);
  const rc = f.rn_keys_mobile_get_network_public_key(keys, ptr(nid), ptr(outPtr), ptr(outLen), ptr(err));
  if (rc !== 0) throw new RunarFfiError(`mobile_get_network_public_key failed: ${lastError()}`, rc);
  const len = Number(outLen[0]);
  const view = new Uint8Array(toArrayBuffer(Number(outPtr[0]), 0, len));
  const bytes = new Uint8Array(view);
  f.rn_free(Number(outPtr[0]), len);
  return bytes;
}

export function mobileCreateNetworkKeyMessage(keys: KeysPtr, networkId: string, nodeAgreementPk: Uint8Array): Uint8Array {
  const outPtr = new BigUint64Array(1);
  const outLen = new BigUint64Array(1);
  const err = new Uint8Array(24);
  const nid = new Uint8Array([...new TextEncoder().encode(networkId), 0]);
  const rc = f.rn_keys_mobile_create_network_key_message(keys, ptr(nid), ptr(nodeAgreementPk), nodeAgreementPk.length, ptr(outPtr), ptr(outLen), ptr(err));
  if (rc !== 0) throw new RunarFfiError(`mobile_create_network_key_message failed: ${lastError()}`, rc);
  const len = Number(outLen[0]);
  const view = new Uint8Array(toArrayBuffer(Number(outPtr[0]), 0, len));
  const bytes = new Uint8Array(view);
  f.rn_free(Number(outPtr[0]), len);
  return bytes;
}

export function nodeInstallNetworkKey(keys: KeysPtr, msgCbor: Uint8Array): void {
  const err = new Uint8Array(24);
  const rc = f.rn_keys_node_install_network_key(keys, ptr(msgCbor), msgCbor.length, ptr(err));
  if (rc !== 0) throw new RunarFfiError(`node_install_network_key failed: ${lastError()}`, rc);
}

export function mobileGetKeystoreState(keys: KeysPtr): number {
  const out = new Int32Array(1);
  const err = new Uint8Array(24);
  const rc = f.rn_keys_mobile_get_keystore_state(keys, ptr(out), ptr(err));
  if (rc !== 0) throw new RunarFfiError(`mobile_get_keystore_state failed: ${lastError()}`, rc);
  return out[0] as number;
}

export function nodeGetKeystoreState(keys: KeysPtr): number {
  const out = new Int32Array(1);
  const err = new Uint8Array(24);
  const rc = f.rn_keys_node_get_keystore_state(keys, ptr(out), ptr(err));
  if (rc !== 0) throw new RunarFfiError(`node_get_keystore_state failed: ${lastError()}`, rc);
  return out[0] as number;
}

export function getKeystoreCaps(keys: KeysPtr): { version: number; flags: number } {
  const caps = new Uint32Array(2);
  const err = new Uint8Array(24);
  const rc = f.rn_keys_get_keystore_caps(keys, ptr(caps), ptr(err));
  if (rc !== 0) throw new RunarFfiError(`get_keystore_caps failed: ${lastError()}`, rc);
  return { version: caps[0]!, flags: caps[1]! };
}

export function nodeGenerateCsr(keys: KeysPtr): Uint8Array {
  const outPtr = new BigUint64Array(1);
  const outLen = new BigUint64Array(1);
  const err = new Uint8Array(24);
  const rc = f.rn_keys_node_generate_csr(keys, ptr(outPtr), ptr(outLen), ptr(err));
  if (rc !== 0) {
    throw new RunarFfiError(`node_generate_csr failed: ${lastError()}`, rc);
  }
  const len = Number(outLen[0]);
  const view = new Uint8Array(toArrayBuffer(Number(outPtr[0]), 0, len));
  const bytes = new Uint8Array(view);
  f.rn_free(Number(outPtr[0]), len);
  return bytes;
}

export function mobileProcessSetupToken(keys: KeysPtr, setupTokenCbor: Uint8Array): Uint8Array {
  const outPtr = new BigUint64Array(1);
  const outLen = new BigUint64Array(1);
  const err = new Uint8Array(24);
  const rc = f.rn_keys_mobile_process_setup_token(
    keys,
    ptr(setupTokenCbor),
    setupTokenCbor.length,
    ptr(outPtr),
    ptr(outLen),
    ptr(err),
  );
  if (rc !== 0) {
    throw new RunarFfiError(`mobile_process_setup_token failed: ${lastError()}`, rc);
  }
  const len = Number(outLen[0]);
  const view = new Uint8Array(toArrayBuffer(Number(outPtr[0]), 0, len));
  const bytes = new Uint8Array(view);
  f.rn_free(Number(outPtr[0]), len);
  return bytes;
}

export function nodeInstallCertificate(keys: KeysPtr, certMessageCbor: Uint8Array): void {
  const err = new Uint8Array(24);
  const rc = f.rn_keys_node_install_certificate(keys, ptr(certMessageCbor), certMessageCbor.length, ptr(err));
  if (rc !== 0) {
    throw new RunarFfiError(`node_install_certificate failed: ${lastError()}`, rc);
  }
}

// testInstallLocalNetwork removed; use explicit public APIs instead

export function mobileInitializeUserRootKey(keys: KeysPtr): void {
  const err = new Uint8Array(24);
  const rc = f.rn_keys_mobile_initialize_user_root_key(keys, ptr(err));
  if (rc !== 0) {
    throw new RunarFfiError(`mobile_initialize_user_root_key failed: ${lastError()}`, rc);
  }
}

export function mobileDeriveUserProfileKey(keys: KeysPtr, label: string): Uint8Array {
  const outPtr = new BigUint64Array(1);
  const outLen = new BigUint64Array(1);
  const err = new Uint8Array(24);
  const cstr = new Uint8Array([...new TextEncoder().encode(label), 0]);
  const rc = f.rn_keys_mobile_derive_user_profile_key(keys, ptr(cstr), ptr(outPtr), ptr(outLen), ptr(err));
  if (rc !== 0) {
    throw new RunarFfiError(`mobile_derive_user_profile_key failed: ${lastError()}`, rc);
  }
  const len = Number(outLen[0]);
  const view = new Uint8Array(toArrayBuffer(Number(outPtr[0]), 0, len));
  const bytes = new Uint8Array(view);
  f.rn_free(Number(outPtr[0]), len);
  return bytes;
}

export function encryptLocal(keys: KeysPtr, data: Uint8Array): Uint8Array {
  const outPtr = new BigUint64Array(1);
  const outLen = new BigUint64Array(1);
  const err = new Uint8Array(24);
  const rc = f.rn_keys_encrypt_local_data(
    keys,
    ptr(data),
    data.length,
    ptr(outPtr),
    ptr(outLen),
    ptr(err),
  );
  if (rc !== 0) {
    throw new RunarFfiError(`encrypt_local_data failed: ${lastError()}`, rc);
  }
  const len = Number(outLen[0]);
  const view = new Uint8Array(toArrayBuffer(Number(outPtr[0]), 0, len));
  const bytes = new Uint8Array(view);
  f.rn_free(Number(outPtr[0]), len);
  return bytes;
}

export function decryptLocal(keys: KeysPtr, encrypted: Uint8Array): Uint8Array {
  const outPtr = new BigUint64Array(1);
  const outLen = new BigUint64Array(1);
  const err = new Uint8Array(24);
  const rc = f.rn_keys_decrypt_local_data(
    keys,
    ptr(encrypted),
    encrypted.length,
    ptr(outPtr),
    ptr(outLen),
    ptr(err),
  );
  if (rc !== 0) {
    throw new RunarFfiError(`decrypt_local_data failed: ${lastError()}`, rc);
  }
  const len = Number(outLen[0]);
  const view = new Uint8Array(toArrayBuffer(Number(outPtr[0]), 0, len));
  const bytes = new Uint8Array(view);
  f.rn_free(Number(outPtr[0]), len);
  return bytes;
}

export function nodeGetPublicKey(keys: KeysPtr): Uint8Array {
  const outPtr = new BigUint64Array(1);
  const outLen = new BigUint64Array(1);
  const err = new Uint8Array(24);
  const rc = f.rn_keys_node_get_public_key(keys, ptr(outPtr), ptr(outLen), ptr(err));
  if (rc !== 0) {
    throw new RunarFfiError(`node_get_public_key failed: ${lastError()}`, rc);
  }
  const len = Number(outLen[0]);
  const view = new Uint8Array(toArrayBuffer(Number(outPtr[0]), 0, len));
  const bytes = new Uint8Array(view);
  f.rn_free(Number(outPtr[0]), len);
  return bytes;
}

export function nodeGetNodeId(keys: KeysPtr): string {
  const outPtr = new BigUint64Array(1);
  const outLen = new BigUint64Array(1);
  const err = new Uint8Array(24);
  const rc = f.rn_keys_node_get_node_id(keys, ptr(outPtr), ptr(outLen), ptr(err));
  if (rc !== 0) throw new RunarFfiError(`node_get_node_id failed: ${lastError()}`, rc);
  const len = Number(outLen[0]);
  const view = new Uint8Array(toArrayBuffer(Number(outPtr[0]), 0, len));
  const s = new TextDecoder().decode(view);
  f.rn_string_free(Number(outPtr[0]));
  return s;
}

export function encryptWithEnvelope(keys: KeysPtr, data: Uint8Array, networkId: string | null, profilePublicKeys: Uint8Array[]): Uint8Array {
  const outPtr = new BigUint64Array(1);
  const outLen = new BigUint64Array(1);
  const err = new Uint8Array(24);
  // Fast-paths to simpler FFI to avoid pointer-to-pointer arrays when possible
  if (profilePublicKeys.length === 1 && networkId === null) {
    const pk = profilePublicKeys[0]!;
    const rc = f.rn_keys_encrypt_for_public_key(
      keys,
      ptr(data),
      data.length,
      ptr(pk),
      pk.length,
      ptr(outPtr),
      ptr(outLen),
      ptr(err),
    );
    if (rc !== 0) {
      throw new RunarFfiError(`encrypt_for_public_key failed: ${lastError()}`, rc);
    }
    const len = Number(outLen[0]);
    const view = new Uint8Array(toArrayBuffer(Number(outPtr[0]), 0, len));
    const bytes = new Uint8Array(view);
    f.rn_free(Number(outPtr[0]), len);
    return bytes;
  }
  if (profilePublicKeys.length === 0 && networkId) {
    const cstr = new Uint8Array([...new TextEncoder().encode(networkId), 0]);
    const rc = f.rn_keys_encrypt_for_network(
      keys,
      ptr(data),
      data.length,
      ptr(cstr),
      ptr(outPtr),
      ptr(outLen),
      ptr(err),
    );
    if (rc !== 0) {
      throw new RunarFfiError(`encrypt_for_network failed: ${lastError()}`, rc);
    }
    const len = Number(outLen[0]);
    const view = new Uint8Array(toArrayBuffer(Number(outPtr[0]), 0, len));
    const bytes = new Uint8Array(view);
    f.rn_free(Number(outPtr[0]), len);
    return bytes;
  }
  // Build arrays of pointers and lengths for profile keys (or pass null when empty)
  const hasProfiles = profilePublicKeys.length > 0;
  const count = profilePublicKeys.length;
  const pkPtrsBuf = hasProfiles ? new BigUint64Array(count) : null;
  const pkLensBuf = hasProfiles ? new BigUint64Array(count) : null;
  if (hasProfiles) {
    for (let i = 0; i < count; i++) {
      const keyBuf = profilePublicKeys[i]!;
      (pkPtrsBuf as BigUint64Array)[i] = BigInt(ptr(keyBuf));
      (pkLensBuf as BigUint64Array)[i] = BigInt(keyBuf.length);
    }
  }
  const cstr = networkId ? new Uint8Array([...new TextEncoder().encode(networkId), 0]) : null;
  // Keep buffers alive across the FFI call
  const keepAlive = [data, err, outPtr, outLen, pkPtrsBuf, pkLensBuf, cstr, ...profilePublicKeys.filter(Boolean)];
  const rc = f.rn_keys_encrypt_with_envelope(
    keys,
    ptr(data),
    data.length,
    cstr ? ptr(cstr) : 0,
    hasProfiles ? ptr(pkPtrsBuf!) : 0,
    hasProfiles ? ptr(pkLensBuf!) : 0,
    hasProfiles ? count : 0,
    ptr(outPtr),
    ptr(outLen),
    ptr(err),
  );
  if (rc !== 0) {
    throw new RunarFfiError(`encrypt_with_envelope failed: ${lastError()}`, rc);
  }
  const len = Number(outLen[0]);
  const view = new Uint8Array(toArrayBuffer(Number(outPtr[0]), 0, len));
  const bytes = new Uint8Array(view);
  f.rn_free(Number(outPtr[0]), len);
  return bytes;
}

export function decryptEnvelope(keys: KeysPtr, eedCbor: Uint8Array): Uint8Array {
  const outPtr = new BigUint64Array(1);
  const outLen = new BigUint64Array(1);
  const err = new Uint8Array(24);
  const rc = f.rn_keys_decrypt_envelope(
    keys,
    ptr(eedCbor),
    eedCbor.length,
    ptr(outPtr),
    ptr(outLen),
    ptr(err),
  );
  if (rc !== 0) {
    throw new RunarFfiError(`decrypt_envelope failed: ${lastError()}`, rc);
  }
  const len = Number(outLen[0]);
  const view = new Uint8Array(toArrayBuffer(Number(outPtr[0]), 0, len));
  const bytes = new Uint8Array(view);
  f.rn_free(Number(outPtr[0]), len);
  return bytes;
}


