import { describe, it, expect } from 'bun:test';
import { EncryptedClass } from 'runar-ts-decorators';
import { AnyValue, readHeader, ValueCategory } from '../src/index.js';

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
    expect(ser.ok).toBe(true);
    if (!ser.ok) return;
    const hdr = readHeader(ser.value);
    expect(hdr.ok).toBe(true);
    if (hdr.ok) {
      expect(hdr.value.category).toBe(ValueCategory.Struct);
      expect(hdr.value.typeName).toBe('profile.User');
    }
  });
});
