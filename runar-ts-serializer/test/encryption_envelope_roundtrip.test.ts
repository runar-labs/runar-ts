import { describe, it, expect } from 'bun:test';
import { AnyValue } from '../src';
import { ValueCategory, writeHeader } from '../src/wire';
import { encode } from 'cbor-x';
import runar from 'runar-nodejs-api';
const { Keys } = runar as any;

describe('Encryption envelope roundtrip', () => {
  it('encrypts and decrypts a small payload via NAPI Keys', async () => {
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
    const header = writeHeader({ category: ValueCategory.Json, isEncrypted: true });
    const eed = keys.encryptLocalData(Buffer.from(body));
    const wire = new Uint8Array(header.length + eed.length);
    wire.set(header, 0);
    wire.set(new Uint8Array(eed), header.length);

    const av = AnyValue.fromBytes<typeof obj>(wire, {
      decryptEnvelope: eedBytes => {
        try {
          const out = keys.decryptLocalData(Buffer.from(eedBytes));
          return { ok: true, value: new Uint8Array(out) } as const;
        } catch (e) {
          return { ok: false, error: e as Error } as const;
        }
      },
    } as any);
    const r = av.as<typeof obj>();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.a).toBe(1);
      expect(r.value.b).toBe('x');
    }
  });
});
