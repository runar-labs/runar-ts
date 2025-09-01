import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import {
  LabelResolver,
  createContextLabelResolver,
  LabelResolverConfig,
  LabelKeyword,
  ResolverCache,
  SerializationContext,
  AnyValue,
  encryptLabelGroupSync,
  decryptLabelGroupSync,
  decryptBytesSync,
} from '../src/index.js';
import { Keys } from 'runar-nodejs-api';
import { KeysManagerWrapper } from '../../runar-ts-node/src/keys_manager_wrapper.js';

/**
 * Comprehensive Encryption Tests
 *
 * Following the pattern from runar-rust/runar-keys/tests/end_to_end_test.rs
 * and runar-rust/runar-serializer/tests/encryption_test.rs
 *
 * NO MOCKS, NO STUBS, NO SHORTCUTS - Real cryptographic operations only
 */

// Test environment that mirrors Rust TestEnvironment
class TestEnvironment {
  private mobileKeys: Keys;
  private nodeKeys: Keys;
  private mobileWrapper: KeysManagerWrapper;
  private nodeWrapper: KeysManagerWrapper;
  private networkId: string;
  private userProfileKeys: Uint8Array[];
  private networkPublicKey: Uint8Array;

  constructor() {
    this.mobileKeys = new Keys();
    this.nodeKeys = new Keys();
    this.mobileWrapper = new KeysManagerWrapper(this.mobileKeys);
    this.nodeWrapper = new KeysManagerWrapper(this.nodeKeys);
    this.userProfileKeys = [];
    this.networkPublicKey = new Uint8Array(0);
    this.networkId = '';
  }

  async initialize(): Promise<void> {
    console.log('🔄 Initializing Test Environment with Real Keys');

    // Setup mobile keys (mirrors Rust mobile setup)
    this.mobileKeys.setPersistenceDir('/tmp/runar-encryption-test-mobile');
    this.mobileKeys.enableAutoPersist(true);
    this.mobileKeys.initAsMobile();

    // Setup node keys (mirrors Rust node setup)
    this.nodeKeys.setPersistenceDir('/tmp/runar-encryption-test-node');
    this.nodeKeys.enableAutoPersist(true);
    this.nodeKeys.initAsNode();

    // Initialize user root key (required for mobile operations)
    await this.mobileKeys.mobileInitializeUserRootKey();
    await this.mobileKeys.flushState();

    // Generate network data key (mirrors Rust network creation)
    this.networkPublicKey = this.mobileKeys.mobileGenerateNetworkDataKey();
    this.networkId = 'generated-network'; // For logging purposes only

    console.log(`   ✅ Network created with public key length: ${this.networkPublicKey.length}`);

    // Generate profile keys (mirrors Rust profile key derivation)
    const personalKey = new Uint8Array(this.mobileKeys.mobileDeriveUserProfileKey('personal'));
    const workKey = new Uint8Array(this.mobileKeys.mobileDeriveUserProfileKey('work'));
    this.userProfileKeys = [personalKey, workKey];

    console.log(`   ✅ Profile keys generated: personal, work`);

    // Setup simple network key installation for testing
    const nodeAgreementPk = this.nodeKeys.nodeGetAgreementPublicKey();
    const networkKeyMessage = this.mobileKeys.mobileCreateNetworkKeyMessage(
      this.networkPublicKey,
      nodeAgreementPk
    );
    this.nodeKeys.nodeInstallNetworkKey(networkKeyMessage);

    console.log('   ✅ Certificate workflow completed');
    console.log('   ✅ Test Environment initialized successfully');
  }

  cleanup(): void {
    // Cleanup test directories
    console.log('🧹 Cleaning up test environment');
  }

  getMobileWrapper(): KeysManagerWrapper {
    return this.mobileWrapper;
  }

  getNodeWrapper(): KeysManagerWrapper {
    return this.nodeWrapper;
  }

  getNetworkId(): string {
    return this.networkId;
  }

  getNetworkPublicKey(): Uint8Array {
    return this.networkPublicKey;
  }

  getUserProfileKeys(): Uint8Array[] {
    return this.userProfileKeys;
  }
}

// Test data structures that mirror Rust test structs
interface TestProfile {
  id: string;
  name: string;
  private: string;
  email: string;
  systemMetadata: string;
}

describe('Comprehensive Encryption Tests', () => {
  let testEnv: TestEnvironment;
  let labelResolverConfig: LabelResolverConfig;
  let resolverCache: ResolverCache;

  beforeAll(async () => {
    testEnv = new TestEnvironment();
    await testEnv.initialize();

    // Create label resolver configuration that mirrors Rust encryption_test.rs
    labelResolverConfig = {
      labelMappings: new Map([
        [
          'user',
          {
            networkPublicKey: testEnv.getNetworkPublicKey(),
            userKeySpec: LabelKeyword.CurrentUser,
          },
        ],
        [
          'system',
          {
            networkPublicKey: testEnv.getNetworkPublicKey(),
            userKeySpec: LabelKeyword.CurrentUser,
          },
        ],
        [
          'system_only',
          {
            networkPublicKey: testEnv.getNetworkPublicKey(),
            userKeySpec: undefined,
          },
        ],
        [
          'search',
          {
            networkPublicKey: testEnv.getNetworkPublicKey(),
            userKeySpec: LabelKeyword.CurrentUser,
          },
        ],
      ]),
    };

    resolverCache = ResolverCache.newDefault();
  }, 60000); // 60 second timeout for setup

  afterAll(() => {
    testEnv.cleanup();
  });

  describe('Basic Envelope Encryption', () => {
    it('should perform envelope encryption roundtrip with mobile keys', () => {
      console.log('🔐 Testing Basic Envelope Encryption with Mobile Keys');

      const mobileWrapper = testEnv.getMobileWrapper();
      const testData = new Uint8Array([1, 2, 3, 4, 5]);

      // Encrypt with envelope using network and profile keys
      const encrypted = mobileWrapper.encryptWithEnvelope(
        testData,
        testEnv.getNetworkPublicKey(),
        testEnv.getUserProfileKeys()
      );

      expect(encrypted).toBeInstanceOf(Uint8Array);
      expect(encrypted.length).toBeGreaterThan(testData.length);

      // Decrypt with mobile keys
      const decrypted = mobileWrapper.decryptEnvelope(encrypted);
      expect(decrypted).toEqual(testData);

      console.log('   ✅ Mobile envelope encryption roundtrip successful');
    });

    it('should perform envelope encryption roundtrip with node keys', () => {
      console.log('🔐 Testing Basic Envelope Encryption with Node Keys');

      const mobileWrapper = testEnv.getMobileWrapper();
      const nodeWrapper = testEnv.getNodeWrapper();
      const testData = new Uint8Array([10, 20, 30, 40, 50]);

      // Mobile encrypts for network
      const encrypted = mobileWrapper.encryptWithEnvelope(
        testData,
        testEnv.getNetworkPublicKey(),
        testEnv.getUserProfileKeys()
      );

      // Node should be able to decrypt using network key
      const decrypted = nodeWrapper.decryptEnvelope(encrypted);
      expect(decrypted).toEqual(testData);

      console.log('   ✅ Node envelope decryption successful');
    });

    it('should handle empty profile keys array', () => {
      console.log('🔐 Testing Envelope Encryption with Empty Profile Keys');

      const mobileWrapper = testEnv.getMobileWrapper();
      const testData = new Uint8Array([100, 200]);

      // Encrypt with network key only (empty profile keys)
      const encrypted = mobileWrapper.encryptWithEnvelope(
        testData,
        testEnv.getNetworkPublicKey(),
        []
      );

      const decrypted = mobileWrapper.decryptEnvelope(encrypted);
      expect(decrypted).toEqual(testData);

      console.log('   ✅ Empty profile keys encryption successful');
    });
  });

  describe('Label Group Encryption', () => {
    it('should encrypt and decrypt user-only label groups', () => {
      console.log('🏷️  Testing User-Only Label Group Encryption');

      const resolverResult = createContextLabelResolver(
        labelResolverConfig,
        testEnv.getUserProfileKeys()
      );
      expect(resolverResult.ok).toBe(true);
      const resolver = resolverResult.value!;

      const mobileWrapper = testEnv.getMobileWrapper();
      const testData = { message: 'user-only data', value: 123 };

      // Encrypt with user label
      const encryptResult = encryptLabelGroupSync('user', testData, mobileWrapper, resolver);
      expect(encryptResult.ok).toBe(true);
      const encrypted = encryptResult.value!;

      expect(encrypted.label).toBe('user');
      expect(encrypted.envelopeCbor).toBeDefined();

      // Node should be able to decrypt user data (has network access)
      const nodeWrapper1 = testEnv.getNodeWrapper();
      const decryptResult = decryptLabelGroupSync(encrypted, nodeWrapper1);
      if (!decryptResult.ok) {
        console.error('Decryption failed:', decryptResult.error.message);
      }
      expect(decryptResult.ok).toBe(true);
      expect(decryptResult.value).toEqual(testData);

      console.log('   ✅ User-only label encryption successful');
    });

    it('should encrypt and decrypt system-only label groups', () => {
      console.log('🏷️  Testing System-Only Label Group Encryption');

      const resolverResult = createContextLabelResolver(
        labelResolverConfig,
        testEnv.getUserProfileKeys()
      );
      expect(resolverResult.ok).toBe(true);
      const resolver = resolverResult.value!;

      const mobileWrapper = testEnv.getMobileWrapper();
      const nodeWrapper = testEnv.getNodeWrapper();
      const testData = { message: 'system-only data', value: 456 };

      // Encrypt with system_only label
      const encryptResult = encryptLabelGroupSync('system_only', testData, mobileWrapper, resolver);
      expect(encryptResult.ok).toBe(true);
      const encrypted = encryptResult.value!;

      expect(encrypted.label).toBe('system_only');
      expect(encrypted.envelopeCbor).toBeDefined();

      // Node should be able to decrypt (has network key)
      const nodeWrapper3 = testEnv.getNodeWrapper();
      const decryptResult = decryptLabelGroupSync(encrypted, nodeWrapper3);
      expect(decryptResult.ok).toBe(true);
      expect(decryptResult.value).toEqual(testData);

      console.log('   ✅ System-only label encryption successful');
    });

    it('should encrypt and decrypt mixed system+user label groups', () => {
      console.log('🏷️  Testing Mixed System+User Label Group Encryption');

      const resolverResult = createContextLabelResolver(
        labelResolverConfig,
        testEnv.getUserProfileKeys()
      );
      expect(resolverResult.ok).toBe(true);
      const resolver = resolverResult.value!;

      const mobileWrapper = testEnv.getMobileWrapper();
      const nodeWrapper = testEnv.getNodeWrapper();
      const testData = { message: 'mixed data', value: 789 };

      // Encrypt with system label (has both network and user keys)
      const encryptResult = encryptLabelGroupSync('system', testData, mobileWrapper, resolver);
      expect(encryptResult.ok).toBe(true);
      const encrypted = encryptResult.value!;

      expect(encrypted.label).toBe('system');
      expect(encrypted.envelopeCbor).toBeDefined();

      // Node should be able to decrypt mixed system+user data
      const nodeWrapper4 = testEnv.getNodeWrapper();
      const nodeDecryptResult = decryptLabelGroupSync(encrypted, nodeWrapper4);
      expect(nodeDecryptResult.ok).toBe(true);
      expect(nodeDecryptResult.value).toEqual(testData);

      console.log('   ✅ Mixed label encryption successful');
    });
  });

  describe('LabelResolver Integration', () => {
    it('should create context resolvers with user profile keys', () => {
      console.log('🔍 Testing LabelResolver Context Creation');

      const userKeys = testEnv.getUserProfileKeys();
      const resolverResult = createContextLabelResolver(labelResolverConfig, userKeys);

      expect(resolverResult.ok).toBe(true);
      const resolver = resolverResult.value!;

      // Test system label resolution
      const systemInfo = resolver.resolveLabelInfo('system');
      expect(systemInfo.ok).toBe(true);
      expect(systemInfo.value).toBeDefined();
      expect(systemInfo.value!.networkPublicKey).toEqual(testEnv.getNetworkPublicKey());
      expect(systemInfo.value!.profilePublicKeys).toEqual(userKeys);

      // Test user label resolution
      const userInfo = resolver.resolveLabelInfo('user');
      expect(userInfo.ok).toBe(true);
      expect(userInfo.value).toBeDefined();
      expect(userInfo.value!.networkPublicKey).toEqual(testEnv.getNetworkPublicKey());
      expect(userInfo.value!.profilePublicKeys).toEqual(userKeys);

      // Test system_only label resolution
      const systemOnlyInfo = resolver.resolveLabelInfo('system_only');
      expect(systemOnlyInfo.ok).toBe(true);
      expect(systemOnlyInfo.value).toBeDefined();
      expect(systemOnlyInfo.value!.networkPublicKey).toEqual(testEnv.getNetworkPublicKey());
      expect(systemOnlyInfo.value!.profilePublicKeys).toEqual([]);

      console.log('   ✅ LabelResolver context creation successful');
    });

    it('should handle empty user profile keys', () => {
      console.log('🔍 Testing LabelResolver with Empty Profile Keys');

      const emptyUserKeys: Uint8Array[] = [];
      const resolverResult = createContextLabelResolver(labelResolverConfig, emptyUserKeys);

      expect(resolverResult.ok).toBe(true);
      const resolver = resolverResult.value!;

      // System_only should still work
      const systemOnlyInfo = resolver.resolveLabelInfo('system_only');
      expect(systemOnlyInfo.ok).toBe(true);
      expect(systemOnlyInfo.value).toBeDefined();
      expect(systemOnlyInfo.value!.profilePublicKeys).toEqual([]);

      // User labels should resolve but with empty profile keys
      const userInfo = resolver.resolveLabelInfo('user');
      expect(userInfo.ok).toBe(true);
      expect(userInfo.value).toBeDefined();
      expect(userInfo.value!.profilePublicKeys).toEqual([]);

      console.log('   ✅ Empty profile keys handling successful');
    });
  });

  describe('ResolverCache Integration', () => {
    it('should cache resolvers based on user profile keys', () => {
      console.log('🗄️  Testing ResolverCache with Profile Keys');

      const userKeys1 = testEnv.getUserProfileKeys();
      const userKeys2 = [new Uint8Array([99, 88, 77])];

      // Create resolvers with different user keys
      const result1 = resolverCache.getOrCreate(labelResolverConfig, userKeys1);
      const result2 = resolverCache.getOrCreate(labelResolverConfig, userKeys2);
      const result3 = resolverCache.getOrCreate(labelResolverConfig, userKeys1); // Same as first

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
      expect(result3.ok).toBe(true);

      // Same user keys should return cached resolver
      expect(result1.value).toBe(result3.value);

      // Different user keys should return different resolver
      expect(result1.value).not.toBe(result2.value);

      console.log('   ✅ ResolverCache key-based caching successful');
    });

    it('should provide cache statistics', () => {
      console.log('📊 Testing ResolverCache Statistics');

      const cache = new ResolverCache(10, 300);
      const stats = cache.stats();

      expect(stats.maxSize).toBe(10);
      expect(stats.ttlSeconds).toBe(300);
      expect(stats.totalEntries).toBe(0);

      // Add an entry
      const userKeys = [new Uint8Array([1, 2, 3])];
      const result = cache.getOrCreate(labelResolverConfig, userKeys);
      expect(result.ok).toBe(true);

      const statsAfter = cache.stats();
      expect(statsAfter.totalEntries).toBe(1);

      console.log('   ✅ Cache statistics working correctly');
    });
  });

  describe('SerializationContext Integration', () => {
    it('should create valid serialization contexts', () => {
      console.log('🔧 Testing SerializationContext Creation');

      const resolverResult = createContextLabelResolver(
        labelResolverConfig,
        testEnv.getUserProfileKeys()
      );
      expect(resolverResult.ok).toBe(true);

      const context: SerializationContext = {
        keystore: testEnv.getMobileWrapper(),
        resolver: resolverResult.value!,
        networkPublicKey: testEnv.getNetworkPublicKey(),
        profilePublicKeys: testEnv.getUserProfileKeys(),
      };

      expect(context.keystore).toBeDefined();
      expect(context.resolver).toBeDefined();
      expect(context.networkPublicKey).toEqual(testEnv.getNetworkPublicKey());
      expect(context.profilePublicKeys).toEqual(testEnv.getUserProfileKeys());

      console.log('   ✅ SerializationContext creation successful');
    });
  });

  describe('AnyValue Encryption Integration', () => {
    it('should serialize primitive values without encryption', () => {
      console.log('📦 Testing AnyValue Primitive Serialization');

      const value = AnyValue.newPrimitive('test string');
      const serializeResult = value.serialize();

      expect(serializeResult.ok).toBe(true);
      const serializedBytes = serializeResult.value!;
      expect(serializedBytes.length).toBeGreaterThan(0);

      // Deserialize without keystore
      const deserializeResult = AnyValue.deserialize(serializedBytes);
      expect(deserializeResult.ok).toBe(true);

      const deserialized = deserializeResult.value!;
      const asStringResult = deserialized.as<string>();
      expect(asStringResult.ok).toBe(true);
      expect(asStringResult.value).toBe('test string');

      console.log('   ✅ Primitive serialization successful');
    });

    it('should serialize bytes without encryption', () => {
      console.log('📦 Testing AnyValue Bytes Serialization');

      const testBytes = new Uint8Array([10, 20, 30, 40, 50]);
      const value = AnyValue.newBytes(testBytes);
      const serializeResult = value.serialize();

      expect(serializeResult.ok).toBe(true);
      const serializedBytes = serializeResult.value!;

      const deserializeResult = AnyValue.deserialize(serializedBytes);
      expect(deserializeResult.ok).toBe(true);

      const deserialized = deserializeResult.value!;
      const asBytesResult = deserialized.as<Uint8Array>();
      expect(asBytesResult.ok).toBe(true);
      expect(asBytesResult.value).toEqual(testBytes);

      console.log('   ✅ Bytes serialization successful');
    });

    it('should serialize structs with encryption context', () => {
      console.log('📦 Testing AnyValue Struct Encryption');

      const testProfile: TestProfile = {
        id: 'test-123',
        name: 'Test User',
        private: 'secret data',
        email: 'test@example.com',
        systemMetadata: 'system info',
      };

      const resolverResult = createContextLabelResolver(
        labelResolverConfig,
        testEnv.getUserProfileKeys()
      );
      expect(resolverResult.ok).toBe(true);

      const context: SerializationContext = {
        keystore: testEnv.getMobileWrapper(),
        resolver: resolverResult.value!,
        networkPublicKey: testEnv.getNetworkPublicKey(),
        profilePublicKeys: testEnv.getUserProfileKeys(),
      };

      const value = AnyValue.newStruct(testProfile);
      const serializeResult = value.serialize(context);

      expect(serializeResult.ok).toBe(true);
      const serializedBytes = serializeResult.value!;
      expect(serializedBytes.length).toBeGreaterThan(0);

      // Deserialize with keystore
      const deserializeResult = AnyValue.deserialize(serializedBytes, {
        keystore: testEnv.getMobileWrapper(),
      });
      expect(deserializeResult.ok).toBe(true);

      const deserialized = deserializeResult.value!;
      const asStructResult = deserialized.as<TestProfile>();
      expect(asStructResult.ok).toBe(true);
      expect(asStructResult.value).toEqual(testProfile);

      console.log('   ✅ Struct encryption serialization successful');
    });
  });

  describe('Cross-Keystore Access Control', () => {
    it('should validate mobile vs node access patterns', () => {
      console.log('🔐 Testing Cross-Keystore Access Control');

      const resolverResult = createContextLabelResolver(
        labelResolverConfig,
        testEnv.getUserProfileKeys()
      );
      expect(resolverResult.ok).toBe(true);
      const resolver = resolverResult.value!;

      const mobileWrapper = testEnv.getMobileWrapper();
      const nodeWrapper = testEnv.getNodeWrapper();

      // Test user-only data
      const userData = { message: 'user secret', value: 100 };
      const userEncryptResult = encryptLabelGroupSync('user', userData, mobileWrapper, resolver);
      expect(userEncryptResult.ok).toBe(true);

      // Node should decrypt successfully (has broader access)
      const nodeWrapper2 = testEnv.getNodeWrapper();
      const nodeUserDecryptResult = decryptLabelGroupSync(userEncryptResult.value!, nodeWrapper2);
      expect(nodeUserDecryptResult.ok).toBe(true);
      expect(nodeUserDecryptResult.value).toEqual(userData);

      // Test system-only data
      const systemData = { message: 'system secret', value: 200 };
      const systemEncryptResult = encryptLabelGroupSync(
        'system_only',
        systemData,
        mobileWrapper,
        resolver
      );
      expect(systemEncryptResult.ok).toBe(true);

      // Node should decrypt successfully (has network key)
      const nodeWrapper5 = testEnv.getNodeWrapper();
      const nodeDecryptResult = decryptLabelGroupSync(systemEncryptResult.value!, nodeWrapper5);
      expect(nodeDecryptResult.ok).toBe(true);
      expect(nodeDecryptResult.value).toEqual(systemData);

      console.log('   ✅ Cross-keystore access control validated');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle invalid label names gracefully', () => {
      console.log('❌ Testing Invalid Label Handling');

      const resolverResult = createContextLabelResolver(
        labelResolverConfig,
        testEnv.getUserProfileKeys()
      );
      expect(resolverResult.ok).toBe(true);
      const resolver = resolverResult.value!;

      const mobileWrapper = testEnv.getMobileWrapper();
      const testData = { message: 'test' };

      // Try to encrypt with non-existent label
      const encryptResult = encryptLabelGroupSync('nonexistent', testData, mobileWrapper, resolver);
      expect(encryptResult.ok).toBe(false);
      expect(encryptResult.error).toBeDefined();

      console.log('   ✅ Invalid label handling successful');
    });

    it('should handle empty data gracefully', () => {
      console.log('❌ Testing Empty Data Handling');

      const mobileWrapper = testEnv.getMobileWrapper();
      const emptyData = new Uint8Array(0);

      // Should handle empty data without crashing
      expect(() => {
        const encrypted = mobileWrapper.encryptWithEnvelope(
          emptyData,
          testEnv.getNetworkPublicKey(),
          testEnv.getUserProfileKeys()
        );
        const decrypted = mobileWrapper.decryptEnvelope(encrypted);
        expect(decrypted).toEqual(emptyData);
      }).not.toThrow();

      console.log('   ✅ Empty data handling successful');
    });

    it('should handle decryption without keystore', () => {
      console.log('❌ Testing Decryption Without Keystore');

      const testBytes = new Uint8Array([1, 2, 3, 4, 5]);
      const encrypted = testEnv
        .getMobileWrapper()
        .encryptWithEnvelope(
          testBytes,
          testEnv.getNetworkPublicKey(),
          testEnv.getUserProfileKeys()
        );

      // Attempt to decrypt without keystore should fail gracefully
      const decryptResult = decryptBytesSync(encrypted, undefined as any);
      expect(decryptResult.ok).toBe(false);
      expect(decryptResult.error).toBeDefined();

      console.log('   ✅ Missing keystore handling successful');
    });
  });

  describe('Performance and Large Data', () => {
    it('should handle large data encryption efficiently', () => {
      console.log('📊 Testing Large Data Encryption Performance');

      const mobileWrapper = testEnv.getMobileWrapper();
      const largeData = new Uint8Array(1024 * 1024); // 1MB
      for (let i = 0; i < largeData.length; i++) {
        largeData[i] = i % 256;
      }

      const startTime = Date.now();

      const encrypted = mobileWrapper.encryptWithEnvelope(
        largeData,
        testEnv.getNetworkPublicKey(),
        testEnv.getUserProfileKeys()
      );

      const encryptTime = Date.now() - startTime;
      console.log(`   📈 Encryption time for 1MB: ${encryptTime}ms`);

      const decryptStart = Date.now();
      const decrypted = mobileWrapper.decryptEnvelope(encrypted);
      const decryptTime = Date.now() - decryptStart;
      console.log(`   📈 Decryption time for 1MB: ${decryptTime}ms`);

      expect(decrypted).toEqual(largeData);
      expect(encryptTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(decryptTime).toBeLessThan(5000); // Should complete within 5 seconds

      console.log('   ✅ Large data performance test successful');
    });
  });
});
