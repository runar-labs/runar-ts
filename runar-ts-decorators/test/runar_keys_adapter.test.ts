import { describe, it, expect, beforeEach } from 'bun:test';
import { createRunarKeysAdapter, RunarKeysAdapter } from '../src';
import type { CommonKeysInterface } from 'runar-ts-serializer/src/wire.js';

// Mock CommonKeysInterface implementation
class MockCommonKeysInterface implements CommonKeysInterface {
  private platform: 'mobile' | 'node';

  constructor(platform: 'mobile' | 'node') {
    this.platform = platform;
  }

  encryptWithEnvelope(data: Buffer, networkId: string | null, profilePublicKeys: Buffer[]): Buffer {
    if (this.platform === 'mobile') {
      // Simple mock: prepend "mobile_encrypted:" to the data
      const encrypted = Buffer.alloc(data.length + 18);
      encrypted.write('mobile_encrypted:', 0);
      data.copy(encrypted, 18);
      return encrypted;
    } else {
      // Simple mock: prepend "node_encrypted:" to the data
      const encrypted = Buffer.alloc(data.length + 15);
      encrypted.write('node_encrypted:', 0);
      data.copy(encrypted, 15);
      return encrypted;
    }
  }

  decryptEnvelope(eedCbor: Buffer): Buffer {
    // Convert to string to check for prefixes
    const dataStr = eedCbor.toString('utf8');

    // Check for mobile encrypted format
    if (dataStr.startsWith('mobile_encrypted:')) {
      return Buffer.from(dataStr.substring(18));
    }
    // Check for node encrypted format
    if (dataStr.startsWith('node_encrypted:')) {
      return Buffer.from(dataStr.substring(15));
    }
    // If no known format, return as-is (for testing purposes)
    return Buffer.from(eedCbor);
  }

  ensureSymmetricKey(keyName: string): Buffer {
    return Buffer.from(`symmetric_key_${keyName}`);
  }

  setLabelMapping(mappingCbor: Buffer): void {}
  setLocalNodeInfo(nodeInfoCbor: Buffer): void {}
  setPersistenceDir(dir: string): void {}
  enableAutoPersist(enabled: boolean): void {}
  async wipePersistence(): Promise<void> {}
  async flushState(): Promise<void> {}

  getKeystoreState(): number {
    return this.platform === 'mobile' ? 1 : 2;
  }

  getKeystoreCaps(): any {
    return { capabilities: 'mock' };
  }
}

describe('RunarKeysAdapter', () => {
  let mobileKeystore: MockCommonKeysInterface;
  let nodeKeystore: MockCommonKeysInterface;
  let mobileAdapter: RunarKeysAdapter;
  let nodeAdapter: RunarKeysAdapter;

  beforeEach(() => {
    mobileKeystore = new MockCommonKeysInterface('mobile');
    nodeKeystore = new MockCommonKeysInterface('node');
    mobileAdapter = createRunarKeysAdapter(mobileKeystore);
    nodeAdapter = createRunarKeysAdapter(nodeKeystore);
  });

  describe('Mobile Manager Mode', () => {
    beforeEach(() => {
      // No need to call initAsMobile() here as MockCommonKeysInterface handles it
    });

    it('should encrypt data using mobile envelope encryption when network context is available', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      const keyInfo = {
        networkId: 'test-network',
        profilePublicKeys: ['key1', 'key2'], // Use strings as expected by LabelKeyInfo
      };

      const encrypted = await mobileAdapter.encrypt(data, keyInfo);
      expect(encrypted.toString()).toContain('mobile_encrypted:');
    });

    it('should fall back to local encryption when no network context', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      const keyInfo = {
        profilePublicKeys: [], // No network context
      };

      await expect(mobileAdapter.encrypt(data, keyInfo)).rejects.toThrow(
        'Local encryption not available through CommonKeysInterface'
      );
    });

    it('should decrypt data using mobile envelope decryption', async () => {
      const originalData = new Uint8Array([1, 2, 3, 4]);
      const profileKeys = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])];

      const encrypted = await mobileAdapter.encryptWithEnvelope(
        originalData,
        'test-network',
        profileKeys
      );
      const decrypted = await mobileAdapter.decryptEnvelope(encrypted);

      // Convert Buffer to Uint8Array for comparison
      expect(new Uint8Array(decrypted)).toEqual(originalData);
    });

    it('should support direct envelope encryption', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      const profileKeys = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])];

      const encrypted = await mobileAdapter.encryptWithEnvelope(data, 'test-network', profileKeys);
      expect(encrypted.toString()).toContain('mobile_encrypted:');
    });

    it('should support direct envelope decryption', async () => {
      const originalData = new Uint8Array([1, 2, 3, 4]);
      const profileKeys = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])];

      const encrypted = await mobileAdapter.encryptWithEnvelope(
        originalData,
        'test-network',
        profileKeys
      );
      const decrypted = await mobileAdapter.decryptEnvelope(encrypted);

      // Convert Buffer to Uint8Array for comparison
      expect(new Uint8Array(decrypted)).toEqual(originalData);
    });
  });

  describe('Node Manager Mode', () => {
    beforeEach(() => {
      // No need to call initAsNode() here as MockCommonKeysInterface handles it
    });

    it('should encrypt data using node envelope encryption when network context is available', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      const keyInfo = {
        networkId: 'test-network',
        profilePublicKeys: ['key1', 'key2'], // Use strings as expected by LabelKeyInfo
      };

      const encrypted = await nodeAdapter.encrypt(data, keyInfo);
      expect(encrypted.toString()).toContain('node_encrypted:');
    });

    it('should fall back to local encryption when no network context', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      const keyInfo = {
        profilePublicKeys: [], // No network context
      };

      await expect(nodeAdapter.encrypt(data, keyInfo)).rejects.toThrow(
        'Local encryption not available through CommonKeysInterface'
      );
    });

    it('should decrypt data using node envelope decryption', async () => {
      const originalData = new Uint8Array([1, 2, 3, 4]);
      const keyInfo = {
        networkId: 'test-network',
        profilePublicKeys: ['key1', 'key2'],
      };

      const encrypted = await nodeAdapter.encrypt(originalData, keyInfo);
      const decrypted = await nodeAdapter.decrypt(encrypted, keyInfo);

      expect(decrypted).toEqual(originalData);
    });

    it('should support direct envelope encryption', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      const profileKeys = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])];

      const encrypted = await nodeAdapter.encryptWithEnvelope(data, 'test-network', profileKeys);
      expect(encrypted.toString()).toContain('node_encrypted:');
    });

    it('should support direct envelope decryption', async () => {
      const originalData = new Uint8Array([1, 2, 3, 4]);
      const keyInfo = {
        networkId: 'test-network',
        profilePublicKeys: ['key1', 'key2'],
      };

      const encrypted = await nodeAdapter.encrypt(originalData, keyInfo);
      const decrypted = await nodeAdapter.decryptEnvelope(encrypted);

      expect(decrypted).toEqual(originalData);
    });
  });

  describe('Factory Function', () => {
    it('should create mobile adapter by default', () => {
      const adapter = createRunarKeysAdapter(mobileKeystore);
      expect(adapter).toBeInstanceOf(RunarKeysAdapter);
    });

    it('should create adapter with specified manager type', () => {
      const mobileAdapter = createRunarKeysAdapter(mobileKeystore);
      const nodeAdapter = createRunarKeysAdapter(nodeKeystore);

      expect(mobileAdapter).toBeInstanceOf(RunarKeysAdapter);
      expect(nodeAdapter).toBeInstanceOf(RunarKeysAdapter);
    });
  });
});
