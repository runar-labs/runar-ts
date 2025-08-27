import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AnyValue, SerializationContext } from '../src/index.js';
import { KeysManagerDelegate, CommonKeysInterface } from '../../runar-ts-node/src/keys_manager_delegate.js';
import { Keys } from 'runar-nodejs-api';

// Mock Keys class for testing
class MockKeys {
  private platform: 'mobile' | 'node';
  
  constructor(platform: 'mobile' | 'node') {
    this.platform = platform;
  }
  
  initAsMobile(): void {
    this.platform = 'mobile';
  }
  
  initAsNode(): void {
    this.platform = 'node';
  }
  
  mobileEncryptWithEnvelope(data: Buffer, networkId: string | null, profilePublicKeys: Buffer[]): Buffer {
    // Simple mock encryption - just prefix with 'mobile_encrypted:'
    return Buffer.concat([Buffer.from('mobile_encrypted:'), data]);
  }
  
  nodeEncryptWithEnvelope(data: Buffer, networkId: string | null, profilePublicKeys: Buffer[]): Buffer {
    // Simple mock encryption - just prefix with 'node_encrypted:'
    return Buffer.concat([Buffer.from('node_encrypted:'), data]);
  }
  
  mobileDecryptEnvelope(eedCbor: Buffer): Buffer {
    // Simple mock decryption - remove 'mobile_encrypted:' prefix
    const prefix = Buffer.from('mobile_encrypted:');
    if (eedCbor.subarray(0, prefix.length).equals(prefix)) {
      return eedCbor.subarray(prefix.length);
    }
    throw new Error('Invalid mobile encrypted data format');
  }
  
  nodeDecryptEnvelope(eedCbor: Buffer): Buffer {
    // Simple mock decryption - remove 'node_encrypted:' prefix
    const prefix = Buffer.from('node_encrypted:');
    if (eedCbor.subarray(0, prefix.length).equals(prefix)) {
      return eedCbor.subarray(prefix.length);
    }
    throw new Error('Invalid node encrypted data format');
  }
  
  // Mock other required methods
  ensureSymmetricKey(keyName: string): Buffer {
    return Buffer.from(`symmetric_key_${keyName}`);
  }
  
  setLabelMapping(mappingCbor: Buffer): void {}
  setLocalNodeInfo(nodeInfoCbor: Buffer): void {}
  setPersistenceDir(dir: string): void {}
  enableAutoPersist(enabled: boolean): void {}
  async wipePersistence(): Promise<void> {}
  async flushState(): Promise<void> {}
  
  mobileGetKeystoreState(): number {
    return 1; // Mock state
  }
  
  nodeGetKeystoreState(): number {
    return 2; // Mock state
  }
  
  getKeystoreCaps(): any {
    return { capabilities: 'mock' };
  }
}

describe('Serializer with CommonKeysInterface', () => {
  it('should encrypt and decrypt using mobile keys delegate', async () => {
    // Create mock keys and delegate
    const mockKeys = new MockKeys('mobile');
    mockKeys.initAsMobile();
    
    const keysDelegate = new KeysManagerDelegate(mockKeys as any, 'mobile');
    
    // Create serialization context
    const context: SerializationContext = {
      keystore: keysDelegate
    };
    
    // Test data
    const testData = { message: 'Hello, World!', number: 42 };
    const dataBuffer = Buffer.from(JSON.stringify(testData));
    
    // Encrypt using delegate
    const encrypted = keysDelegate.encryptWithEnvelope(dataBuffer, 'test-network', []);
    
    // Verify encryption worked
    assert(encrypted.toString().startsWith('mobile_encrypted:'));
    
    // Decrypt using delegate
    const decrypted = keysDelegate.decryptEnvelope(encrypted);
    
    // Verify decryption worked
    assert.deepStrictEqual(decrypted, dataBuffer);
    
    // Test with AnyValue serialization
    const anyValue = AnyValue.newBytes(dataBuffer);
    const serialized = await anyValue.serialize(context);
    
    assert(serialized.ok);
    assert(serialized.value.length > 0);
  });

  it('should encrypt and decrypt using node keys delegate', async () => {
    // Create mock keys and delegate
    const mockKeys = new MockKeys('node');
    mockKeys.initAsNode();
    
    const keysDelegate = new KeysManagerDelegate(mockKeys as any, 'node');
    
    // Create serialization context
    const context: SerializationContext = {
      keystore: keysDelegate
    };
    
    // Test data
    const testData = { message: 'Hello, Node!', number: 123 };
    const dataBuffer = Buffer.from(JSON.stringify(testData));
    
    // Encrypt using delegate
    const encrypted = keysDelegate.encryptWithEnvelope(dataBuffer, 'test-network', []);
    
    // Verify encryption worked
    assert(encrypted.toString().startsWith('node_encrypted:'));
    
    // Decrypt using delegate
    const decrypted = keysDelegate.decryptEnvelope(encrypted);
    
    // Verify decryption worked
    assert.deepStrictEqual(decrypted, dataBuffer);
    
    // Test with AnyValue serialization
    const anyValue = AnyValue.newBytes(dataBuffer);
    const serialized = await anyValue.serialize(context);
    
    assert(serialized.ok);
    assert(serialized.value.length > 0);
  });

  it('should handle keystore state queries', () => {
    // Create mock keys and delegate
    const mobileKeys = new MockKeys('mobile');
    const mobileDelegate = new KeysManagerDelegate(mobileKeys as any, 'mobile');
    
    const nodeKeys = new MockKeys('node');
    const nodeDelegate = new KeysManagerDelegate(nodeKeys as any, 'node');
    
    // Test keystore state
    assert.equal(mobileDelegate.getKeystoreState(), 1);
    assert.equal(nodeDelegate.getKeystoreState(), 2);
  });

  it('should handle utility methods', () => {
    // Create mock keys and delegate
    const mockKeys = new MockKeys('node');
    const keysDelegate = new KeysManagerDelegate(mockKeys as any, 'node');
    
    // Test utility methods
    const symmetricKey = keysDelegate.ensureSymmetricKey('test-key');
    assert(symmetricKey.toString().includes('symmetric_key_test-key'));
    
    // Test configuration methods (should not throw)
    keysDelegate.setLabelMapping(Buffer.from('test'));
    keysDelegate.setLocalNodeInfo(Buffer.from('test'));
    keysDelegate.setPersistenceDir('./test');
    keysDelegate.enableAutoPersist(true);
  });
});
