import { NodeConfig } from '../src/config';
import { Node } from '../src/index';
import { KeysManagerWrapper } from '../src/keys_manager_wrapper';

// Mock Keys class for testing
class MockKeys {
  initAsNode() {
    // Mock implementation
  }
  
  nodeEncryptWithEnvelope(data: Buffer, networkId: string | null, profilePublicKeys: Buffer[]): Buffer {
    // Mock encryption - just return the data as-is for testing
    return data;
  }
  
  nodeDecryptEnvelope(eedCbor: Buffer): Buffer {
    // Mock decryption - just return the data as-is for testing
    return eedCbor;
  }
  
  ensureSymmetricKey(keyName: string): Buffer {
    return Buffer.from(`mock-key-${keyName}`);
  }
  
  setLabelMapping(mappingCbor: Buffer): void {
    // Mock implementation
  }
  
  setLocalNodeInfo(nodeInfoCbor: Buffer): void {
    // Mock implementation
  }
  
  setPersistenceDir(dir: string): void {
    // Mock implementation
  }
  
  enableAutoPersist(enabled: boolean): void {
    // Mock implementation
  }
  
  async wipePersistence(): Promise<void> {
    // Mock implementation
  }
  
  async flushState(): Promise<void> {
    // Mock implementation
  }
  
  nodeGetKeystoreState(): number {
    return 1; // Mock state
  }
  
  getKeystoreCaps(): any {
    return { capabilities: ['encryption', 'decryption'] };
  }
}

describe('Keys Manager Integration (Rust-Aligned)', () => {
  it('should create NodeConfig with keys manager using builder pattern', () => {
    const mockKeys = new MockKeys();
    
    const config = new NodeConfig('test-network')
      .withKeyManager(mockKeys)
      .withAdditionalNetworks(['network1', 'network2'])
      .withRequestTimeout(5000);
    
    expect(config.defaultNetworkId).toBe('test-network');
    expect(config.networkIds).toEqual(['network1', 'network2']);
    expect(config.requestTimeoutMs).toBe(5000);
    expect(config.getKeyManager()).toBe(mockKeys);
  });
  
  it('should create Node with keys manager from config', () => {
    const mockKeys = new MockKeys();
    
    const config = new NodeConfig('test-network')
      .withKeyManager(mockKeys);
    
    const node = new Node(config);
    
    expect(node.getKeysWrapper()).toBeInstanceOf(KeysManagerWrapper);
  });
  
  it('should create serialization context from node', () => {
    const mockKeys = new MockKeys();
    
    const config = new NodeConfig('test-network')
      .withKeyManager(mockKeys);
    
    const node = new Node(config);
    
    const context = node.createSerializationContext();
    
    expect(context.keystore).toBeInstanceOf(KeysManagerWrapper);
    expect(context.resolver).toBeUndefined();
  });
  
  it('should use keys wrapper for encryption operations', () => {
    const mockKeys = new MockKeys();
    
    const config = new NodeConfig('test-network')
      .withKeyManager(mockKeys);
    
    const node = new Node(config);
    const wrapper = node.getKeysWrapper();
    
    const testData = Buffer.from('test-data');
    const networkId = 'test-network';
    const profileKeys = [Buffer.from('profile-key')];
    
    const encrypted = wrapper.encryptWithEnvelope(testData, networkId, profileKeys);
    const decrypted = wrapper.decryptEnvelope(encrypted);
    
    // Since we're using mock keys, encryption/decryption just returns the data as-is
    expect(decrypted).toEqual(testData);
  });
  
  it('should handle symmetric key operations', () => {
    const mockKeys = new MockKeys();
    
    const config = new NodeConfig('test-network')
      .withKeyManager(mockKeys);
    
    const node = new Node(config);
    const wrapper = node.getKeysWrapper();
    
    const keyName = 'test-symmetric-key';
    const symmetricKey = wrapper.ensureSymmetricKey(keyName);
    
    expect(symmetricKey).toEqual(Buffer.from(`mock-key-${keyName}`));
  });
  
  it('should throw error when creating Node without keys manager', () => {
    const config = new NodeConfig('test-network');
    // No keys manager set
    
    expect(() => {
      new Node(config);
    }).toThrow('Failed to load node credentials. Use withKeyManager() method.');
  });
});

