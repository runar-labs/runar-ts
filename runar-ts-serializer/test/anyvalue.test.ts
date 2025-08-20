import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AnyValue } from '../src';

describe('AnyValue', () => {
  it('wraps values and provides lazy serialization/deserialization', () => {
    const val = AnyValue.from({ a: 1, b: 'x' });
    const bytesRes = val.serialize();
    assert.equal(bytesRes.ok, true);
    const back = AnyValue.fromBytes(bytesRes.ok ? bytesRes.value : new Uint8Array());
    const objRes = back.as<{ a: number; b: string }>();
    assert.equal(objRes.ok, true);
    if (objRes.ok) {
      assert.equal(objRes.value.a, 1);
      assert.equal(objRes.value.b, 'x');
    }
  });
});


