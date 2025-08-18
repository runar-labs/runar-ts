import { describe, it, expect } from 'bun:test';
import { anyToCbor, cborToAny } from '../src';

describe('AnyValue', () => {
  it('encodes/decodes AnyValue union', () => {
    const value = { type: 'map', value: { a: { type: 'int', value: 1 }, b: { type: 'string', value: 'x' } } } as const;
    const buf = anyToCbor(value as any);
    const round = cborToAny(buf);
    expect((round as any).type).toBe('map');
  });
});


