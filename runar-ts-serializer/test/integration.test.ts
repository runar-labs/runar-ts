import { describe, it, expect, beforeAll } from 'bun:test';
import {
  LabelResolver,
  LabelResolverConfig,
  LabelKeyword,
  ResolverCache,
  encryptLabelGroupSync,
  decryptLabelGroupSync,
  AnyValue,
  SerializationContext,
} from '../src/index.js';
import { Keys } from 'runar-nodejs-api';
import {
  KeystoreFactory,
  KeysWrapperMobile,
} from '../../runar-ts-node/src/keys_manager_wrapper.js';

// REAL keystore for testing - NO MOCKS ALLOWED
class RealTestKeystore {
  private keys: Keys;
  private wrapper: KeysWrapperMobile;
  private _networkPublicKey: Buffer;
  private _profilePublicKeys: Buffer[];

  constructor() {
    this.keys = new Keys();
    this.keys.setPersistenceDir('/tmp/runar-integration-test');
    this.keys.enableAutoPersist(true);
    this.keys.initAsMobile();
    this.wrapper = new KeysWrapperMobile(this.keys);

    // Initialize with real keys
    this._networkPublicKey = Buffer.alloc(32, 0x01);
    this._profilePublicKeys = [Buffer.alloc(32, 0x02), Buffer.alloc(32, 0x03)];
  }

  async initialize(): Promise<void> {
    await this.keys.mobileInitializeUserRootKey();
    await this.keys.flushState();

    // Generate real network and profile keys
    this._networkPublicKey = this.keys.mobileGenerateNetworkDataKey();

    const personalKey = this.keys.mobileDeriveUserProfileKey('personal');
    const workKey = this.keys.mobileDeriveUserProfileKey('work');
    this._profilePublicKeys = [personalKey, workKey];
  }

  get networkPublicKey(): Buffer {
    return this._networkPublicKey;
  }
  get profilePublicKeys(): Buffer[] {
    return this._profilePublicKeys;
  }

  encryptWithEnvelope(
    data: Buffer,
    networkPublicKey: Buffer | null,
    profilePublicKeys: Buffer[]
  ): Buffer {
    // Use REAL native API encryption with networkPublicKey directly
    return this.wrapper.encryptWithEnvelope(data, networkPublicKey, profilePublicKeys);
  }

  decryptEnvelope(eedCbor: Buffer): Buffer {
    // Use REAL native API decryption
    return this.wrapper.decryptEnvelope(eedCbor);
  }

  ensureSymmetricKey(keyName: string): Buffer {
    return this.keys.ensureSymmetricKey(keyName);
  }
  setLabelMapping(mappingCbor: Buffer): void {
    this.keys.setLabelMapping(mappingCbor);
  }
  setLocalNodeInfo(nodeInfoCbor: Buffer): void {
    this.keys.setLocalNodeInfo(nodeInfoCbor);
  }
  setPersistenceDir(dir: string): void {
    this.keys.setPersistenceDir(dir);
  }
  enableAutoPersist(enabled: boolean): void {
    this.keys.enableAutoPersist(enabled);
  }
  async wipePersistence(): Promise<void> {
    await this.keys.wipePersistence();
  }
  async flushState(): Promise<void> {
    await this.keys.flushState();
  }
  getKeystoreState(): number {
    return this.keys.getKeystoreState();
  }
  getKeystoreCaps(): any {
    return this.keys.getKeystoreCaps();
  }
}

describe('Integration Tests', () => {
  let keys: Keys;
  let wrapper: KeysWrapperMobile;
  let labelResolverConfig: LabelResolverConfig;
  let resolverCache: ResolverCache;

  beforeAll(async () => {
    keys = new Keys();

    // Use the new keystore factory to create role-specific wrapper
    const result = KeystoreFactory.create(keys, 'frontend');
    if (!result.ok) {
      throw new Error(`Failed to create keystore wrapper: ${result.error.message}`);
    }
    wrapper = result.value as KeysWrapperMobile;

    labelResolverConfig = {
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
            userKeySpec: { type: 'CurrentUser' },
          },
        ],
      ]),
    };
    resolverCache = ResolverCache.newDefault();
  });

  describe('LabelResolver', () => {
    it('should resolve system labels correctly', () => {
      const info = resolver.resolveLabelInfo('system');
      expect(info.ok).toBe(true);
      expect(info.value).toBeDefined();
      expect(info.value!.networkPublicKey).toEqual(keystore.networkPublicKey);
      expect(info.value!.profilePublicKeys).toEqual([]);
    });

    it('should resolve user labels correctly', () => {
      const info = resolver.resolveLabelInfo('user');
      expect(info.ok).toBe(true);
      expect(info.value).toBeDefined();
      expect(info.value!.networkPublicKey).toBeUndefined();
      expect(info.value!.profilePublicKeys).toEqual(keystore.profilePublicKeys);
    });

    it('should resolve mixed labels correctly', () => {
      const info = resolver.resolveLabelInfo('mixed');
      expect(info.ok).toBe(true);
      expect(info.value).toBeDefined();
      expect(info.value!.networkPublicKey).toEqual(keystore.networkPublicKey);
      expect(info.value!.profilePublicKeys).toEqual(keystore.profilePublicKeys);
    });

    it('should handle unknown labels correctly', () => {
      const info = resolver.resolveLabelInfo('unknown');
      expect(info.ok).toBe(true);
      expect(info.value).toBeUndefined();
    });
  });

  describe('ResolverCache', () => {
    it('should cache and retrieve resolvers correctly', () => {
      const userKeys = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])];

      // First call should create new resolver
      const result1 = cache.getOrCreate(config, userKeys);
      expect(result1.ok).toBe(true);

      // Second call should return cached resolver
      const result2 = cache.getOrCreate(config, userKeys);
      expect(result2.ok).toBe(true);

      // Should be the same instance
      expect(result1.value).toBe(result2.value);
    });

    it('should handle different user keys correctly', () => {
      const userKeys1 = [new Uint8Array([1, 2, 3])];
      const userKeys2 = [new Uint8Array([4, 5, 6])];

      const result1 = cache.getOrCreate(config, userKeys1);
      const result2 = cache.getOrCreate(config, userKeys2);

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
      expect(result1.value).not.toBe(result2.value);
    });
  });

  describe('Encryption Integration', () => {
    it('should encrypt and decrypt label groups correctly', () => {
      const testData = { message: 'Hello World', number: 42 };
      const label = 'system';

      // Encrypt
      const encrypted = encryptLabelGroupSync(label, testData, keystore, resolver);
      expect(encrypted.ok).toBe(true);

      // Decrypt
      const decrypted = decryptLabelGroupSync(encrypted.value, keystore);
      expect(decrypted.ok).toBe(true);
      expect(decrypted.value).toEqual(testData);
    });

    it('should handle user-only labels correctly', () => {
      const testData = { message: 'User Data', number: 123 };
      const label = 'user';

      const encrypted = encryptLabelGroupSync(label, testData, keystore, resolver);
      expect(encrypted.ok).toBe(true);

      const decrypted = decryptLabelGroupSync(encrypted.value, keystore);
      expect(decrypted.ok).toBe(true);
      expect(decrypted.value).toEqual(testData);
    });
  });

  describe('AnyValue Integration', () => {
    it('should serialize and deserialize primitive values', () => {
      const value = AnyValue.newPrimitive('test string');
      const serialized = value.serialize();
      expect(serialized.ok).toBe(true);

      const deserialized = AnyValue.deserialize(serialized.value);
      expect(deserialized.ok).toBe(true);
      expect(deserialized.value.getCategory()).toBe(1); // ValueCategory.Primitive
      const result = deserialized.value.as<string>();
      expect(result.ok).toBe(true);
      expect(result.value).toBe('test string');
    });

    it('should handle encrypted serialization with context', async () => {
      const testData = { message: 'Encrypted Data', number: 999 };
      const value = AnyValue.newStruct(testData);

      const context: SerializationContext = {
        keystore,
        resolver,
        networkPublicKey: keystore.networkPublicKey,
        profilePublicKeys: keystore.profilePublicKeys,
      };

      const serialized = await value.serialize(context);
      expect(serialized.ok).toBe(true);
      expect(serialized.value.length > 0).toBe(true);

      // Deserialize with keystore
      const deserialized = AnyValue.deserialize(serialized.value, { keystore });
      expect(deserialized.ok).toBe(true);
      expect(deserialized.value.getCategory()).toBe(4); // ValueCategory.Struct

      // Test lazy deserialization
      const result = deserialized.value.as<typeof testData>();
      expect(result.ok).toBe(true);
      expect(result.value).toEqual(testData);
    });
  });
});
