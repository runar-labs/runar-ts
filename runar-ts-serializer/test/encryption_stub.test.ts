import { describe, it, expect } from 'bun:test';
import { AnyValue, ValueCategory, readHeader } from '../src';

describe('Encryption path (stub)', () => {
  it('returns error without decrypt context when encrypted', () => {
    // Craft an "encrypted" header + dummy body
    const header = new Uint8Array([ValueCategory.Encrypted, 1, 0]);
    const body = new Uint8Array([0xA0]); // empty CBOR map
    const buf = new Uint8Array(header.length + body.length);
    buf.set(header, 0);
    buf.set(body, header.length);

    const av = AnyValue.fromBytes(buf);
    const r = av.as<any>();
    expect(r.ok).toBe(false);
  });
});


