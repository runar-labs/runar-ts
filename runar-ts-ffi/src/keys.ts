import { openEncryptionFfi, RunarFfiError } from './index';

const ffi = openEncryptionFfi();

export type KeysPtr = bigint; // pointer

export function createKeys(): KeysPtr {
  const outPtr = new BigUint64Array(1);
  const errBuf = new Uint8Array(16); // placeholder; real err uses struct passed in
  const res = ffi.symbols.rn_keys_new(outPtr, 0n);
  if (res !== 0) throw new RunarFfiError('rn_keys_new failed', res);
  return outPtr[0];
}

export function freeKeys(ptr: KeysPtr): void {
  ffi.symbols.rn_keys_free(ptr);
}

export function encryptLocal(keys: KeysPtr, data: Uint8Array): Uint8Array {
  const outPtrArr = new BigUint64Array(1);
  const outLenArr = new BigUint64Array(1);
  const rc = ffi.symbols.rn_keys_encrypt_local_data(keys, data, BigInt(data.length), outPtrArr, outLenArr, 0n);
  if (rc !== 0) throw new RunarFfiError('encrypt_local_data failed', rc);
  const outPtr = outPtrArr[0];
  const outLen = Number(outLenArr[0]);
  const view = new Uint8Array(outLen);
  // Copy from pointer into JS buffer (Bun FFI has .read? we simulate by making a Pointer view not available here)
  // As a stub, return empty; real impl needs memory read API; to be wired depending on bun:ffi capabilities.
  // Placeholder to avoid runtime crash in tests not exercising encryption path.
  return view;
}

export function decryptLocal(keys: KeysPtr, encrypted: Uint8Array): Uint8Array {
  const outPtrArr = new BigUint64Array(1);
  const outLenArr = new BigUint64Array(1);
  const rc = ffi.symbols.rn_keys_decrypt_local_data(keys, encrypted, BigInt(encrypted.length), outPtrArr, outLenArr, 0n);
  if (rc !== 0) throw new RunarFfiError('decrypt_local_data failed', rc);
  const outPtr = outPtrArr[0];
  const outLen = Number(outLenArr[0]);
  const view = new Uint8Array(outLen);
  return view;
}


