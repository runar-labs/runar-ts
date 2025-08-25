import { describe, it, expect } from 'bun:test';
import { AnyValue } from '../src/index.js';

describe('AnyValue', () => {
  it('wraps values and provides lazy serialization/deserialization', () => {
    const val = AnyValue.from({ a: 1, b: 'x' });
    const bytesRes = val.serialize();
    expect(bytesRes.ok).toBe(true);
    if (bytesRes.ok) {
      const back = AnyValue.fromBytes(bytesRes.value);
      const objRes = back.as<{ a: number; b: string }>();
      expect(objRes.ok).toBe(true);
      if (objRes.ok) {
        expect(objRes.value.a).toBe(1);
        expect(objRes.value.b).toBe('x');
      }
    }
  });
});
