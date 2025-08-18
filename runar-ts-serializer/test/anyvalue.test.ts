import { describe, it, expect } from 'bun:test';
import { encode, decode } from 'cbor-x';

describe('AnyValue placeholder', () => {
  it('encodes/decodes primitives via cbor-x', () => {
    const buf = encode({ a: 1, b: 'x', c: true });
    const obj = decode(buf) as any;
    expect(obj.a).toBe(1);
    expect(obj.b).toBe('x');
    expect(obj.c).toBe(true);
  });
});


