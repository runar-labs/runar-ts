import { Result, err, isErr } from 'runar-ts-common/src/error/Result.js';
import { AnyValue } from '../core/any_value.js';
import { CommonKeysInterface } from '../keystore/device_caps.js';

// Export function to serialize entities
export function serializeEntity(entity: any): Uint8Array | Promise<Uint8Array> {
  // Serialize the entity directly
  const avResult = AnyValue.from(entity);
  if (isErr(avResult)) {
    throw new Error(`Failed to create AnyValue: ${avResult.error.message}`);
  }
  const av = avResult.value;
  const result = av.serialize();

  if (result instanceof Promise) {
    return result.then(r => (r.ok ? r.value : new Uint8Array()));
  } else {
    return result.ok ? result.value : new Uint8Array();
  }
}

// Export function to deserialize entities
export function deserializeEntity<T>(
  bytes: Uint8Array,
  keystore?: CommonKeysInterface
): Result<T, Error> {
  const avResult = AnyValue.fromBytes<T>(bytes, keystore);
  if (isErr(avResult)) {
    return err(new Error(`Failed to deserialize AnyValue: ${avResult.error.message}`));
  }
  const av = avResult.value;
  return av.as<T>();
}
