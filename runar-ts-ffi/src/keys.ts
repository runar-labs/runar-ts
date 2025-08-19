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


