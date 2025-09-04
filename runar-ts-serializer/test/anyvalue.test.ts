import { describe, it, expect } from 'bun:test';
import { AnyValue } from '../src/index.js';

describe('AnyValue', () => {
  it('wraps values and provides lazy serialization/deserialization', () => {
    const valResult = AnyValue.from({ a: 1, b: 'x' });
    expect(valResult.ok).toBe(true);
    if (!valResult.ok) return;
    
    const val = valResult.value;
    const bytesRes = val.serialize();
    expect(bytesRes.ok).toBe(true);
    if (!bytesRes.ok) return;
    
    const backResult = AnyValue.fromBytes(bytesRes.value);
    expect(backResult.ok).toBe(true);
    if (!backResult.ok) return;
    
    const back = backResult.value;
    const objRes = back.asType<{ a: number; b: string }>();
    expect(objRes.ok).toBe(true);
    if (objRes.ok) {
      expect(objRes.value.a).toBe(1);
      expect(objRes.value.b).toBe('x');
    }
  });
});
