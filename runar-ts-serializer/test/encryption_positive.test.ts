import { describe, it, expect } from 'bun:test';
import { AnyValue } from '../src';
import { encode } from 'cbor-x';

function makeEncryptedEnvelope(body: Uint8Array): Uint8Array {
  // header: [category=Encrypted(7), encFlag=1, typeLen=0]
  const header = new Uint8Array([7, 1, 0]);
  const out = new Uint8Array(header.length + body.length);
  out.set(header, 0);
  out.set(body, header.length);
  return out;
}

describe('Encryption path (positive)', () => {
  it('decrypts via context and hydrates value', () => {
    const obj = { a: 1, b: 'x' };
    const body = encode(obj);
    const wire = makeEncryptedEnvelope(body);

    const av = AnyValue.fromBytes(wire, { decryptEnvelope: (eed) => ({ ok: true, value: eed }) });
    const r = av.as<typeof obj>();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.a).toBe(1);
      expect(r.value.b).toBe('x');
    }
  });
});


