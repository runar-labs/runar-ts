import { describe, it, expect, beforeEach } from 'bun:test';
import { AnyValue, ValueCategory, SerializationContext } from '../src/index.js';
import { encode, decode } from 'cbor-x';

// Mock keystore for testing lazy deserialization
class MockLazyKeystore {
  encryptWithEnvelope(data: Buffer, networkId: string | null, profilePublicKeys: Buffer[]): Buffer {
    // Create mock envelope structure
    const mockEnvelope = {
      encryptedData: data,
      networkId: networkId || 'test-network',
      networkEncryptedKey: Buffer.from('mock-network-key'),
      profileEncryptedKeys: { 'test-profile': Buffer.from('mock-profile-key') }
    };
    
    return Buffer.from(encode(mockEnvelope));
  }

  decryptEnvelope(eedCbor: Buffer): Buffer {
    try {
      // Parse and extract data from mock envelope
      const envelope = decode(eedCbor);
      if (envelope && envelope.encryptedData) {
        return envelope.encryptedData;
      } else {
        // If the envelope structure is not as expected, return the original data
        // This handles the case where we're testing with raw encrypted data
        return eedCbor;
      }
    } catch (error) {
      // If CBOR decode fails, return the original data
      // This handles the case where we're testing with raw encrypted data
      return eedCbor;
    }
  }

  // Mock other required methods
  ensureSymmetricKey(keyName: string): Buffer { return Buffer.from('mock-key'); }
  setLabelMapping(mappingCbor: Buffer): void {}
  setLocalNodeInfo(nodeInfoCbor: Buffer): void {}
  setPersistenceDir(dir: string): void {}
  enableAutoPersist(enabled: boolean): void {}
  async wipePersistence(): Promise<void> {}
  async flushState(): Promise<void> {}
  getKeystoreState(): number { return 1; }
  getKeystoreCaps(): any { return {}; }
}

describe('Lazy Deserialization Tests', () => {
  let keystore: MockLazyKeystore;
  let context: SerializationContext;

  beforeEach(() => {
    keystore = new MockLazyKeystore();
    context = {
      keystore,
      resolver: {} as any, // Mock resolver
      networkPublicKey: new Uint8Array([1, 2, 3, 4]),
      profilePublicKeys: [new Uint8Array([10, 11, 12, 13])]
    };
  });

  describe('Lazy Data Creation', () => {
    it('should create lazy holders for encrypted complex types', () => {
      const testData = { message: 'Hello, World!', number: 42 };
      const av = AnyValue.newStruct(testData);
      
      // Serialize with context to trigger encryption
      const serialized = av.serialize(context);
      expect(serialized.ok).toBe(true);
      
      // Deserialize should create lazy holder
      const deserialized = AnyValue.deserialize(serialized.value, { keystore });
      expect(deserialized.ok).toBe(true);
      
      // Should have lazy data for encrypted struct
      const lazyAv = deserialized.value;
      expect(lazyAv.getCategory()).toBe(ValueCategory.Struct);
      // Note: Lazy data is private, so we test through behavior
    });

    it('should handle encrypted lists with lazy deserialization', () => {
      const testData = ['item1', 'item2', 'item3'];
      const av = AnyValue.newList(testData);
      
      // Serialize with context
      const serialized = av.serialize(context);
      expect(serialized.ok).toBe(true);
      
      // Deserialize should create lazy holder
      const deserialized = AnyValue.deserialize(serialized.value, { keystore });
      expect(deserialized.ok).toBe(true);
      
      const lazyAv = deserialized.value;
      expect(lazyAv.getCategory()).toBe(ValueCategory.List);
    });

    it('should handle encrypted maps with lazy deserialization', () => {
      const testData = new Map([['key1', 'value1'], ['key2', 'value2']]);
      const av = AnyValue.newMap(testData);
      
      // Serialize with context
      const serialized = av.serialize(context);
      expect(serialized.ok).toBe(true);
      
      // Deserialize should create lazy holder
      const deserialized = AnyValue.deserialize(serialized.value, { keystore });
      expect(deserialized.ok).toBe(true);
      
      const lazyAv = deserialized.value;
      expect(lazyAv.getCategory()).toBe(ValueCategory.Map);
    });
  });

  describe('Lazy Data Access', () => {
    it('should deserialize lazy data on access', () => {
      const testData = { message: 'Hello, World!', number: 42 };
      const av = AnyValue.newStruct(testData);
      
      // Serialize and deserialize to create lazy holder
      const serialized = av.serialize(context);
      const deserialized = AnyValue.deserialize(serialized.value, { keystore });
      expect(deserialized.ok).toBe(true);
      
      // Access the lazy data
      const result = deserialized.value.asTypeRef<typeof testData>();
      expect(result.ok).toBe(true);
      expect(result.value).toEqual(testData);
    });

    it('should handle lazy list deserialization', () => {
      const testData = ['item1', 'item2', 'item3'];
      const av = AnyValue.newList(testData);
      
      // Serialize and deserialize to create lazy holder
      const serialized = av.serialize(context);
      const deserialized = AnyValue.deserialize(serialized.value, { keystore });
      expect(deserialized.ok).toBe(true);
      
      // Access the lazy data
      const result = deserialized.value.asTypeRef<string[]>();
      if (!result.ok) {
        console.log('Lazy list deserialization failed:', result.error.message);
      }
      expect(result.ok).toBe(true);
      expect(result.value).toEqual(testData);
    });

    it('should handle lazy map deserialization', () => {
      const testData = new Map([['key1', 'value1'], ['key2', 'value2']]);
      const av = AnyValue.newMap(testData);
      
      // Serialize and deserialize to create lazy holder
      const serialized = av.serialize(context);
      const deserialized = AnyValue.deserialize(serialized.value, { keystore });
      expect(deserialized.ok).toBe(true);
      
      // Access the lazy data
      const result = deserialized.value.asTypeRef<Record<string, string>>();
      if (!result.ok) {
        console.log('Lazy map deserialization failed:', result.error.message);
      }
      expect(result.ok).toBe(true);
      // CBOR serialization converts Map to plain object, so we expect the decoded form
      expect(result.value).toEqual({
        key1: "value1",
        key2: "value2"
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle decryption failures gracefully', () => {
      const testData = { message: 'Hello, World!', number: 42 };
      const av = AnyValue.newStruct(testData);
      
      // Serialize with context
      const serialized = av.serialize(context);
      expect(serialized.ok).toBe(true);
      
      // Create failing keystore
      const failingKeystore = {
        ...keystore,
        decryptEnvelope: () => { throw new Error('Decryption failed'); }
      };
      
      // Deserialize should still succeed but create lazy holder
      const deserialized = AnyValue.deserialize(serialized.value, { keystore: failingKeystore });
      expect(deserialized.ok).toBe(true);
      
      // Access should fail
      const result = deserialized.value.asTypeRef<typeof testData>();
      expect(result.ok).toBe(false);
      expect(result.error.message).toContain('Failed to deserialize lazy data');
    });

    it('should handle CBOR decode failures gracefully', () => {
      const testData = { message: 'Hello, World!', number: 42 };
      const av = AnyValue.newStruct(testData);
      
      // Serialize with context
      const serialized = av.serialize(context);
      expect(serialized.ok).toBe(true);
      
      // Create keystore that returns invalid data
      const invalidKeystore = {
        ...keystore,
        decryptEnvelope: () => Buffer.from('invalid-data')
      };
      
      // Deserialize should still succeed but create lazy holder
      const deserialized = AnyValue.deserialize(serialized.value, { keystore: invalidKeystore });
      expect(deserialized.ok).toBe(true);
      
      // Access should fail due to invalid CBOR
      const result = deserialized.value.asTypeRef<typeof testData>();
      expect(result.ok).toBe(false);
      expect(result.error.message).toContain('Failed to deserialize lazy data');
    });
  });
});
