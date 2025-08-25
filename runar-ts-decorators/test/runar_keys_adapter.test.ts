import { describe, it, expect, beforeEach } from 'bun:test';
import { createRunarKeysAdapter, RunarKeysAdapter } from '../src';

// Mock Keys class that simulates the new runar-nodejs-api
class MockKeys {
  private managerType: 'mobile' | 'node' | null = null;
  private initialized = false;

  initAsMobile(): void {
    if (this.initialized && this.managerType !== 'mobile') {
      throw new Error('Already initialized as different manager type');
    }
    this.managerType = 'mobile';
    this.initialized = true;
  }

  initAsNode(): void {
    if (this.initialized && this.managerType !== 'node') {
      throw new Error('Already initialized as different manager type');
    }
    this.managerType = 'node';
    this.initialized = true;
  }

  mobileEncryptWithEnvelope(data: Buffer, networkId: string, profilePublicKeys: Buffer[]): Buffer {
    if (this.managerType !== 'mobile') {
      throw new Error('Mobile manager not initialized');
    }
    // Simple mock: prepend "mobile_encrypted:" to the data
    const encrypted = Buffer.alloc(data.length + 18);
    encrypted.write('mobile_encrypted:', 0);
    data.copy(encrypted, 18);
    return encrypted;
  }

  nodeEncryptWithEnvelope(data: Buffer, networkId: string, profilePublicKeys: Buffer[]): Buffer {
    if (this.managerType !== 'node') {
      throw new Error('Node manager not initialized');
    }
    // Simple mock: prepend "node_encrypted:" to the data
    const encrypted = Buffer.alloc(data.length + 15);
    encrypted.write('node_encrypted:', 0);
    data.copy(encrypted, 15);
    return encrypted;
  }

  mobileDecryptEnvelope(encryptedData: Buffer): Buffer {
    if (this.managerType !== 'mobile') {
      throw new Error('Mobile manager not initialized');
    }
    // Remove "mobile_encrypted:" prefix
    if (encryptedData.toString('utf8', 0, 18) === 'mobile_encrypted:') {
      return encryptedData.subarray(18);
    }
    // If it's not mobile encrypted, try local decryption as fallback
    return this.decryptLocalData(encryptedData);
  }

  nodeDecryptEnvelope(encryptedData: Buffer): Buffer {
    if (this.managerType !== 'node') {
      throw new Error('Node manager not initialized');
    }
    // Remove "node_encrypted:" prefix
    if (encryptedData.toString('utf8', 0, 15) === 'node_encrypted:') {
      return encryptedData.subarray(15);
    }
    // If it's not node encrypted, try local decryption as fallback
    return this.decryptLocalData(encryptedData);
  }

  encryptLocalData(data: Buffer): Buffer {
    // Simple mock: prepend "local_encrypted:" to the data
    const encrypted = Buffer.alloc(data.length + 16);
    encrypted.write('local_encrypted:', 0);
    data.copy(encrypted, 16);
    return encrypted;
  }

  decryptLocalData(encryptedData: Buffer): Buffer {
    // Remove "local_encrypted:" prefix
    if (encryptedData.toString('utf8', 0, 16) === 'local_encrypted:') {
      return encryptedData.subarray(16);
    }
    // If it's not local encrypted, try to detect other formats
    if (encryptedData.toString('utf8', 0, 18) === 'mobile_encrypted:') {
      return encryptedData.subarray(18);
    }
    if (encryptedData.toString('utf8', 0, 15) === 'node_encrypted:') {
      return encryptedData.subarray(15);
    }
    // If no known format, return as-is (for testing purposes)
    return encryptedData;
  }
}

describe('RunarKeysAdapter', () => {
  let mockKeys: MockKeys;
  let mobileAdapter: RunarKeysAdapter;
  let nodeAdapter: RunarKeysAdapter;

  beforeEach(() => {
    mockKeys = new MockKeys();
    mobileAdapter = createRunarKeysAdapter(mockKeys, 'mobile');
    nodeAdapter = createRunarKeysAdapter(mockKeys, 'node');
  });

  describe('Mobile Manager Mode', () => {
    beforeEach(() => {
      mockKeys.initAsMobile();
    });

    it('should encrypt data using mobile envelope encryption when network context is available', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      const keyInfo = {
        networkId: 'test-network',
        profilePublicKeys: [new Uint8Array([0x42, 0x43])],
      };

      const encrypted = await mobileAdapter.encrypt(data, keyInfo);
      const result = Buffer.from(encrypted).toString('utf8');

      expect(result).toStartWith('mobile_encrypted:');
      expect(result).toContain('mobile_encrypted:');
    });

    it('should fall back to local encryption when no network context', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      const keyInfo = {
        profilePublicKeys: [], // No network context
      };

      const encrypted = await mobileAdapter.encrypt(data, keyInfo);
      const result = Buffer.from(encrypted).toString('utf8');

      expect(result).toStartWith('local_encrypted:');
    });

    it('should decrypt data using mobile envelope decryption', async () => {
      const originalData = new Uint8Array([1, 2, 3, 4]);
      const keyInfo = {
        networkId: 'test-network',
        profilePublicKeys: [new Uint8Array([0x42, 0x43])],
      };

      const encrypted = await mobileAdapter.encrypt(originalData, keyInfo);
      const decrypted = await mobileAdapter.decrypt(encrypted, keyInfo);

      expect(decrypted).toEqual(originalData);
    });

    it('should support direct envelope encryption', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      const networkId = 'test-network';
      const profilePublicKeys = [new Uint8Array([0x42, 0x43])];

      const encrypted = await mobileAdapter.encryptWithEnvelope(data, networkId, profilePublicKeys);
      const result = Buffer.from(encrypted).toString('utf8');

      expect(result).toStartWith('mobile_encrypted:');
    });

    it('should support direct envelope decryption', async () => {
      const originalData = new Uint8Array([1, 2, 3, 4]);
      const networkId = 'test-network';
      const profilePublicKeys = [new Uint8Array([0x42, 0x43])];

      const encrypted = await mobileAdapter.encryptWithEnvelope(
        originalData,
        networkId,
        profilePublicKeys
      );
      const decrypted = await mobileAdapter.decryptEnvelope(encrypted);

      expect(decrypted).toEqual(originalData);
    });
  });

  describe('Node Manager Mode', () => {
    beforeEach(() => {
      mockKeys.initAsNode();
    });

    it('should encrypt data using node envelope encryption when network context is available', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      const keyInfo = {
        networkId: 'test-network',
        profilePublicKeys: [new Uint8Array([0x42, 0x43])],
      };

      const encrypted = await nodeAdapter.encrypt(data, keyInfo);
      const result = Buffer.from(encrypted).toString('utf8');

      expect(result).toStartWith('node_encrypted:');
    });

    it('should fall back to local encryption when no network context', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      const keyInfo = {
        profilePublicKeys: [], // No network context
      };

      const encrypted = await nodeAdapter.encrypt(data, keyInfo);
      const result = Buffer.from(encrypted).toString('utf8');

      expect(result).toStartWith('local_encrypted:');
    });

    it('should decrypt data using node envelope decryption', async () => {
      const originalData = new Uint8Array([1, 2, 3, 4]);
      const keyInfo = {
        networkId: 'test-network',
        profilePublicKeys: [new Uint8Array([0x42, 0x43])],
      };

      const encrypted = await nodeAdapter.encrypt(originalData, keyInfo);
      const decrypted = await nodeAdapter.decrypt(encrypted, keyInfo);

      expect(decrypted).toEqual(originalData);
    });

    it('should support direct envelope encryption', async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      const networkId = 'test-network';
      const profilePublicKeys = [new Uint8Array([0x42, 0x43])];

      const encrypted = await nodeAdapter.encryptWithEnvelope(data, networkId, profilePublicKeys);
      const result = Buffer.from(encrypted).toString('utf8');

      expect(result).toStartWith('node_encrypted:');
    });

    it('should support direct envelope decryption', async () => {
      const originalData = new Uint8Array([1, 2, 3, 4]);
      const networkId = 'test-network';
      const profilePublicKeys = [new Uint8Array([0x42, 0x43])];

      const encrypted = await nodeAdapter.encryptWithEnvelope(
        originalData,
        networkId,
        profilePublicKeys
      );
      const decrypted = await nodeAdapter.decryptEnvelope(encrypted);

      expect(decrypted).toEqual(originalData);
    });
  });

  describe('Factory Function', () => {
    it('should create mobile adapter by default', () => {
      const adapter = createRunarKeysAdapter(mockKeys);
      expect(adapter).toBeInstanceOf(RunarKeysAdapter);
    });

    it('should create adapter with specified manager type', () => {
      const mobileAdapter = createRunarKeysAdapter(mockKeys, 'mobile');
      const nodeAdapter = createRunarKeysAdapter(mockKeys, 'node');

      expect(mobileAdapter).toBeInstanceOf(RunarKeysAdapter);
      expect(nodeAdapter).toBeInstanceOf(RunarKeysAdapter);
    });
  });
});
