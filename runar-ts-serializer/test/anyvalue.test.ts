import { describe, it, expect } from 'bun:test';
import { AnyValue } from '../src';

describe('AnyValue', () => {
  it('wraps values and provides lazy serialization/deserialization', () => {
    const val = AnyValue.from({ a: 1, b: 'x' });
    const bytes = val.serialize();
    const back = AnyValue.fromBytes<typeof val.as> (bytes);
    const obj = back.as<{ a: number; b: string }>();
    expect(obj.a).toBe(1);
    expect(obj.b).toBe('x');
  });
});


