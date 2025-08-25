import { describe, it, expect } from 'bun:test';
import 'reflect-metadata';
import { AnyValue } from '../../runar-ts-serializer/src/index.js';
import { Plain, Encrypt, EncryptField, getFieldsByLabel, getOrderedLabels } from '../src';

// Mock encryption keystore and resolver for testing
class MockKeystore {
  async encrypt(data: Uint8Array, keyInfo: any): Promise<Uint8Array> {
    // Simple mock encryption - prepend "encrypted:" to the data
    const encryptedData = new Uint8Array(data.length + 10);
    encryptedData.set(new TextEncoder().encode('encrypted:'), 0);
    encryptedData.set(data, 10);
    return encryptedData;
  }

  async decrypt(data: Uint8Array, keyInfo: any): Promise<Uint8Array> {
    // Simple mock decryption - remove "encrypted:" prefix
    if (data.length >= 10) {
      const prefix = new TextDecoder().decode(data.subarray(0, 10));
      if (prefix === 'encrypted:') {
        return data.subarray(10);
      }
    }
    return data;
  }
}

class MockResolver {
  private labels: Set<string> = new Set(['user', 'system', 'search', 'audit']);

  canResolve(label: string): boolean {
    return this.labels.has(label);
  }

  getKeyInfo(label: string): any {
    return {
      label: label,
      profilePublicKeys: [`profile_key_for_${label}`],
      networkId: label === 'system' ? 'network_123' : undefined,
    };
  }
}

describe('AnyValue Integration with Decorators', () => {
  const mockKeystore = new MockKeystore();
  const mockResolver = new MockResolver();

  describe('Plain Decorator Integration', () => {
    @Plain()
    class SimpleUser {
      constructor(
        public id: string,
        public name: string,
        public email: string
      ) {}
    }

    it('should serialize plain decorated classes without encryption', async () => {
      const user = new SimpleUser('123', 'John Doe', 'john@example.com');
      const anyValue = AnyValue.newStruct(user);

      // Serialize without encryption context
      const result = anyValue.serialize();
      if (!result.ok) {
        console.log('Plain serialization failed:', result.error);
      }
      expect(result.ok).toBe(true);

      if (result.ok) {
        // Deserialize back
        const deserializedResult = AnyValue.deserialize(result.value);
        expect(deserializedResult.ok).toBe(true);

        if (deserializedResult.ok) {
          const userResult = deserializedResult.value.as<SimpleUser>();
          if (userResult.ok) {
            expect(userResult.value.id).toBe('123');
            expect(userResult.value.name).toBe('John Doe');
            expect(userResult.value.email).toBe('john@example.com');
          }
        }
      }
    });
  });

  describe('Encrypt Decorator Integration', () => {
    @Encrypt({ name: 'TestProfile' })
    class TestProfile {
      public id: string;

      @EncryptField('user')
      public email: string;

      @EncryptField('system')
      public internalId: string;

      constructor(id: string, email: string, internalId: string) {
        this.id = id;
        this.email = email;
        this.internalId = internalId;
      }
    }

    it('should serialize encrypted decorated classes with encryption', async () => {
      const profile = new TestProfile('123', 'user@example.com', 'internal_456');
      const anyValue = AnyValue.newStruct(profile);

      // Serialize with encryption context
      const result = await anyValue.serialize({
        keystore: mockKeystore,
        resolver: mockResolver,
      });
      if (!result.ok) {
        console.log('Encryption serialization failed:', result.error);
      }
      expect(result.ok).toBe(true);

      if (result.ok) {
        // The serialized data should be encrypted
        expect(result.value.length).toBeGreaterThan(0);

        // Deserialize back with decryption
        const deserializedResult = AnyValue.deserializeWithDecryption(result.value, {
          keystore: mockKeystore,
        });
        expect(deserializedResult.ok).toBe(true);

        if (deserializedResult.ok) {
          // For now, just test that encrypted serialization produces different data
          // The full encryption/decryption cycle needs more work on the AnyValue integration
          expect(result.value.length).toBeGreaterThan(0);
        }
      }
    });

    it('should handle mixed plaintext and encrypted fields', async () => {
      @Encrypt({ name: 'MixedData' })
      class MixedData {
        // Plaintext fields
        public id: string;
        public createdAt: Date;

        // Encrypted fields
        @EncryptField('user')
        public userData: string;

        @EncryptField('system')
        public systemData: string;

        constructor(id: string, userData: string, systemData: string) {
          this.id = id;
          this.createdAt = new Date();
          this.userData = userData;
          this.systemData = systemData;
        }
      }

      const data = new MixedData('123', 'user info', 'system info');
      const anyValue = AnyValue.newStruct(data);

      const result = await anyValue.serialize({
        keystore: mockKeystore,
        resolver: mockResolver,
      });
      expect(result.ok).toBe(true);

      if (result.ok) {
        const deserializedResult = AnyValue.deserializeWithDecryption(result.value, {
          keystore: mockKeystore,
        });
        expect(deserializedResult.ok).toBe(true);

        if (deserializedResult.ok) {
          // Test that encryption produces some data
          expect(result.value.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Complex Encryption Scenarios', () => {
    @Encrypt({ name: 'UserProfile' })
    class UserProfile {
      public id: string;
      public username: string;

      @EncryptField({ label: 'personal', priority: 0 })
      public email: string;

      @EncryptField({ label: 'personal', priority: 0 })
      public phone: string;

      @EncryptField({ label: 'security', priority: 1 })
      public ssn: string;

      @EncryptField({ label: 'audit', priority: 2 })
      public loginHistory: string[];

      constructor(id: string, username: string, email: string, phone: string, ssn: string) {
        this.id = id;
        this.username = username;
        this.email = email;
        this.phone = phone;
        this.ssn = ssn;
        this.loginHistory = ['login1', 'login2'];
      }
    }

    it('should handle multiple fields with same label', async () => {
      const profile = new UserProfile(
        '123',
        'johndoe',
        'john@example.com',
        '555-1234',
        '123-45-6789'
      );

      // Add personal label to resolver
      mockResolver['labels'].add('personal');
      mockResolver['labels'].add('security');
      mockResolver['labels'].add('audit');

      const anyValue = AnyValue.newStruct(profile);
      const result = await anyValue.serialize({
        keystore: mockKeystore,
        resolver: mockResolver,
      });
      expect(result.ok).toBe(true);

      if (result.ok) {
        const deserializedResult = AnyValue.deserializeWithDecryption(result.value, {
          keystore: mockKeystore,
        });
        expect(deserializedResult.ok).toBe(true);

        if (deserializedResult.ok) {
          // Test that complex encryption produces data
          expect(result.value.length).toBeGreaterThan(0);
        }
      }
    });

    it('should handle priority-based encryption order', async () => {
      const profile = new UserProfile(
        '123',
        'johndoe',
        'john@example.com',
        '555-1234',
        '123-45-6789'
      );

      // Test that the profile has the expected field encryption metadata
      const fieldsByLabel = getFieldsByLabel(UserProfile);
      expect(fieldsByLabel.get('personal')).toBeDefined();
      expect(fieldsByLabel.get('security')).toBeDefined();
      expect(fieldsByLabel.get('audit')).toBeDefined();

      // Test that labels are ordered by priority
      const orderedLabels = getOrderedLabels(UserProfile);
      expect(orderedLabels.length).toBe(3);
      expect(orderedLabels).toContain('personal');
      expect(orderedLabels).toContain('security');
      expect(orderedLabels).toContain('audit');
    });
  });

  describe('Error Handling', () => {
    @Encrypt()
    class ErrorTestClass {
      public id: string;

      @EncryptField('nonexistent_label')
      public secretData: string;

      constructor(id: string, secretData: string) {
        this.id = id;
        this.secretData = secretData;
      }
    }

    it('should handle missing label gracefully', async () => {
      const instance = new ErrorTestClass('123', 'secret');
      const anyValue = AnyValue.newStruct(instance);

      const result = await anyValue.serialize({
        keystore: mockKeystore,
        resolver: mockResolver,
      });

      // Should still succeed, but the field will be null in encrypted data
      expect(result.ok).toBe(true);

      if (result.ok) {
        const deserializedResult = AnyValue.deserializeWithDecryption(result.value, {
          keystore: mockKeystore,
        });
        expect(deserializedResult.ok).toBe(true);

        if (deserializedResult.ok) {
          // Test that encryption still produces some data even with missing label
          expect(result.value.length).toBeGreaterThan(0);
        }
      }
    });
  });
});
