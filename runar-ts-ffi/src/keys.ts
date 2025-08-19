import { RunarFfiError, openEncryptionFfi } from './index';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { ptr, toArrayBuffer } from 'bun:ffi';

const f = (openEncryptionFfi() as any).symbols as any;

export type KeysPtr = number; // pass as usize to bun:ffi when arg type is 'usize'

function lastError(): string {
  const buf = new Uint8Array(1024);
  f.rn_last_error(ptr(buf), buf.length);
  const s = new TextDecoder().decode(buf);
  const n = s.indexOf('\u0000');
  return n >= 0 ? s.slice(0, n) : s;
}

export function createKeys(): KeysPtr {
  const err = new Uint8Array(24);
  const raw = f.rn_keys_new_return(ptr(err)) as bigint;
  if (raw === 0n || raw === (BigInt.asUintN(64, -1n))) {
    throw new RunarFfiError(`rn_keys_new returned invalid pointer`);
  }
  return Number(raw);
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
  const view = new Uint8Array(toArrayBuffer((outPtr[0] as unknown) as any, len as any));
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
  const view = new Uint8Array(toArrayBuffer((outPtr[0] as unknown) as any, len as any));
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
  const view = new Uint8Array(toArrayBuffer((outPtr[0] as unknown) as any, len as any));
  const bytes = new Uint8Array(view);
  f.rn_free(Number(outPtr[0]), len);
  return bytes;
}

export function encryptWithEnvelope(keys: KeysPtr, data: Uint8Array, networkId: string | null, profilePublicKeys: Uint8Array[]): Uint8Array {
  const outPtr = new BigUint64Array(1);
  const outLen = new BigUint64Array(1);
  const err = new Uint8Array(24);
  // Build arrays of pointers and lengths for profile keys (or pass null when empty)
  const hasProfiles = profilePublicKeys.length > 0;
  const pkPtrs = hasProfiles ? new BigUint64Array(profilePublicKeys.length) : null;
  const pkLens = hasProfiles ? new BigUint64Array(profilePublicKeys.length) : null;
  if (hasProfiles) {
    for (let i = 0; i < profilePublicKeys.length; i++) {
      (pkPtrs as BigUint64Array)[i] = (ptr(profilePublicKeys[i]) as unknown) as bigint;
      (pkLens as BigUint64Array)[i] = BigInt(profilePublicKeys[i].length);
    }
  }
  const rc = f.rn_keys_encrypt_with_envelope(
    keys,
    ptr(data),
    data.length,
    networkId ? ptr(new TextEncoder().encode(networkId + '\u0000')) : 0n,
    hasProfiles ? ptr(pkPtrs!) : 0n,
    hasProfiles ? ptr(pkLens!) : 0n,
    hasProfiles ? profilePublicKeys.length : 0,
    ptr(outPtr),
    ptr(outLen),
    ptr(err),
  );
  if (rc !== 0) {
    throw new RunarFfiError(`encrypt_with_envelope failed: ${lastError()}`, rc);
  }
  const len = Number(outLen[0]);
  const view = new Uint8Array(toArrayBuffer((outPtr[0] as unknown) as any, len as any));
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
  const view = new Uint8Array(toArrayBuffer((outPtr[0] as unknown) as any, len as any));
  const bytes = new Uint8Array(view);
  f.rn_free((outPtr[0] as unknown) as any, len as any);
  return bytes;
}


