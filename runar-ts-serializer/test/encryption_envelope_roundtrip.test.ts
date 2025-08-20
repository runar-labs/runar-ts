import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encode } from 'cbor-x';
import { AnyValue, ValueCategory, writeHeader, createDecryptContextFromKeys } from '../src';
import runar from 'runar-nodejs-api';
const { Keys } = runar as any;

test('encrypts and decrypts a small payload via NAPI Keys', async () => {
  const keys = new Keys();
  const svc = 'com.runar.keys';
  const acc = `state.aead.v1.${Date.now()}`;
  keys.registerLinuxDeviceKeystore(svc, acc);
  keys.setPersistenceDir('/tmp/runar-keys-test');
  keys.enableAutoPersist(true);

  await keys.mobileInitializeUserRootKey();
  await keys.flushState();

  const obj = { a: 1, b: 'x' };
  const body = encode(obj);
  const header = writeHeader({ category: ValueCategory.Encrypted, isEncrypted: true });
  const eed = keys.encryptLocalData(Buffer.from(body));
  const wire = new Uint8Array(header.length + eed.length);
  wire.set(header, 0);
  wire.set(new Uint8Array(eed), header.length);

  const av = AnyValue.fromBytes<typeof obj>(wire, {
    decryptEnvelope: (eedBytes) => {
      try {
        const out = keys.decryptLocalData(Buffer.from(eedBytes));
        return { ok: true, value: new Uint8Array(out) } as const;
      } catch (e) {
        return { ok: false, error: e as Error } as const;
      }
    },
  } as any);
  const r = av.as<typeof obj>();
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.a, 1);
    assert.equal(r.value.b, 'x');
  }
});


