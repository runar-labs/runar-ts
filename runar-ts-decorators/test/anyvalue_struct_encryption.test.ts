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
} from 'runar-ts-serializer/src/index.js';
import {
  KeystoreFactory,
  KeysWrapperMobile,
  KeysWrapperNode,
} from 'runar-ts-node/src/keys_manager_wrapper.js';
import { Encrypt, runar } from '../src/index.js';

// Test data structure for encryption testing - using proper TS 5 decorators with string labels
@Encrypt
class TestProfile {
  @runar("user")
  public id: string;

  @runar("user")
  public name: string;

  @runar("user")
  public privateData: string;

  @runar("system")
  public email: string;

  @runar("system_only")
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
      throw new Error(
        `Failed to create mobile keystore wrapper: ${(mobileResult as any).error.message}`
      );
    }
    if (!nodeResult.ok) {
      throw new Error(
        `Failed to create node keystore wrapper: ${(nodeResult as any).error.message}`
      );
    }

    this.mobileWrapper = mobileResult.value as KeysWrapperMobile;
    this.nodeWrapper = nodeResult.value as KeysWrapperNode;

    this.networkId = '';
    this.networkPublicKey = new Uint8Array(0);
    this.userProfileKeys = [];
    this.labelResolverConfig = { labelMappings: new Map() };
  }

  async initialize(): Promise<void> {
    // Initializing Test Environment with Real Keys

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
            networkPublicKey: this.networkPublicKey,
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
      throw new Error(`Failed to create resolver: ${(resolverResult as any).error.message}`);
    }
    this.resolver = resolverResult.value;

    // Network created with public key, profile keys generated, Test Environment initialized successfully
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

  createDeserializationContext(
    keystore: KeysWrapperNode | KeysWrapperMobile
  ): DeserializationContext {
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
      // Cleanup warning: ${error.message}
    }
  }
}

describe('AnyValue Struct Encryption End-to-End Tests', () => {
  let testEnv: AnyValueTestEnvironment;

  beforeAll(async () => {
    testEnv = new AnyValueTestEnvironment();
    await testEnv.initialize();
  });

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
      if (!serializeResult.ok) {
        throw new Error(`Serialization failed: ${(serializeResult as any).error.message}`);
      }
      expect(serializeResult.value.length).toBeGreaterThan(0);

      // Deserialize with keystore
      // Note: deserContext is not used in this test as we pass keystore directly to deserialize
      const deserializeResult = AnyValue.deserialize(
        serializeResult.value,
        testEnv.getMobileWrapper()
      );
      expect(deserializeResult.ok).toBe(true);
      if (!deserializeResult.ok) {
        throw new Error(`Deserialization failed: ${(deserializeResult as any).error.message}`);
      }

      // Verify the decrypted data
      const decrypted = deserializeResult.value;

      const asProfileResult = decrypted.as<TestProfile>();
      expect(asProfileResult.ok).toBe(true);
      if (!asProfileResult.ok) {
        throw new Error(`as<TestProfile> failed: ${(asProfileResult as any).error.message}`);
      }

      const decryptedProfile = asProfileResult.value;
      expect(decryptedProfile.id).toBe(userData.id);
      expect(decryptedProfile.name).toBe(userData.name);
      expect(decryptedProfile.privateData).toBe(userData.privateData);
      expect(decryptedProfile.email).toBe(userData.email);
      expect(decryptedProfile.systemMetadata).toBe(userData.systemMetadata);
    });

    it('should encrypt and decrypt system-only fields with proper access control', async () => {
      const systemData = new TestProfile(
        'system-456',
        'System User',
        'system private',
        'system@example.com',
        'system metadata'
      );

      // Create serialization context with mobile keystore (has user profile keys)
      const context = testEnv.createSerializationContext(testEnv.getMobileWrapper());

      // Serialize with encryption context
      const serializeResult = AnyValue.newStruct(systemData).serialize(context);
      expect(serializeResult.ok).toBe(true);
      if (!serializeResult.ok) {
        throw new Error(`Serialization failed: ${(serializeResult as any).error.message}`);
      }
      expect(serializeResult.value.length).toBeGreaterThan(0);

      // CRITICAL: Deserialize with NODE keystore (has network keys, NO user profile keys)
      // This tests access control - user fields should be empty, system fields should contain data
      const deserializeResult = AnyValue.deserialize(
        serializeResult.value,
        testEnv.getNodeWrapper()  // ✅ Using node wrapper for access control test
      );
      expect(deserializeResult.ok).toBe(true);
      if (!deserializeResult.ok) {
        throw new Error(`Deserialization failed: ${(deserializeResult as any).error.message}`);
      }

      // Verify the decrypted data with proper access control
      const decrypted = deserializeResult.value;
      const asProfileResult = decrypted.as<TestProfile>();
      expect(asProfileResult.ok).toBe(true);
      if (!asProfileResult.ok) {
        throw new Error(`as<TestProfile> failed: ${(asProfileResult as any).error.message}`);
      }

      const decryptedProfile = asProfileResult.value;
      
      // ✅ ACCESS CONTROL TEST: User fields should be EMPTY (no user profile keys in node keystore)
      expect(decryptedProfile.id).toBe("");           // user field - should be empty
      expect(decryptedProfile.name).toBe("");         // user field - should be empty  
      expect(decryptedProfile.privateData).toBe("");  // user field - should be empty
      
      // ✅ System fields should contain data (node keystore has network keys)
      expect(decryptedProfile.email).toBe(systemData.email);           // system field - should contain data
      expect(decryptedProfile.systemMetadata).toBe(systemData.systemMetadata); // system_only field - should contain data
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
      if (!serializeResult.ok) {
        throw new Error(`Serialization failed: ${(serializeResult as any).error.message}`);
      }
      expect(serializeResult.value.length).toBeGreaterThan(0);

      // Deserialize with keystore
      const deserContext = testEnv.createDeserializationContext(testEnv.getMobileWrapper());
      const deserializeResult = AnyValue.deserialize(
        serializeResult.value,
        testEnv.getMobileWrapper()
      );
      expect(deserializeResult.ok).toBe(true);
      if (!deserializeResult.ok) {
        throw new Error(`Deserialization failed: ${(deserializeResult as any).error.message}`);
      }

      // Verify the decrypted data
      const decrypted = deserializeResult.value;
      const asProfileResult = decrypted.as<TestProfile>();
      expect(asProfileResult.ok).toBe(true);
      if (!asProfileResult.ok) {
        throw new Error(`as<TestProfile> failed: ${(asProfileResult as any).error.message}`);
      }

      const decryptedProfile = asProfileResult.value;
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

    it('should test reverse access control - mobile keystore decrypting system-only fields', async () => {
      const systemOnlyData = new TestProfile(
        'system-only-123',
        'System Only User',
        'system only private',
        'systemonly@example.com',
        'system only metadata'
      );

      // Create serialization context with mobile keystore
      const context = testEnv.createSerializationContext(testEnv.getMobileWrapper());

      // Serialize with encryption context
      const serializeResult = AnyValue.newStruct(systemOnlyData).serialize(context);
      expect(serializeResult.ok).toBe(true);
      if (!serializeResult.ok) {
        throw new Error(`Serialization failed: ${(serializeResult as any).error.message}`);
      }

      // CRITICAL: Deserialize with MOBILE keystore (has user profile keys, NO network keys)
      // This tests reverse access control - system fields should be empty, user fields should contain data
      const deserializeResult = AnyValue.deserialize(
        serializeResult.value,
        testEnv.getMobileWrapper()  // ✅ Using mobile wrapper for reverse access control test
      );
      expect(deserializeResult.ok).toBe(true);
      if (!deserializeResult.ok) {
        throw new Error(`Deserialization failed: ${(deserializeResult as any).error.message}`);
      }

      // Verify the decrypted data with reverse access control
      const decrypted = deserializeResult.value;
      const asProfileResult = decrypted.as<TestProfile>();
      expect(asProfileResult.ok).toBe(true);
      if (!asProfileResult.ok) {
        throw new Error(`as<TestProfile> failed: ${(asProfileResult as any).error.message}`);
      }

      const decryptedProfile = asProfileResult.value;
      
      // ✅ REVERSE ACCESS CONTROL TEST: User fields should contain data (mobile keystore has user profile keys)
      expect(decryptedProfile.id).toBe(systemOnlyData.id);           // user field - should contain data
      expect(decryptedProfile.name).toBe(systemOnlyData.name);       // user field - should contain data  
      expect(decryptedProfile.privateData).toBe(systemOnlyData.privateData); // user field - should contain data
      
      // ✅ System fields should be EMPTY (mobile keystore has no network keys)
      expect(decryptedProfile.email).toBe("");                      // system field - should be empty
      expect(decryptedProfile.systemMetadata).toBe("");             // system_only field - should be empty
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
      if (!serializeResult.ok) {
        throw new Error(`Serialization failed: ${(serializeResult as any).error.message}`);
      }
      // Encryption time for large data: ${encryptTime}ms

      // Test decryption
      const deserContext = testEnv.createDeserializationContext(testEnv.getMobileWrapper());
      const deserializeResult = AnyValue.deserialize(
        serializeResult.value,
        testEnv.getMobileWrapper()
      );
      expect(deserializeResult.ok).toBe(true);
      if (!deserializeResult.ok) {
        throw new Error(`Deserialization failed: ${(deserializeResult as any).error.message}`);
      }

      // Verify data integrity
      const decrypted = deserializeResult.value;
      const asProfileResult = decrypted.as<TestProfile>();
      expect(asProfileResult.ok).toBe(true);
      if (!asProfileResult.ok) {
        throw new Error(`as<TestProfile> failed: ${(asProfileResult as any).error.message}`);
      }

      const decryptedProfile = asProfileResult.value;
      expect(decryptedProfile.name.length).toBe(1000);
      expect(decryptedProfile.privateData.length).toBe(1000);
      expect(decryptedProfile.email.length).toBe(1000);
      expect(decryptedProfile.systemMetadata.length).toBe(1000);
    });
  });
});
