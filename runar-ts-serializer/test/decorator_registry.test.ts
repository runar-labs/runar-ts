import { describe, it, expect } from 'bun:test';
import 'reflect-metadata';
import { EncryptedClass, getTypeName } from 'runar-ts-decorators';
import { registerType, resolveType, clearRegistry } from '../src/registry';

@EncryptedClass({ network: 'default', typeName: 'com.runar.TestProfile' })
class TestProfile {
  constructor(
    public id: string,
    public name: string
  ) {}
}

describe('Decorator/Registry integration', () => {
  it('records typeName via decorator and resolves via registry', () => {
    clearRegistry();
    const tn = getTypeName(TestProfile);
    expect(tn).toBe('com.runar.TestProfile');
    if (tn) registerType(tn, { ctor: TestProfile });
    const entry = resolveType('com.runar.TestProfile');
    expect(entry?.ctor).toBe(TestProfile);
  });
});
