import { describe, it, expect } from 'bun:test';
import 'reflect-metadata';
import {
  Plain,
  Encrypt,
  EncryptField,
  getClassMetadata,
  getTypeName,
  isPlainClass,
  isEncryptedClass,
  getFieldsByLabel,
  getOrderedLabels
} from '../src';

// Test @Plain decorator
describe('@Plain Decorator', () => {
  @Plain()
  class SimpleStruct {
    constructor(public a: number, public b: string) {}
  }

  @Plain({ name: "custom.TestStructAB" })
  class CustomNameStruct {
    constructor(public x: number, public y: string) {}
  }

  it('should register plain class metadata', () => {
    const metadata = getClassMetadata('SimpleStruct');
    expect(metadata).toBeDefined();
    expect(metadata?.isPlain).toBe(true);
    expect(metadata?.isEncrypted).toBe(false);
    expect(metadata?.typeName).toBe('SimpleStruct');
  });

  it('should use custom type name when provided', () => {
    const metadata = getClassMetadata('CustomNameStruct');
    expect(metadata?.typeName).toBe('custom.TestStructAB');
  });

  it('should identify plain classes', () => {
    expect(isPlainClass(SimpleStruct)).toBe(true);
    expect(isEncryptedClass(SimpleStruct)).toBe(false);
  });

  it('should have encryption methods (no-op)', () => {
    const instance = new SimpleStruct(42, 'hello');
    const encrypted = instance.encryptWithKeystore({}, {});
    const decrypted = instance.decryptWithKeystore({});

    expect(encrypted).toBe(instance);
    expect(decrypted).toBe(instance);
  });
});

// Test @Encrypt decorator
describe('@Encrypt Decorator', () => {
  @Encrypt()
  class UserProfile {
    public id: string;

    @EncryptField('system')
    public name: string;

    @EncryptField('user')
    public email: string;

    constructor(id: string, name: string, email: string) {
      this.id = id;
      this.name = name;
      this.email = email;
    }
  }

  @Encrypt({ name: "custom.EncryptedData" })
  class CustomEncryptedData {
    public timestamp: number;

    @EncryptField('high_security')
    public sensitiveInfo: string;

    @EncryptField('low_security')
    public publicInfo: string;

    constructor(timestamp: number, sensitiveInfo: string, publicInfo: string) {
      this.timestamp = timestamp;
      this.sensitiveInfo = sensitiveInfo;
      this.publicInfo = publicInfo;
    }
  }

  it('should register encrypted class metadata', () => {
    const metadata = getClassMetadata('UserProfile');
    expect(metadata).toBeDefined();
    expect(metadata?.isPlain).toBe(false);
    expect(metadata?.isEncrypted).toBe(true);
    expect(metadata?.typeName).toBe('UserProfile');
  });

  it('should use custom type name for encrypted classes', () => {
    const metadata = getClassMetadata('CustomEncryptedData');
    expect(metadata?.typeName).toBe('custom.EncryptedData');
  });

  it('should identify encrypted classes', () => {
    expect(isEncryptedClass(UserProfile)).toBe(true);
    expect(isPlainClass(UserProfile)).toBe(false);
  });

  it('should have field encryption metadata', () => {
    const fieldsByLabel = getFieldsByLabel(UserProfile);
    expect(fieldsByLabel.get('system')).toEqual(['name']);
    expect(fieldsByLabel.get('user')).toEqual(['email']);
  });

  it('should order labels correctly', () => {
    const orderedLabels = getOrderedLabels(CustomEncryptedData);
    expect(orderedLabels).toEqual(['high_security', 'low_security']);
  });
});

// Test @EncryptField decorator with different syntaxes
describe('@EncryptField Decorator', () => {
  @Encrypt()
  class TestFieldEncryption {
    public id: string;

    @EncryptField('simple_label')
    public field1: string;

    @EncryptField({ label: 'complex_label', priority: 1 })
    public field2: string;

    @EncryptField({ label: 'high_priority', priority: 0 })
    public field3: string;

    constructor(id: string, field1: string, field2: string, field3: string) {
      this.id = id;
      this.field1 = field1;
      this.field2 = field2;
      this.field3 = field3;
    }
  }

  it('should handle string syntax', () => {
    const fieldsByLabel = getFieldsByLabel(TestFieldEncryption);
    expect(fieldsByLabel.get('simple_label')).toEqual(['field1']);
  });

  it('should handle object syntax with priority', () => {
    const fieldsByLabel = getFieldsByLabel(TestFieldEncryption);
    expect(fieldsByLabel.get('complex_label')).toEqual(['field2']);
    expect(fieldsByLabel.get('high_priority')).toEqual(['field3']);
  });

  it('should order by priority first, then alphabetically', () => {
    const orderedLabels = getOrderedLabels(TestFieldEncryption);
    expect(orderedLabels).toEqual(['high_priority', 'complex_label', 'simple_label']);
  });
});

// Test complex encryption scenarios
describe('Complex Encryption Scenarios', () => {
  @Encrypt({ name: "complex.EncryptedProfile" })
  class ComplexProfile {
    // Plaintext fields (no encryption)
    public id: string;
    public createdAt: Date;

    // Different encryption levels
    @EncryptField('network')
    public networkConfig: object;

    @EncryptField('user_profile')
    public userPreferences: object;

    @EncryptField('audit_log')
    public accessLogs: string[];

    constructor(
      id: string,
      createdAt: Date,
      networkConfig: object,
      userPreferences: object,
      accessLogs: string[]
    ) {
      this.id = id;
      this.createdAt = createdAt;
      this.networkConfig = networkConfig;
      this.userPreferences = userPreferences;
      this.accessLogs = accessLogs;
    }
  }

  it('should handle mixed encrypted and plaintext fields', () => {
    const instance = new ComplexProfile(
      '123',
      new Date(),
      { host: 'localhost' },
      { theme: 'dark' },
      ['login', 'logout']
    );

    const fieldsByLabel = getFieldsByLabel(ComplexProfile);
    expect(fieldsByLabel.get('network')).toEqual(['networkConfig']);
    expect(fieldsByLabel.get('user_profile')).toEqual(['userPreferences']);
    expect(fieldsByLabel.get('audit_log')).toEqual(['accessLogs']);
  });

  it('should have correct type name', () => {
    const typeName = getTypeName(ComplexProfile);
    expect(typeName).toBe('complex.EncryptedProfile');
  });

  it('should be identified as encrypted class', () => {
    expect(isEncryptedClass(ComplexProfile)).toBe(true);
    expect(isPlainClass(ComplexProfile)).toBe(false);
  });
});

// Test encryption/decryption flow (with stubs)
describe('Encryption/Decryption Flow', () => {
  @Encrypt()
  class TestEncryption {
    public id: string;

    @EncryptField('test_label')
    public secretData: string;

    constructor(id: string, secretData: string) {
      this.id = id;
      this.secretData = secretData;
    }
  }

  it('should have encryption methods', () => {
    const instance = new TestEncryption('123', 'secret');

    // These are stub implementations, but the methods should exist
    expect(typeof instance.encryptWithKeystore).toBe('function');
    expect(typeof instance.decryptWithKeystore).toBe('function');
  });

  it('should call encryption functions (stubs)', () => {
    const instance = new TestEncryption('123', 'secret');

    // Mock console.log to capture stub output
    const originalLog = console.log;
    const logs: string[] = [];
    console.log = (...args: any[]) => logs.push(args.join(' '));

    const mockKeystore = {};
    const mockResolver = { canResolve: () => true };

    // Call encryption (this will use our stub implementation)
    const encrypted = instance.encryptWithKeystore(mockKeystore, mockResolver);

    // Restore console.log
    console.log = originalLog;

    // Verify stub was called
    expect(logs.some(log => log.includes("Encrypting label 'test_label'"))).toBe(true);
  });
});
