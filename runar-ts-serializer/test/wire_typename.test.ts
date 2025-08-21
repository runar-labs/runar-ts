import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import 'reflect-metadata';
import { EncryptedClass } from 'runar-ts-decorators';
import { AnyValue, readHeader, ValueCategory } from '../src';

@EncryptedClass({ network: 'default', typeName: 'profile.User' })
class User {
  constructor(
    public id: number,
    public name: string
  ) {}
}

describe('Wire type names', () => {
  it('emits wire name from decorator', () => {
    const av = AnyValue.from(new User(1, 'alice'));
    const ser = av.serialize();
    assert.equal(ser.ok, true);
    if (!ser.ok) return;
    const hdr = readHeader(ser.value);
    assert.equal(hdr.ok, true);
    if (hdr.ok) {
      assert.equal(hdr.value.category, ValueCategory.Struct);
      assert.equal(hdr.value.typeName, 'profile.User');
    }
  });
});
