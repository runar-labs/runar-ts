import { describe, it, expect } from 'bun:test';
import { readHeader, writeHeader, ValueCategory } from '../src';

describe('wire header', () => {
  it('fails on too short', () => {
    const r = readHeader(new Uint8Array([1, 0]));
    expect(r.ok).toBe(false);
  });

  it('parses with type name', () => {
    const h = { category: ValueCategory.Struct, isEncrypted: false, typeName: 'TestType' };
    const bytes = writeHeader(h);
    const r = readHeader(bytes);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.category).toBe(ValueCategory.Struct);
      expect(r.value.typeName).toBe('TestType');
    }
  });

  it('detects invalid type length', () => {
    const bytes = new Uint8Array([ValueCategory.Struct, 0, 10, 0x61, 0x62]);
    const r = readHeader(bytes);
    expect(r.ok).toBe(false);
  });
});


