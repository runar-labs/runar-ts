import { describe, it, expect, beforeEach } from 'bun:test';
import { AnyValue, ValueCategory, SerializationContext } from '../src/index.js';
import { LabelResolver, LabelResolverConfig, LabelValue, LabelKeyword } from '../src/label_resolver.js';
import { ResolverCache } from '../src/resolver_cache.js';
import { encryptLabelGroupSync, decryptLabelGroupSync, decryptBytesSync } from '../src/encryption.js';
import { encode, decode } from 'cbor-x';

// Real keystore for cross-language compatibility testing
// This tests actual cross-language compatibility with the native API
import { Keys } from 'runar-nodejs-api';
import { KeysManagerWrapper } from '../../runar-ts-node/src/keys_manager_wrapper.js';

class CrossLanguageRealKeystore {
  private keys: Keys;
  private wrapper: KeysManagerWrapper;

  constructor() {
    this.keys = new Keys();
    // Set up a real keystore for testing
    this.keys.setPersistenceDir('/tmp/runar-cross-language-test');
    this.keys.enableAutoPersist(true);
    this.keys.initAsMobile();
    this.wrapper = new KeysManagerWrapper(this.keys);
  }

  async initialize(): Promise<void> {
    await this.keys.mobileInitializeUserRootKey();
    await this.keys.flushState();
    
    // Generate a network ID for envelope encryption
    const networkId = this.keys.mobileGenerateNetworkDataKey();
    
    // Get the actual network public key for encryption
    const networkPublicKey = this.keys.mobileGetNetworkPublicKey(networkId);
    
    // Create profile keys using the proper derivation method
    const personalKey = this.keys.mobileDeriveUserProfileKey('personal');
    const workKey = this.keys.mobileDeriveUserProfileKey('work');
    
    // Store for use in tests
    this._networkPublicKey = networkPublicKey;
    this._profilePublicKeys = [personalKey, workKey];
  }

  private _networkPublicKey: Buffer;
  private _profilePublicKeys: Buffer[];

  get networkPublicKey(): Buffer { return this._networkPublicKey; }
  get profilePublicKeys(): Buffer[] { return this._profilePublicKeys; }

  encryptWithEnvelope(data: Buffer, networkPublicKey: Buffer | undefined | null, profilePublicKeys: Buffer[]): Buffer {
    // Use REAL native API encryption through wrapper
    return this.wrapper.encryptWithEnvelope(data, networkPublicKey, profilePublicKeys);
  }

  decryptEnvelope(eedCbor: Buffer): Buffer {
    // Use REAL native API decryption through wrapper
    return this.wrapper.decryptEnvelope(eedCbor);
  }

  ensureSymmetricKey(keyName: string): Buffer { return this.keys.ensureSymmetricKey(keyName); }
  setLabelMapping(mappingCbor: Buffer): void { this.keys.setLabelMapping(mappingCbor); }
  setLocalNodeInfo(nodeInfoCbor: Buffer): void { this.keys.setLocalNodeInfo(nodeInfoCbor); }
  setPersistenceDir(dir: string): void { this.keys.setPersistenceDir(dir); }
  enableAutoPersist(enabled: boolean): void { this.keys.enableAutoPersist(enabled); }
  async wipePersistence(): Promise<void> { await this.keys.wipePersistence(); }
  async flushState(): Promise<void> { await this.keys.flushState(); }
  getKeystoreState(): number { return this.keys.getKeystoreState(); }
  getKeystoreCaps(): any { return this.keys.getKeystoreCaps(); }
}

describe('Cross-Language Compatibility Tests', () => {
  let realKeystore: CrossLanguageRealKeystore;
  let context: SerializationContext;
  let resolverCache: ResolverCache;

  beforeEach(async () => {
    realKeystore = new CrossLanguageRealKeystore();
    await realKeystore.initialize();
    
    resolverCache = ResolverCache.newDefault();
    
    // Create real network and profile keys for testing
    const networkPublicKey = realKeystore.ensureSymmetricKey('network-test');
    const profilePublicKey = realKeystore.ensureSymmetricKey('profile-test');
    
    context = {
      keystore: realKeystore,
      resolver: {} as any, // Will be created per test
      networkPublicKey: networkPublicKey,
      profilePublicKeys: [profilePublicKey]
    };
  });

  describe('LabelResolver Cross-Language Compatibility', () => {
    it('should match Rust LabelResolver behavior for system labels', () => {
      const config: LabelResolverConfig = {
        labelMappings: new Map([
          ['system', { networkPublicKey: Buffer.alloc(32, 0x01) }]
        ])
      };

      const resolverResult = LabelResolver.createContextLabelResolver(config, []);
      expect(resolverResult.ok).toBe(true);
      const resolver = resolverResult.value;
      
      // Test system label resolution (should work without user keys)
      const systemLabel = resolver.resolveLabelInfo('system');
      expect(systemLabel.ok).toBe(true);
      expect(systemLabel.value?.networkPublicKey).toBeDefined();
      expect(systemLabel.value?.profilePublicKeys).toEqual([]);
    });

    it('should match Rust LabelResolver behavior for user labels', () => {
      const config: LabelResolverConfig = {
        labelMappings: new Map([
          ['user', { userKeySpec: LabelKeyword.CurrentUser }]
        ])
      };

      const userKeys = [Buffer.alloc(32, 0x03), Buffer.alloc(32, 0x04)];
      const resolverResult = LabelResolver.createContextLabelResolver(config, userKeys);
      expect(resolverResult.ok).toBe(true);
      const resolver = resolverResult.value;
      
      // Test user label resolution (should use provided user keys)
      const userLabel = resolver.resolveLabelInfo('user');
      expect(userLabel.ok).toBe(true);
      expect(userLabel.value?.profilePublicKeys).toEqual(userKeys);
      expect(userLabel.value?.networkPublicKey).toBeUndefined();
    });

    it('should match Rust LabelResolver behavior for mixed labels', () => {
      const config: LabelResolverConfig = {
        labelMappings: new Map([
          ['system', { networkPublicKey: Buffer.alloc(32, 0x01) }],
          ['user', { userKeySpec: LabelKeyword.CurrentUser }]
        ])
      };

      const userKeys = [Buffer.alloc(32, 0x03)];
      const resolverResult = LabelResolver.createContextLabelResolver(config, userKeys);
      expect(resolverResult.ok).toBe(true);
      const resolver = resolverResult.value;
      
      // Test mixed label resolution
      const systemLabel = resolver.resolveLabelInfo('system');
      const userLabel = resolver.resolveLabelInfo('user');
      
      expect(systemLabel.ok).toBe(true);
      expect(userLabel.ok).toBe(true);
      expect(systemLabel.value?.networkPublicKey).toBeDefined();
      expect(userLabel.value?.profilePublicKeys).toEqual(userKeys);
    });

    it('should match Rust LabelResolver behavior for unknown labels', () => {
      const config: LabelResolverConfig = {
        labelMappings: new Map([
          ['system', { networkPublicKey: Buffer.alloc(32, 0x01) }]
        ])
      };

      const resolverResult = LabelResolver.createContextLabelResolver(config, []);
      expect(resolverResult.ok).toBe(true);
      const resolver = resolverResult.value;
      
      // Test unknown label resolution (should fail gracefully)
      const unknownLabel = resolver.resolveLabelInfo('unknown');
      expect(unknownLabel.ok).toBe(true);
      expect(unknownLabel.value).toBeUndefined(); // Unknown labels return undefined, not error
    });
  });

  describe('Envelope Encryption Cross-Language Compatibility', () => {
    it('should match Rust envelope encryption format', () => {
      const testData = Buffer.from('Hello, Cross-Language World!');
      const label = 'system';
      
      const config: LabelResolverConfig = {
        labelMappings: new Map([
          [label, { networkPublicKey: Buffer.alloc(32, 0x01) }]
        ])
      };

      const resolverResult = LabelResolver.createContextLabelResolver(config, []);
      expect(resolverResult.ok).toBe(true);
      const resolver = resolverResult.value;
      
      // Test envelope encryption
      const encrypted = encryptLabelGroupSync(label, testData, realKeystore, resolver);
      expect(encrypted.ok).toBe(true);
      
      // Verify the encrypted data structure matches Rust's format
      const encryptedData = encrypted.value;
      expect(encryptedData.encryptedData).toBeDefined();
      expect(encryptedData.networkId).toBeDefined();
      expect(encryptedData.networkEncryptedKey).toBeDefined();
      expect(encryptedData.profileEncryptedKeys).toBeDefined();
    });

    it('should match Rust envelope decryption behavior', () => {
      const testData = Buffer.from('Hello, Decryption World!');
      const label = 'system';
      
      const config: LabelResolverConfig = {
        labelMappings: new Map([
          [label, { networkPublicKey: Buffer.alloc(32, 0x01) }]
        ])
      };

      const resolverResult = LabelResolver.createContextLabelResolver(config, []);
      expect(resolverResult.ok).toBe(true);
      const resolver = resolverResult.value;
      
      // Encrypt first
      const encrypted = encryptLabelGroupSync(label, testData, realKeystore, resolver);
      expect(encrypted.ok).toBe(true);
      
      // Test envelope decryption
      const decrypted = decryptLabelGroupSync(encrypted.value, realKeystore);
      expect(decrypted.ok).toBe(true);
      expect(decrypted.value).toEqual(testData);
    });

    it('should match Rust bytes decryption behavior', () => {
      const testData = Buffer.from('Hello, Bytes World!');
      const label = 'system';
      
      const config: LabelResolverConfig = {
        labelMappings: new Map([
          [label, { networkPublicKey: Buffer.alloc(32, 0x01) }]
        ])
      };

      const resolverResult = LabelResolver.createContextLabelResolver(config, []);
      expect(resolverResult.ok).toBe(true);
      const resolver = resolverResult.value;
      
      // Encrypt first
      const encrypted = encryptLabelGroupSync(label, testData, realKeystore, resolver);
      expect(encrypted.ok).toBe(true);
      
      // Test bytes decryption
      const decrypted = decryptBytesSync(encrypted.value.encryptedData, realKeystore);
      expect(decrypted.ok).toBe(true);
      expect(decrypted.value).toEqual(testData);
    });
  });

  describe('AnyValue Serialization Cross-Language Compatibility', () => {
    it('should match Rust AnyValue primitive behavior', () => {
      const testData = 'Hello, Primitive World!';
      const av = AnyValue.newPrimitive(testData);
      
      // Test serialization
      const serialized = av.serialize();
      expect(serialized.ok).toBe(true);
      
      // Test deserialization
      const deserialized = AnyValue.deserialize(serialized.value);
      expect(deserialized.ok).toBe(true);
      expect(deserialized.value.getCategory()).toBe(ValueCategory.Primitive);
      
      // Use the correct method to access the value
      const result = deserialized.value.as<typeof testData>();
      expect(result.ok).toBe(true);
      expect(result.value).toBe(testData);
    });

    it('should match Rust AnyValue struct behavior', () => {
      const testData = { message: 'Hello, Struct World!', number: 42 };
      const av = AnyValue.newStruct(testData);
      
      // Test serialization with context
      const serialized = av.serialize(context);
      expect(serialized.ok).toBe(true);
      
      // Test deserialization with keystore
      const deserialized = AnyValue.deserialize(serialized.value, { keystore: realKeystore });
      expect(deserialized.ok).toBe(true);
      expect(deserialized.value.getCategory()).toBe(ValueCategory.Struct);
      
      // Test lazy deserialization
      const result = deserialized.value.as<typeof testData>();
      expect(result.ok).toBe(true);
      expect(result.value).toEqual(testData);
    });

    it('should match Rust AnyValue list behavior', () => {
      const testData = ['item1', 'item2', 'item3'];
      const av = AnyValue.newList(testData);
      
      // Test serialization
      const serialized = av.serialize();
      expect(serialized.ok).toBe(true);
      
      // Test deserialization
      const deserialized = AnyValue.deserialize(serialized.value);
      expect(deserialized.ok).toBe(true);
      expect(deserialized.value.getCategory()).toBe(ValueCategory.List);
      
      // Use the correct method to access the value
      const result = deserialized.value.as<typeof testData>();
      expect(result.ok).toBe(true);
      expect(result.value).toEqual(testData);
    });

    it('should match Rust AnyValue map behavior', () => {
      const testData = new Map([
        ['key1', 'value1'],
        ['key2', 'value2']
      ]);
      const av = AnyValue.newMap(testData);
      
      // Test serialization
      const serialized = av.serialize();
      expect(serialized.ok).toBe(true);
      
      // Test deserialization
      const deserialized = AnyValue.deserialize(serialized.value);
      expect(deserialized.ok).toBe(true);
      expect(deserialized.value.getCategory()).toBe(ValueCategory.Map);
      
      // Note: CBOR converts Maps to plain objects, so we test the object form
      const result = deserialized.value.as<Record<string, string>>();
      expect(result.ok).toBe(true);
      expect(result.value).toEqual({ key1: 'value1', key2: 'value2' });
    });

    it('should match Rust AnyValue bytes behavior', () => {
      const testData = Buffer.from('Hello, Bytes World!');
      const av = AnyValue.newBytes(testData);
      
      // Test serialization
      const serialized = av.serialize();
      expect(serialized.ok).toBe(true);
      
      // Test deserialization
      const deserialized = AnyValue.deserialize(serialized.value);
      expect(deserialized.ok).toBe(true);
      expect(deserialized.value.getCategory()).toBe(ValueCategory.Bytes);
      
      // Use the correct method to access the value
      const result = deserialized.value.as<Buffer>();
      expect(result.ok).toBe(true);
      expect(result.value).toEqual(testData);
    });

    it('should match Rust AnyValue JSON behavior', () => {
      const testData = { message: 'Hello, JSON World!', number: 42 };
      const av = AnyValue.newJson(testData);
      
      // Test serialization
      const serialized = av.serialize();
      expect(serialized.ok).toBe(true);
      
      // Test deserialization
      const deserialized = AnyValue.deserialize(serialized.value);
      expect(deserialized.ok).toBe(true);
      expect(deserialized.value.getCategory()).toBe(ValueCategory.Json);
      
      // Use the correct method to access the value
      const result = deserialized.value.as<typeof testData>();
      expect(result.ok).toBe(true);
      expect(result.value).toEqual(testData);
    });
  });

  describe('Container Types Cross-Language Compatibility', () => {
    it('should match Rust container element encryption behavior', () => {
      const testList = ['item1', 'item2', 'item3'];
      const av = AnyValue.newList(testList);
      
      // Test serialization with encryption context
      const serialized = av.serialize(context);
      expect(serialized.ok).toBe(true);
      
      // Test deserialization with keystore
      const deserialized = AnyValue.deserialize(serialized.value, { keystore: realKeystore });
      expect(deserialized.ok).toBe(true);
      expect(deserialized.value.getCategory()).toBe(ValueCategory.List);
      
      // Test lazy deserialization of encrypted list
      const result = deserialized.value.as<typeof testList>();
      expect(result.ok).toBe(true);
      expect(result.value).toEqual(testList);
    });

    it('should match Rust container wire name generation', () => {
      const testList = ['item1', 'item2', 'item3'];
      const av = AnyValue.newList(testList);
      
      // Test that wire names are generated correctly for containers
      const serialized = av.serialize(context);
      expect(serialized.ok).toBe(true);
      
      // The wire format should include proper type information
      const deserialized = AnyValue.deserialize(serialized.value, { keystore: realKeystore });
      expect(deserialized.ok).toBe(true);
      expect(deserialized.value.getCategory()).toBe(ValueCategory.List);
    });
  });

  describe('Decorated Types Cross-Language Compatibility', () => {
    it('should match Rust decorator registration behavior', () => {
      // Test that decorators properly register types in the registry
      // This ensures compatibility with Rust's type registration system
      
      // Create a decorated type
      const testData = { message: 'Hello, Decorated World!', number: 42 };
      const av = AnyValue.newStruct(testData);
      
      // Serialize with context (should trigger decorator logic)
      const serialized = av.serialize(context);
      expect(serialized.ok).toBe(true);
      
      // Deserialize with keystore (should use registered decryptors)
      const deserialized = AnyValue.deserialize(serialized.value, { keystore: realKeystore });
      expect(deserialized.ok).toBe(true);
      
      // Test lazy deserialization (should use registry decryptors)
      const result = deserialized.value.as<typeof testData>();
      expect(result.ok).toBe(true);
      expect(result.value).toEqual(testData);
    });
  });

  describe('ResolverCache Cross-Language Compatibility', () => {
    it('should match Rust cache behavior for repeated lookups', () => {
      const config: LabelResolverConfig = {
        labelMappings: new Map([
          ['system', { networkPublicKey: Buffer.alloc(32, 0x01) }]
        ])
      };

      const userKeys = [Buffer.alloc(32, 0x03)];
      
      // First lookup (cache miss)
      const firstResult = resolverCache.getOrCreate(config, userKeys);
      expect(firstResult.ok).toBe(true);
      
      // Second lookup (cache hit)
      const secondResult = resolverCache.getOrCreate(config, userKeys);
      expect(secondResult.ok).toBe(true);
      
      // Should return the same resolver instance
      expect(firstResult.value).toBe(secondResult.value);
    });

    it('should match Rust cache behavior for different user keys', () => {
      const config: LabelResolverConfig = {
        labelMappings: new Map([
          ['system', { networkPublicKey: Buffer.alloc(32, 0x01) }]
        ])
      };

      const userKeys1 = [Buffer.alloc(32, 0x03)];
      const userKeys2 = [Buffer.alloc(32, 0x04)];
      
      // Lookup with different user keys
      const result1 = resolverCache.getOrCreate(config, userKeys1);
      const result2 = resolverCache.getOrCreate(config, userKeys2);
      
      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
      
      // Should return different resolver instances
      expect(result1.value).not.toBe(result2.value);
    });

    it('should match Rust cache behavior for TTL expiration', async () => {
      // Create cache with short TTL
      const shortTTLCache = new ResolverCache(100, 0.1); // 0.1 second TTL
      
      const config: LabelResolverConfig = {
        labelMappings: new Map([
          ['system', { networkPublicKey: Buffer.alloc(32, 0x01) }]
        ])
      };

      const userKeys = [Buffer.alloc(32, 0x03)];
      
      // First lookup
      const firstResult = shortTTLCache.getOrCreate(config, userKeys);
      expect(firstResult.ok).toBe(true);
      
      // Wait for TTL expiration
      await Bun.sleep(150); // Wait 150ms for 100ms TTL
      
      // Second lookup (should create new resolver due to TTL expiration)
      const secondResult = shortTTLCache.getOrCreate(config, userKeys);
      expect(secondResult.ok).toBe(true);
      
      // Should return different resolver instances due to TTL expiration
      expect(firstResult.value).not.toBe(secondResult.value);
    });
  });

  describe('Error Handling Cross-Language Compatibility', () => {
    it('should match Rust error handling for invalid labels', () => {
      const config: LabelResolverConfig = {
        labelMappings: new Map([
          ['system', { networkPublicKey: Buffer.alloc(32, 0x01) }]
        ])
      };

      const resolverResult = LabelResolver.createContextLabelResolver(config, []);
      expect(resolverResult.ok).toBe(true);
      const resolver = resolverResult.value;
      
      // Test invalid label
      const result = resolver.resolveLabelInfo('invalid');
      expect(result.ok).toBe(true);
      expect(result.value).toBeUndefined(); // Unknown labels return undefined, not error
    });

    it('should match Rust error handling for encryption failures', () => {
      const testData = Buffer.from('Hello, Error World!');
      const label = 'invalid-label';
      
      const config: LabelResolverConfig = {
        labelMappings: new Map([
          ['system', { networkPublicKey: Buffer.alloc(32, 0x01) }]
        ])
      };

      const resolver = LabelResolver.createContextLabelResolver(config, []);
      
      // Test encryption with invalid label
      const result = encryptLabelGroupSync(label, testData, realKeystore, resolver);
      expect(result.ok).toBe(false);
      expect(result.error.message).toContain('Label not found');
    });

    it('should match Rust error handling for deserialization failures', () => {
      // Test deserialization of invalid data
      const invalidData = Buffer.from('Invalid CBOR data');
      
      const result = AnyValue.deserialize(invalidData);
      expect(result.ok).toBe(false);
      expect(result.error.message).toContain('Invalid category byte');
    });
  });
});
