import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  encryptLabelGroup,
  decryptLabelGroup,
  decryptBytes,
  EnvelopeEncryptedData,
  EncryptedLabelGroup,
} from '../src/encryption.js';
import { LabelResolver, LabelResolverConfig, LabelKeyword } from '../src/label_resolver.js';
import { encode, decode } from 'cbor-x';

// Mock CommonKeysInterface for testing
class MockKeystore {
  encryptWithEnvelope(data: Buffer, networkId: string | null, profilePublicKeys: Buffer[]): Buffer {
    // Create mock EnvelopeEncryptedData structure as expected by the design
    const mockEnvelope = {
      encryptedData: data,
      networkId: networkId || 'test-network',
      networkEncryptedKey: Buffer.from('mock-network-key'),
      profileEncryptedKeys: { 'test-profile': Buffer.from('mock-profile-key') }
    };
    
    // Return CBOR-encoded EnvelopeEncryptedData as required by the design
    return Buffer.from(encode(mockEnvelope));
  }

  decryptEnvelope(eedCbor: Buffer): Buffer {
    // Parse CBOR-encoded EnvelopeEncryptedData and extract the data
    const envelope = decode(eedCbor);
    return Buffer.from(envelope.encryptedData);
  }

  // Mock other required methods
  ensureSymmetricKey(keyName: string): Buffer {
    return Buffer.from([]);
  }
  setLabelMapping(mappingCbor: Buffer): void {}
  setLocalNodeInfo(nodeInfoCbor: Buffer): void {}
  setPersistenceDir(dir: string): void {}
  enableAutoPersist(enabled: boolean): void {}
  async wipePersistence(): Promise<void> {}
  async flushState(): Promise<void> {}
  getKeystoreState(): number {
    return 0;
  }
  getKeystoreCaps(): any {
    return {};
  }
}

describe('Encryption Functions', () => {
  const createTestResolver = (): LabelResolver => {
    const config: LabelResolverConfig = {
      labelMappings: new Map([
        [
          'system',
          {
            networkPublicKey: new Uint8Array([1, 2, 3, 4]),
            userKeySpec: undefined,
          },
        ],
        [
          'user',
          {
            networkPublicKey: undefined,
            userKeySpec: LabelKeyword.CurrentUser,
          },
        ],
        [
          'mixed',
          {
            networkPublicKey: new Uint8Array([5, 6, 7, 8]),
            userKeySpec: LabelKeyword.CurrentUser,
          },
        ],
      ]),
    };

    const userKeys = [new Uint8Array([10, 11, 12])];
    const result = LabelResolver.createContextLabelResolver(config, userKeys);
    assert(result.ok, 'Resolver creation should succeed');
    return result.value;
  };

  describe('encryptLabelGroup', () => {
    it('should encrypt data with system label', async () => {
      const resolver = createTestResolver();
      const keystore = new MockKeystore();
      const testData = { message: 'Hello, World!', number: 42 };

      const result = await encryptLabelGroup('system', testData, keystore, resolver);
      if (!result.ok) {
        console.log('Encryption failed:', result.error.message);
      }
      assert(result.ok, 'Encryption should succeed');

      const encryptedGroup = result.value;
      assert.strictEqual(encryptedGroup.label, 'system');
      assert(encryptedGroup.envelope, 'Should have envelope data');
      assert(encryptedGroup.envelope.encryptedData.length > 0, 'Should have encrypted data');
    });

    it('should encrypt data with user label', async () => {
      const resolver = createTestResolver();
      const keystore = new MockKeystore();
      const testData = { secret: 'private info', userId: 123 };

      const result = await encryptLabelGroup('user', testData, keystore, resolver);
      assert(result.ok, 'Encryption should succeed');

      const encryptedGroup = result.value;
      assert.strictEqual(encryptedGroup.label, 'user');
      assert(encryptedGroup.envelope, 'Should have envelope data');
      assert(encryptedGroup.envelope.encryptedData.length > 0, 'Should have encrypted data');
    });

    it('should encrypt data with mixed label', async () => {
      const resolver = createTestResolver();
      const keystore = new MockKeystore();
      const testData = { shared: 'network data', personal: 'user data' };

      const result = await encryptLabelGroup('mixed', testData, keystore, resolver);
      assert(result.ok, 'Encryption should succeed');

      const encryptedGroup = result.value;
      assert.strictEqual(encryptedGroup.label, 'mixed');
      assert(encryptedGroup.envelope, 'Should have envelope data');
      assert(encryptedGroup.envelope.encryptedData.length > 0, 'Should have encrypted data');
    });

    it('should fail for non-existent label', async () => {
      const resolver = createTestResolver();
      const keystore = new MockKeystore();
      const testData = { message: 'test' };

      const result = await encryptLabelGroup('non_existent', testData, keystore, resolver);
      assert(!result.ok, 'Encryption should fail for non-existent label');
      assert(
        result.error.message.includes('not available in current context'),
        'Should have appropriate error message'
      );
    });

    it('should handle resolver errors gracefully', async () => {
      // Create a resolver that will fail
      const failingResolver = {
        resolveLabelInfo: () => ({ ok: false, error: new Error('Resolver error') }),
      } as any;

      const keystore = new MockKeystore();
      const testData = { message: 'test' };

      const result = await encryptLabelGroup('system', testData, keystore, failingResolver);
      assert(!result.ok, 'Encryption should fail when resolver fails');
      assert(
        result.error.message.includes('Failed to resolve label info'),
        'Should have appropriate error message'
      );
    });

    it('should handle keystore errors gracefully', async () => {
      const resolver = createTestResolver();
      const failingKeystore = {
        ...new MockKeystore(),
        encryptWithEnvelope: () => {
          throw new Error('Keystore encryption failed');
        },
      };

      const testData = { message: 'test' };

      const result = await encryptLabelGroup('system', testData, failingKeystore, resolver);
      assert(!result.ok, 'Encryption should fail when keystore fails');
      assert(
        result.error.message.includes('Keystore encryption failed'),
        'Should have appropriate error message'
      );
    });
  });

  describe('decryptLabelGroup', () => {
    it('should decrypt data successfully', async () => {
      const keystore = new MockKeystore();
      const testData = { message: 'Hello, World!', number: 42 };

      // First encrypt the data
      const resolver = createTestResolver();
      const encryptResult = await encryptLabelGroup('system', testData, keystore, resolver);
      assert(encryptResult.ok, 'Encryption should succeed');

      const encryptedGroup = encryptResult.value;

      // Then decrypt it
      const decryptResult = await decryptLabelGroup(encryptedGroup, keystore);
      assert(decryptResult.ok, 'Decryption should succeed');

      const decryptedData = decryptResult.value;
      assert.deepStrictEqual(decryptedData, testData, 'Decrypted data should match original');
    });

    it('should fail for empty encrypted group', async () => {
      const keystore = new MockKeystore();
      const emptyGroup: EncryptedLabelGroup = {
        label: 'test',
        envelope: undefined,
      };

      const result = await decryptLabelGroup(emptyGroup, keystore);
      assert(!result.ok, 'Decryption should fail for empty group');
      assert(
        result.error.message.includes('Empty encrypted group'),
        'Should have appropriate error message'
      );
    });

    it('should handle keystore decryption errors gracefully', async () => {
      const failingKeystore = {
        ...new MockKeystore(),
        decryptEnvelope: () => {
          throw new Error('Keystore decryption failed');
        },
      };

      const encryptedGroup: EncryptedLabelGroup = {
        label: 'test',
        envelope: {
          encryptedData: new Uint8Array([1, 2, 3]),
          networkId: 'test',
          networkEncryptedKey: new Uint8Array(),
          profileEncryptedKeys: new Map(),
        },
      };

      const result = await decryptLabelGroup(encryptedGroup, failingKeystore);
      assert(!result.ok, 'Decryption should fail when keystore fails');
      assert(
        result.error.message.includes('Keystore decryption failed'),
        'Should have appropriate error message'
      );
    });
  });

  describe('decryptBytes', () => {
    it('should decrypt bytes successfully', async () => {
      const keystore = new MockKeystore();
      const originalData = new Uint8Array([1, 2, 3, 4, 5]);

      // Create valid CBOR-encoded EnvelopeEncryptedData for testing
      const testEnvelope = {
        encryptedData: originalData,
        networkId: 'test-network',
        networkEncryptedKey: new Uint8Array([4, 5, 6]),
        profileEncryptedKeys: { 'test-profile': new Uint8Array([7, 8, 9]) }
      };
      const testData = encode(testEnvelope);

      // Mock the keystore to return the original data
      const mockKeystore = {
        ...keystore,
        decryptEnvelope: (data: Buffer) => {
          // Return the original data for testing
          return Buffer.from(originalData);
        },
      };

      const result = await decryptBytes(testData, mockKeystore);
      if (!result.ok) {
        console.log('decryptBytes failed:', result.error.message);
      }
      assert(result.ok, 'Decryption should succeed');
      assert.deepStrictEqual(result.value, originalData, 'Decrypted bytes should match original');
    });

    it('should handle keystore errors gracefully', async () => {
      const failingKeystore = {
        ...new MockKeystore(),
        decryptEnvelope: () => {
          throw new Error('Keystore decryption failed');
        },
      };

      // Create valid CBOR-encoded EnvelopeEncryptedData for testing
      const testEnvelope = {
        encryptedData: new Uint8Array([1, 2, 3]),
        networkId: 'test-network',
        networkEncryptedKey: new Uint8Array([4, 5, 6]),
        profileEncryptedKeys: { 'test-profile': new Uint8Array([7, 8, 9]) }
      };
      const testData = encode(testEnvelope);

      const result = await decryptBytes(testData, failingKeystore);
      assert(!result.ok, 'Decryption should fail when keystore fails');
      assert(
        result.error.message.includes('Keystore decryption failed'),
        'Should have appropriate error message'
      );
    });
  });

  describe('EnvelopeEncryptedData interface', () => {
    it('should support all required properties', () => {
      const envelope: EnvelopeEncryptedData = {
        encryptedData: new Uint8Array([1, 2, 3]),
        networkId: 'test-network',
        networkEncryptedKey: new Uint8Array([4, 5, 6]),
        profileEncryptedKeys: new Map([
          ['user1', new Uint8Array([7, 8, 9])],
          ['user2', new Uint8Array([10, 11, 12])],
        ]),
      };

      assert(envelope.encryptedData instanceof Uint8Array);
      assert.strictEqual(envelope.networkId, 'test-network');
      assert(envelope.networkEncryptedKey instanceof Uint8Array);
      assert(envelope.profileEncryptedKeys instanceof Map);
      assert.strictEqual(envelope.profileEncryptedKeys.size, 2);
    });
  });

  describe('EncryptedLabelGroup interface', () => {
    it('should support all required properties', () => {
      const group: EncryptedLabelGroup = {
        label: 'test-label',
        envelope: {
          encryptedData: new Uint8Array([1, 2, 3]),
          networkId: 'test-network',
          networkEncryptedKey: new Uint8Array([4, 5, 6]),
          profileEncryptedKeys: new Map(),
        },
      };

      assert.strictEqual(group.label, 'test-label');
      assert(group.envelope);
      assert(group.envelope.encryptedData instanceof Uint8Array);
    });

    it('should support optional envelope', () => {
      const group: EncryptedLabelGroup = {
        label: 'test-label',
        envelope: undefined,
      };

      assert.strictEqual(group.label, 'test-label');
      assert(!group.envelope);
    });
  });
});
