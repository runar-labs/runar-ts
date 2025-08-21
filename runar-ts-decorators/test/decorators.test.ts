import { describe, it, expect } from 'bun:test';
import 'reflect-metadata';
import {
  EncryptedClass,
  EncryptedField,
  PlainField,
  getEncryptedClassOptions,
  getFieldMetadata,
} from '../src';

@EncryptedClass({ network: 'default' })
class ExampleEntity {
  @EncryptedField({ label: 'secret' })
  secret!: string;

  @PlainField()
  plain!: number;
}

describe('Decorators metadata', () => {
  it('captures class and field metadata', () => {
    const opts = getEncryptedClassOptions(ExampleEntity);
    expect(opts?.network).toBe('default');
    const fields = getFieldMetadata(ExampleEntity);
    expect(fields.length).toBe(2);
  });
});
