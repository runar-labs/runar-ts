import { Encrypt, runar } from '../runar-ts-decorators/src/index.js';

// Simple test class using proper TS 5 decorators
@Encrypt
class TestProfile {
  @runar({ user: true })
  public id: string;

  @runar({ user: true })
  public name: string;

  @runar({ system: true })
  public email: string;

  constructor(id: string, name: string, email: string) {
    this.id = id;
    this.name = name;
    this.email = email;
  }
}

// Test that the decorators work
const profile = new TestProfile('user-123', 'John Doe', 'john@example.com');

console.log('✅ Decorators working!');
console.log('Profile:', profile);
console.log('Has encryptWithKeystore:', typeof (profile as any).encryptWithKeystore === 'function');
console.log('Has decryptWithKeystore:', typeof (profile as any).decryptWithKeystore === 'function');
console.log('Static fieldEncryptions:', (profile.constructor as any).fieldEncryptions);
