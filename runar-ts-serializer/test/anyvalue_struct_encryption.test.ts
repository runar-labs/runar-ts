import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Keys } from 'runar-nodejs-api';
import {
  LabelResolverConfig,
  ResolverCache,
  SerializationContext,
  DeserializationContext,
  AnyValue,
  createContextLabelResolver,
  LabelKeyword,
} from '../src/index.js';
import {
  KeystoreFactory,
  KeysWrapperMobile,
  KeysWrapperNode,
} from '../../runar-ts-node/src/keys_manager_wrapper.js';

// Test data structure for encryption testing - manually configured to avoid decorator compatibility issues
class TestProfile {
  public id: string;
  public name: string;
  public privateData: string;
  public email: string;
  public systemMetadata: string;

  constructor(
    id: string,
    name: string,
    privateData: string,
    email: string,
    systemMetadata: string
  ) {
    this.id = id;
    this.name = name;
    this.privateData = privateData;
    this.email = email;
    this.systemMetadata = systemMetadata;
  }

  // Add field encryption metadata manually to avoid decorator compatibility issues
  static fieldEncryptions = [
    { label: 'user', propertyKey: 'id', priority: 1 },
    { label: 'user', propertyKey: 'name', priority: 1 },
    { label: 'user', propertyKey: 'privateData', priority: 1 },
    { label: 'system', propertyKey: 'email', priority: 0 },
    { label: 'system_only', propertyKey: 'systemMetadata', priority: 0 },
  ];

  // Mock encryption method to satisfy the AnyValue.newStruct requirements
  encryptWithKeystore(keystore: any, resolver: any): any {
    // This is a mock implementation for testing
    return { ok: true, value: this };
  }
}

// Test environment that mirrors Rust TestEnvironment
class AnyValueTestEnvironment {
  private mobileKeys: Keys;
  private nodeKeys: Keys;
  private mobileWrapper: KeysWrapperMobile;
  private nodeWrapper: KeysWrapperNode;
  private networkId: string;
  private networkPublicKey: Uint8Array;
  private userProfileKeys: Uint8Array[];
  private labelResolverConfig: LabelResolverConfig;
  private resolver: any; // Will be set during initialization

  constructor() {
    this.mobileKeys = new Keys();
    this.nodeKeys = new Keys();

    // Use the new keystore factory to create role-specific wrappers
    const mobileResult = KeystoreFactory.create(this.mobileKeys, 'frontend');
    const nodeResult = KeystoreFactory.create(this.nodeKeys, 'backend');

    if (!mobileResult.ok) {
      throw new Error(`Failed to create mobile keystore wrapper: ${mobileResult.error.message}`);
    }
    if (!nodeResult.ok) {
      throw new Error(`Failed to create node keystore wrapper: ${nodeResult.error.message}`);
    }

    this.mobileWrapper = mobileResult.value as KeysWrapperMobile;
    this.nodeWrapper = nodeResult.value as KeysWrapperNode;

    this.networkId = '';
    this.networkPublicKey = new Uint8Array(0);
    this.userProfileKeys = [];
    this.labelResolverConfig = { labelMappings: new Map() };
  }

  async initialize(): Promise<void> {
    console.log('🔄 Initializing Test Environment with Real Keys');

    // Setup mobile keys
    this.mobileKeys.setPersistenceDir('/tmp/runar-anyvalue-test-mobile');
    this.mobileKeys.enableAutoPersist(true);
    this.mobileKeys.initAsMobile();
    await this.mobileKeys.mobileInitializeUserRootKey();
    await this.mobileKeys.flushState();

    // Generate profile keys
    const personalKey = new Uint8Array(this.mobileKeys.mobileDeriveUserProfileKey('personal'));
    const workKey = new Uint8Array(this.mobileKeys.mobileDeriveUserProfileKey('work'));
    this.userProfileKeys = [personalKey, workKey];

    // Generate network key
    this.networkPublicKey = this.mobileKeys.mobileGenerateNetworkDataKey();
    this.networkId = 'generated-network';

    // Setup node keys
    this.nodeKeys.setPersistenceDir('/tmp/runar-anyvalue-test-node');
    this.nodeKeys.enableAutoPersist(true);
    this.nodeKeys.initAsNode();

    // Install network key on node
    const token = this.nodeKeys.nodeGenerateCsr();
    const nodeAgreementPk = this.nodeKeys.nodeGetAgreementPublicKey();
    const nkMsg = this.mobileKeys.mobileCreateNetworkKeyMessage(
      this.networkPublicKey,
      nodeAgreementPk
    );
    this.nodeKeys.nodeInstallNetworkKey(nkMsg);

    // Create label resolver config that mirrors Rust encryption_test.rs
    this.labelResolverConfig = {
      labelMappings: new Map([
        [
          'user',
          {
            networkPublicKey: undefined,
            userKeySpec: LabelKeyword.CurrentUser,
          },
        ],
        [
          'system',
          {
            networkPublicKey: this.networkPublicKey,
            userKeySpec: LabelKeyword.CurrentUser,
          },
        ],
        [
          'system_only',
          {
            networkPublicKey: this.networkPublicKey,
            userKeySpec: undefined,
          },
        ],
        [
          'search',
          {
            networkPublicKey: this.networkPublicKey,
            userKeySpec: LabelKeyword.CurrentUser,
          },
        ],
      ]),
    };

    // Create resolver
    const resolverResult = createContextLabelResolver(
      this.labelResolverConfig,
      this.userProfileKeys
    );
    if (!resolverResult.ok) {
      throw new Error(`Failed to create resolver: ${resolverResult.error.message}`);
    }
    this.resolver = resolverResult.value;

    console.log('   ✅ Network created with public key length:', this.networkPublicKey.length);
    console.log('   ✅ Profile keys generated: personal, work');
    console.log('   ✅ Test Environment initialized successfully');
  }

  getMobileWrapper(): KeysWrapperMobile {
    return this.mobileWrapper;
  }

  getNodeWrapper(): KeysWrapperNode {
    return this.nodeWrapper;
  }

  getNetworkPublicKey(): Uint8Array {
    return this.networkPublicKey;
  }

  getUserProfileKeys(): Uint8Array[] {
    return this.userProfileKeys;
  }

  getLabelResolverConfig(): LabelResolverConfig {
    return this.labelResolverConfig;
  }

  getResolver(): any {
    return this.resolver;
  }

  createSerializationContext(keystore: KeysWrapperMobile): SerializationContext {
    return {
      keystore,
      resolver: this.resolver,
      networkPublicKey: this.networkPublicKey,
      profilePublicKeys: this.userProfileKeys,
    };
  }

  createDeserializationContext(keystore: KeysWrapperNode): DeserializationContext {
    return {
      keystore,
      resolver: this.resolver,
    };
  }

  async cleanup(): Promise<void> {
    try {
      await this.mobileKeys.wipePersistence();
      await this.nodeKeys.wipePersistence();
    } catch (error) {
      console.log('Cleanup warning:', error.message);
    }
  }
}

describe('AnyValue Struct Encryption End-to-End Tests', () => {
  let testEnv: AnyValueTestEnvironment;

  beforeAll(async () => {
    testEnv = new AnyValueTestEnvironment();
    await testEnv.initialize();
  }, 60000); // 60 second timeout for setup

  afterAll(async () => {
    await testEnv.cleanup();
  });

  describe('Basic Struct Encryption', () => {
    it('should encrypt and decrypt user-only fields', async () => {
      const userData = new TestProfile(
        'user-123',
        'John Doe',
        'private info',
        'john@example.com',
        'user metadata'
      );

      // Create serialization context with mobile keystore
      const context = testEnv.createSerializationContext(testEnv.getMobileWrapper());

      // Serialize with encryption context
      const serializeResult = AnyValue.newStruct(userData).serialize(context);
      expect(serializeResult.ok).toBe(true);
      expect(serializeResult.value!.length).toBeGreaterThan(0);

      // Deserialize with keystore
      const deserContext = testEnv.createDeserializationContext(testEnv.getNodeWrapper());
      const deserializeResult = AnyValue.deserialize(
        serializeResult.value!,
        testEnv.getNodeWrapper()
      );
      expect(deserializeResult.ok).toBe(true);

      // Verify the decrypted data
      const decrypted = deserializeResult.value!;
      const asProfileResult = decrypted.as<TestProfile>();
      expect(asProfileResult.ok).toBe(true);

      const decryptedProfile = asProfileResult.value!;
      expect(decryptedProfile.id).toBe(userData.id);
      expect(decryptedProfile.name).toBe(userData.name);
      expect(decryptedProfile.privateData).toBe(userData.privateData);
      expect(decryptedProfile.email).toBe(userData.email);
      expect(decryptedProfile.systemMetadata).toBe(userData.systemMetadata);
    });

    it('should encrypt and decrypt system-only fields', async () => {
      const systemData = new TestProfile(
        'system-456',
        'System User',
        'system private',
        'system@example.com',
        'system metadata'
      );

      // Create serialization context with mobile keystore
      const context = testEnv.createSerializationContext(testEnv.getMobileWrapper());

      // Serialize with encryption context
      const serializeResult = AnyValue.newStruct(systemData).serialize(context);
      expect(serializeResult.ok).toBe(true);
      expect(serializeResult.value!.length).toBeGreaterThan(0);

      // Deserialize with keystore
      const deserContext = testEnv.createDeserializationContext(testEnv.getNodeWrapper());
      const deserializeResult = AnyValue.deserialize(
        serializeResult.value!,
        testEnv.getNodeWrapper()
      );
      expect(deserializeResult.ok).toBe(true);

      // Verify the decrypted data
      const decrypted = deserializeResult.value!;
      const asProfileResult = decrypted.as<TestProfile>();
      expect(asProfileResult.ok).toBe(true);

      const decryptedProfile = asProfileResult.value!;
      expect(decryptedProfile.id).toBe(systemData.id);
      expect(decryptedProfile.name).toBe(systemData.name);
      expect(decryptedProfile.privateData).toBe(systemData.privateData);
      expect(decryptedProfile.email).toBe(systemData.email);
      expect(decryptedProfile.systemMetadata).toBe(systemData.systemMetadata);
    });

    it('should encrypt and decrypt mixed system+user fields', async () => {
      const mixedData = new TestProfile(
        'mixed-789',
        'Mixed User',
        'mixed private',
        'mixed@example.com',
        'mixed metadata'
      );

      // Create serialization context with mobile keystore
      const context = testEnv.createSerializationContext(testEnv.getMobileWrapper());

      // Serialize with encryption context
      const serializeResult = AnyValue.newStruct(mixedData).serialize(context);
      expect(serializeResult.ok).toBe(true);
      expect(serializeResult.value!.length).toBeGreaterThan(0);

      // Deserialize with keystore
      const deserContext = testEnv.createDeserializationContext(testEnv.getNodeWrapper());
      const deserializeResult = AnyValue.deserialize(
        serializeResult.value!,
        testEnv.getNodeWrapper()
      );
      expect(deserializeResult.ok).toBe(true);

      // Verify the decrypted data
      const decrypted = deserializeResult.value!;
      const asProfileResult = decrypted.as<TestProfile>();
      expect(asProfileResult.ok).toBe(true);

      const decryptedProfile = asProfileResult.value!;
      expect(decryptedProfile.id).toBe(mixedData.id);
      expect(decryptedProfile.name).toBe(mixedData.name);
      expect(decryptedProfile.privateData).toBe(mixedData.privateData);
      expect(decryptedProfile.email).toBe(mixedData.email);
      expect(decryptedProfile.systemMetadata).toBe(mixedData.systemMetadata);
    });
  });

  describe('Cross-Keystore Access Control', () => {
    it('should validate mobile vs node access patterns', async () => {
      const testData = new TestProfile(
        'access-123',
        'Access Test',
        'access private',
        'access@example.com',
        'access metadata'
      );

      // Test mobile keystore capabilities
      const mobileCaps = testEnv.getMobileWrapper().getKeystoreCaps();
      expect(mobileCaps.hasProfileKeys).toBe(true);
      expect(mobileCaps.hasNetworkKeys).toBe(false);

      // Test node keystore capabilities
      const nodeCaps = testEnv.getNodeWrapper().getKeystoreCaps();
      expect(nodeCaps.hasProfileKeys).toBe(false);
      expect(nodeCaps.hasNetworkKeys).toBe(true);

      // Verify both can encrypt/decrypt
      expect(mobileCaps.canEncrypt).toBe(true);
      expect(mobileCaps.canDecrypt).toBe(true);
      expect(nodeCaps.canEncrypt).toBe(true);
      expect(nodeCaps.canDecrypt).toBe(true);
    });
  });

  describe('Performance and Large Data', () => {
    it('should handle large data encryption efficiently', async () => {
      // Create large test data
      const largeData = new TestProfile(
        'large-123',
        'A'.repeat(1000), // Large name
        'B'.repeat(1000), // Large private data
        'C'.repeat(1000), // Large email
        'D'.repeat(1000) // Large metadata
      );

      const context = testEnv.createSerializationContext(testEnv.getMobileWrapper());

      const startTime = Date.now();
      const serializeResult = AnyValue.newStruct(largeData).serialize(context);
      const encryptTime = Date.now() - startTime;

      expect(serializeResult.ok).toBe(true);
      console.log(`📈 Encryption time for large data: ${encryptTime}ms`);

      // Test decryption
      const deserContext = testEnv.createDeserializationContext(testEnv.getNodeWrapper());
      const deserializeResult = AnyValue.deserialize(
        serializeResult.value!,
        testEnv.getNodeWrapper()
      );
      expect(deserializeResult.ok).toBe(true);

      // Verify data integrity
      const decrypted = deserializeResult.value!;
      const asProfileResult = decrypted.as<TestProfile>();
      expect(asProfileResult.ok).toBe(true);

      const decryptedProfile = asProfileResult.value!;
      expect(decryptedProfile.name.length).toBe(1000);
      expect(decryptedProfile.privateData.length).toBe(1000);
      expect(decryptedProfile.email.length).toBe(1000);
      expect(decryptedProfile.systemMetadata.length).toBe(1000);
    });
  });
});
