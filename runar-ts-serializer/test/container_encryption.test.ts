import { describe, it, expect, beforeEach } from 'bun:test';
import { AnyValue, ValueCategory, SerializationContext } from '../src/index.js';
import { registerEncrypt, registerDecrypt, registerWireName } from '../src/index.js';

// Test class for encryption
class TestProfile {
  constructor(
    public name: string,
    public age: number
  ) {}

  encryptWithKeystore(keystore: any, resolver: any) {
    // Simple mock encryption
    const encrypted = { name: this.name, age: this.age, _encrypted: true };
    const { encode } = require('cbor-x');
    return { ok: true, value: new Uint8Array(encode(encrypted)) };
  }

  decryptWithKeystore(keystore: any) {
    // Simple mock decryption
    return { ok: true, value: new TestProfile(this.name, this.age) };
  }
}

// Mock keystore for testing
class MockContainerKeystore {
  encryptWithEnvelope(data: Buffer, networkId: string | null, profilePublicKeys: Buffer[]): Buffer {
    // Create mock envelope structure
    const mockEnvelope = {
      encryptedData: data,
      networkId: networkId || 'test-network',
      networkEncryptedKey: Buffer.from('mock-network-key'),
      profileEncryptedKeys: { 'test-profile': Buffer.from('mock-profile-key') },
    };

    const { encode } = require('cbor-x');
    return Buffer.from(encode(mockEnvelope));
  }

  decryptEnvelope(eedCbor: Buffer): Buffer {
    // Parse and extract data from mock envelope
    const { decode } = require('cbor-x');
    const envelope = decode(eedCbor);
    return envelope.encryptedData;
  }

  // Mock other required methods
  ensureSymmetricKey(keyName: string): Buffer {
    return Buffer.from('mock-key');
  }
  setLabelMapping(mappingCbor: Buffer): void {}
  setLocalNodeInfo(nodeInfoCbor: Buffer): void {}
  setPersistenceDir(dir: string): void {}
  enableAutoPersist(enabled: boolean): void {}
  async wipePersistence(): Promise<void> {}
  async flushState(): Promise<void> {}
  getKeystoreState(): number {
    return 1;
  }
  getKeystoreCaps(): any {
    return {};
  }
}

describe('Container Element Encryption Tests', () => {
  let keystore: MockContainerKeystore;
  let context: SerializationContext;

  beforeEach(() => {
    keystore = new MockContainerKeystore();
    context = {
      keystore,
      resolver: {} as any, // Mock resolver
      networkPublicKey: new Uint8Array([1, 2, 3, 4]),
      profilePublicKeys: [new Uint8Array([10, 11, 12, 13])],
    };

    // Register test types for encryption
    registerWireName('TestProfile', 'test_profile');
    registerEncrypt('TestProfile', (value: TestProfile, keystore: any, resolver: any) => {
      return value.encryptWithKeystore(keystore, resolver);
    });
    registerDecrypt('TestProfile', (bytes: Uint8Array, keystore: any) => {
      const { decode } = require('cbor-x');
      const data = decode(bytes);
      return { ok: true, value: new TestProfile(data.name, data.age) };
    });
  });

  describe('List Element Encryption', () => {
    it('should encrypt list elements when encryptors are available', () => {
      const profiles = [
        new TestProfile('Alice', 25),
        new TestProfile('Bob', 30),
        new TestProfile('Charlie', 35),
      ];

      const av = AnyValue.newList(profiles);

      // Serialize with context to trigger element encryption
      const serialized = av.serialize(context);
      expect(serialized.ok).toBe(true);

      // The serialized data should be encrypted at element level
      expect(serialized.value.length).toBeGreaterThan(0);
    });

    it('should fallback to plain serialization when no encryptors available', () => {
      const plainData = ['string1', 'string2', 'string3'];

      const av = AnyValue.newList(plainData);

      // Serialize without context (no encryption)
      const serialized = av.serialize();
      expect(serialized.ok).toBe(true);

      // Should serialize as plain data
      expect(serialized.value.length).toBeGreaterThan(0);
    });

    it('should handle mixed encrypted/unencrypted elements gracefully', () => {
      const mixedData = [
        new TestProfile('Alice', 25), // Has encryptor
        'plain string', // No encryptor
        new TestProfile('Bob', 30), // Has encryptor
      ];

      const av = AnyValue.newList(mixedData);

      // Serialize with context - should fallback to plain since not all elements can be encrypted
      const serialized = av.serialize(context);
      expect(serialized.ok).toBe(true);

      // Should serialize as plain data due to mixed types
      expect(serialized.value.length).toBeGreaterThan(0);
    });
  });

  describe('Map Element Encryption', () => {
    it('should encrypt map values when encryptors are available', () => {
      const profileMap = new Map([
        ['alice', new TestProfile('Alice', 25)],
        ['bob', new TestProfile('Bob', 30)],
        ['charlie', new TestProfile('Charlie', 35)],
      ]);

      const av = AnyValue.newMap(profileMap);

      // Serialize with context to trigger value encryption
      const serialized = av.serialize(context);
      expect(serialized.ok).toBe(true);

      // The serialized data should be encrypted at value level
      expect(serialized.value.length).toBeGreaterThan(0);
    });

    it('should fallback to plain serialization when no encryptors available', () => {
      const plainMap = new Map([
        ['key1', 'value1'],
        ['key2', 'value2'],
        ['key3', 'value3'],
      ]);

      const av = AnyValue.newMap(plainMap);

      // Serialize without context (no encryption)
      const serialized = av.serialize();
      expect(serialized.ok).toBe(true);

      // Should serialize as plain data
      expect(serialized.value.length).toBeGreaterThan(0);
    });

    it('should handle mixed encrypted/unencrypted values gracefully', () => {
      const mixedMap = new Map([
        ['profile1', new TestProfile('Alice', 25)], // Has encryptor
        ['plain1', 'plain value'], // No encryptor
        ['profile2', new TestProfile('Bob', 30)], // Has encryptor
      ]);

      const av = AnyValue.newMap(mixedMap);

      // Serialize with context - should fallback to plain since not all values can be encrypted
      const serialized = av.serialize(context);
      expect(serialized.ok).toBe(true);

      // Should serialize as plain data due to mixed types
      expect(serialized.value.length).toBeGreaterThan(0);
    });
  });

  describe('Wire Name Parameterization', () => {
    it('should generate proper wire names for encrypted containers', () => {
      const profiles = [new TestProfile('Alice', 25)];
      const av = AnyValue.newList(profiles);

      // The wire name should reflect the element type
      expect(av.getTypeName()).toBe('list');

      // Serialize to trigger wire name generation
      const serialized = av.serialize(context);
      expect(serialized.ok).toBe(true);
    });

    it('should handle heterogeneous containers with fallback wire names', () => {
      const mixedData = [new TestProfile('Alice', 25), 'plain string'];
      const av = AnyValue.newList(mixedData);

      // Should use fallback wire name for heterogeneous data
      expect(av.getTypeName()).toBe('list');

      // Serialize to trigger wire name generation
      const serialized = av.serialize(context);
      expect(serialized.ok).toBe(true);
    });
  });
});
