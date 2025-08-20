import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readHeader, writeHeader, ValueCategory } from '../src';

describe('wire header', () => {
  it('fails on too short', () => {
    const r = readHeader(new Uint8Array([1, 0]));
    assert.equal(r.ok, false);
  });

  it('parses with type name', () => {
    const h = { category: ValueCategory.Struct, isEncrypted: false, typeName: 'TestType' };
    const bytes = writeHeader(h);
    const r = readHeader(bytes);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.category, ValueCategory.Struct);
      assert.equal(r.value.typeName, 'TestType');
    }
  });

  it('detects invalid type length', () => {
    const bytes = new Uint8Array([ValueCategory.Struct, 0, 10, 0x61, 0x62]);
    const r = readHeader(bytes);
    assert.equal(r.ok, false);
  });
});


