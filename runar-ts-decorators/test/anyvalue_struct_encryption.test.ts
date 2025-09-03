import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Keys } from 'runar-nodejs-api';
import {
  LabelResolverConfig,
  LabelResolver,
  ResolverCache,
  SerializationContext,
  DeserializationContext,
  AnyValue,
  createContextLabelResolver,
  LabelKeyword,
  ValueCategory,
} from 'runar-ts-serializer/src/index.js';
import {
  KeystoreFactory,
  KeysWrapperMobile,
  KeysWrapperNode,
} from 'runar-ts-node/src/keys_manager_wrapper.js';
import { Encrypt, runar, type RunarEncryptable } from '../src/index.js';
import { EncryptedTestProfile } from '../src/generated-types.js';

// Import Result type and utilities
import { Result, isErr, isOk } from 'runar-ts-common/src/error/Result.js';

// Import logging
import { Logger, Component } from 'runar-ts-common/src/logging/logger.js';
import { LoggingConfig, LogLevel, applyLoggingConfig } from 'runar-ts-common/src/logging/config.js';

// Test data structure for encryption testing - using proper TS 5 decorators with string labels
// This matches the Rust TestProfile struct exactly
@Encrypt
class TestProfile {
  public id: string; // plain field (no decorator)

  @runar('system')
  public name: string;

  @runar('user')
  public privateData: string;

  @runar('search')
  public email: string;

  @runar('system_only')
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
  private resolver: LabelResolver; // Will be set during initialization

  constructor() {
    this.mobileKeys = new Keys();
    this.nodeKeys = new Keys();

    // Use the new keystore factory to create role-specific wrappers
    const mobileResult = KeystoreFactory.create(this.mobileKeys, 'frontend');
    const nodeResult = KeystoreFactory.create(this.nodeKeys, 'backend');

    if (isErr(mobileResult)) {
      throw new Error(`Failed to create mobile keystore wrapper: ${mobileResult.error.message}`);
    }
    if (isErr(nodeResult)) {
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
    // Initializing Test Environment with Real Keys - MIRRORING RUST encryption_test.rs EXACTLY
    // This setup simulates the real-world scenario:
    // 1. Master Mobile: Used for setup/admin, generates network keys and certificates
    // 2. User Mobile: End user device with only user profile keys, NO network private keys
    // 3. Node: Backend with network private keys, NO user profile keys

    // 1. Setup MASTER mobile keystore (like mobile_network_master in Rust)
    // This is used for setup/admin, generates network keys, never used by end users
    this.mobileKeys.setPersistenceDir('/tmp/runar-anyvalue-test-master-mobile');
    this.mobileKeys.enableAutoPersist(true);
    this.mobileKeys.initAsMobile();
    await this.mobileKeys.mobileInitializeUserRootKey();
    await this.mobileKeys.flushState();

    // Generate network key from master mobile
    this.networkPublicKey = this.mobileKeys.mobileGenerateNetworkDataKey();
    this.networkId = 'generated-network';

    // 2. Create USER mobile keystore (like user_mobile in Rust)
    // This simulates an end user's mobile device with only user profile keys
    const userMobileKeys = new Keys();
    userMobileKeys.setPersistenceDir('/tmp/runar-anyvalue-test-user-mobile');
    userMobileKeys.enableAutoPersist(true);
    userMobileKeys.initAsMobile();
    await userMobileKeys.mobileInitializeUserRootKey();
    await userMobileKeys.flushState();

    // Generate profile keys for user mobile (like profile_pk in Rust)
    const profilePk = new Uint8Array(userMobileKeys.mobileDeriveUserProfileKey('user'));
    this.userProfileKeys = [profilePk];

    // Install ONLY the network public key on user mobile (not private key)
    // This is the key difference - user mobile can encrypt for network but cannot decrypt network-encrypted data
    userMobileKeys.mobileInstallNetworkPublicKey(this.networkPublicKey);

    // Update mobile wrapper to use user mobile keys (not master)
    const userMobileResult = KeystoreFactory.create(userMobileKeys, 'frontend');
    if (isErr(userMobileResult)) {
      throw new Error(
        `Failed to create user mobile keystore wrapper: ${userMobileResult.error.message}`
      );
    }
    this.mobileWrapper = userMobileResult.value as KeysWrapperMobile;

    // Setup node keys (like node_keys in Rust)
    this.nodeKeys.setPersistenceDir('/tmp/runar-anyvalue-test-node');
    this.nodeKeys.enableAutoPersist(true);
    this.nodeKeys.initAsNode();

    // Install network key on node using master mobile keystore
    const token = this.nodeKeys.nodeGenerateCsr();
    const nodeAgreementPk = this.nodeKeys.nodeGetAgreementPublicKey();
    const nkMsg = this.mobileKeys.mobileCreateNetworkKeyMessage(
      this.networkPublicKey,
      nodeAgreementPk
    );
    this.nodeKeys.nodeInstallNetworkKey(nkMsg);

    // Create label resolver config that mirrors Rust encryption_test.rs EXACTLY
    this.labelResolverConfig = {
      labelMappings: new Map([
        [
          'user',
          {
            networkPublicKey: undefined, // user has NO network keys (matches Rust: network_public_key: None)
            userKeySpec: LabelKeyword.CurrentUser,
          },
        ],
        [
          'system',
          {
            networkPublicKey: this.networkPublicKey, // system has BOTH user + network keys (matches Rust: both profile and network keys)
            userKeySpec: LabelKeyword.CurrentUser,
          },
        ],
        [
          'system_only',
          {
            networkPublicKey: this.networkPublicKey, // system_only has ONLY network keys (matches Rust: profile_public_keys: [], network_public_key: Some)
            userKeySpec: undefined, // NO user profile keys (matches Rust: profile_public_keys: vec![])
          },
        ],
        [
          'search',
          {
            networkPublicKey: this.networkPublicKey, // search has BOTH user + network keys (matches Rust: both profile and network keys)
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
    if (isErr(resolverResult)) {
      throw new Error(`Failed to create resolver: ${resolverResult.error.message}`);
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

  getResolver(): LabelResolver {
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
  let logger: Logger;

  beforeAll(async () => {
    // Setup comprehensive logging for debugging
    const loggingConfig = LoggingConfig.new().withDefaultLevel(LogLevel.Trace);

    applyLoggingConfig(loggingConfig);
    logger = Logger.newRoot(Component.Node).setNodeId('test-node-123');

    logger.info('Starting AnyValue Struct Encryption End-to-End Tests');

    testEnv = new AnyValueTestEnvironment();
    await testEnv.initialize();
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  describe('Access Control Tests (Rust Parity)', () => {
    it('should test encryption basic - direct encryptWithKeystore/decryptWithKeystore calls', async () => {
      // This matches Rust test_encryption_basic() exactly
      const original = new TestProfile(
        '123',
        'Test User',
        'secret123',
        'test@example.com',
        'system_data'
      );

      // Test encryption (matches Rust: original.encrypt_with_keystore(&mobile_ks, resolver.as_ref()))
      const encryptableOriginal = original as TestProfile &
        RunarEncryptable<TestProfile, EncryptedTestProfile>;
      const encryptResult = encryptableOriginal.encryptWithKeystore(
        testEnv.getMobileWrapper(),
        testEnv.getResolver()
      );
      expect(isOk(encryptResult)).toBe(true);
      if (isErr(encryptResult)) {
        throw new Error(`Encryption failed: ${encryptResult.error.message}`);
      }

      const encrypted = encryptResult.value;

      // Verify encrypted struct has the expected fields (matches Rust assertions)
      expect(encrypted.id).toBe('123');
      expect(encrypted.user_encrypted).toBeDefined();
      expect(encrypted.system_encrypted).toBeDefined();
      expect(encrypted.search_encrypted).toBeDefined();
      expect(encrypted.system_only_encrypted).toBeDefined();

      // Test decryption with mobile (matches Rust: encrypted.decrypt_with_keystore(&mobile_ks))
      const encryptedCompanion = encrypted as unknown as RunarEncryptable<
        TestProfile,
        EncryptedTestProfile
      >;
      const decryptedMobile = encryptedCompanion.decryptWithKeystore(
        testEnv.getMobileWrapper(),
        logger
      );
      expect(isOk(decryptedMobile)).toBe(true);
      if (isErr(decryptedMobile)) {
        throw new Error(`Mobile decryption failed: ${decryptedMobile.error.message}`);
      }

      const mobileProfile = decryptedMobile.value;
      expect(mobileProfile.id).toBe(original.id);
      expect(mobileProfile.name).toBe(original.name);
      expect(mobileProfile.privateData).toBe(original.privateData);
      expect(mobileProfile.email).toBe(original.email);
      expect(mobileProfile.systemMetadata).toBe(''); // Mobile should NOT have access to system_metadata

      // Test decryption with node (matches Rust: encrypted.decrypt_with_keystore(&node_ks))
      const decryptedNode = encryptedCompanion.decryptWithKeystore(
        testEnv.getNodeWrapper(),
        logger
      );
      expect(isOk(decryptedNode)).toBe(true);
      if (isErr(decryptedNode)) {
        throw new Error(`Node decryption failed: ${decryptedNode.error.message}`);
      }

      const nodeProfile = decryptedNode.value;
      expect(nodeProfile.id).toBe(original.id);
      expect(nodeProfile.name).toBe(original.name);
      expect(nodeProfile.privateData).toBe(''); // Should be empty for node
      expect(nodeProfile.email).toBe(original.email);
      expect(nodeProfile.systemMetadata).toBe(original.systemMetadata); // Node should have access to system_metadata
    });

    it('should test encryption in AnyValue - AnyValue.deserialize calls', async () => {
      // This matches Rust test_encryption_in_arcvalue() exactly
      const profile = new TestProfile(
        '789',
        'ArcValue Test',
        'arc_secret',
        'arc@example.com',
        'arc_system_data'
      );

      // Create AnyValue with struct (matches Rust: ArcValue::new_struct(profile.clone()))
      const val = AnyValue.newStruct(profile);
      expect(val.getCategory()).toBe(ValueCategory.Struct);

      // Create serialization context (matches Rust SerializationContext creation)
      const context = testEnv.createSerializationContext(testEnv.getMobileWrapper());
      console.log('🔍 Serialization context keys:');
      console.log(
        '  - networkPublicKey:',
        context.networkPublicKey
          ? 'present (' + context.networkPublicKey.length + ' bytes)'
          : 'null'
      );
      console.log(
        '  - profilePublicKeys:',
        context.profilePublicKeys ? context.profilePublicKeys.length + ' keys' : 'null'
      );

      // Serialize with encryption (matches Rust: val.serialize(Some(&context)))
      const ser = val.serialize(context);
      expect(isOk(ser)).toBe(true);
      if (isErr(ser)) {
        throw new Error(`Serialization failed: ${ser.error.message}`);
      }

      // Deserialize with node (matches Rust: ArcValue::deserialize(&ser, Some(node_ks.clone())))
      const deNode = AnyValue.deserialize(ser.value, testEnv.getNodeWrapper(), logger);
      expect(isOk(deNode)).toBe(true);
      if (isErr(deNode)) {
        throw new Error(`Node deserialization failed: ${deNode.error.message}`);
      }

      const nodeProfileResult = deNode.value.as<TestProfile>();
      expect(isOk(nodeProfileResult)).toBe(true);
      if (isErr(nodeProfileResult)) {
        throw new Error(`Node as<TestProfile> failed: ${nodeProfileResult.error.message}`);
      }

      const nodeProfile = nodeProfileResult.value;
      expect(nodeProfile.id).toBe(profile.id);
      expect(nodeProfile.name).toBe(profile.name);
      expect(nodeProfile.privateData).toBe(''); // Should be empty for node
      expect(nodeProfile.email).toBe(profile.email);
      expect(nodeProfile.systemMetadata).toBe(profile.systemMetadata); // Node should have access to system_metadata

      // Deserialize with mobile (matches Rust: ArcValue::deserialize(&ser, Some(mobile_ks.clone())))
      const deMobile = AnyValue.deserialize(ser.value, testEnv.getMobileWrapper(), logger);
      expect(isOk(deMobile)).toBe(true);
      if (isErr(deMobile)) {
        throw new Error(`Mobile deserialization failed: ${deMobile.error.message}`);
      }

      const mobileProfileResult = deMobile.value.as<TestProfile>();
      expect(isOk(mobileProfileResult)).toBe(true);
      if (isErr(mobileProfileResult)) {
        throw new Error(`Mobile as<TestProfile> failed: ${mobileProfileResult.error.message}`);
      }

      const mobileProfile = mobileProfileResult.value;
      expect(mobileProfile.id).toBe(profile.id);
      expect(mobileProfile.name).toBe(profile.name);
      expect(mobileProfile.privateData).toBe(profile.privateData);
      expect(mobileProfile.email).toBe(profile.email);
      expect(mobileProfile.systemMetadata).toBe(''); // Mobile should NOT have access to system_metadata

      // Test direct encryptWithKeystore/decryptWithKeystore (matches Rust: profile.encrypt_with_keystore(&context))
      const encryptableProfile = profile as TestProfile & RunarEncryptable<TestProfile, any>;
      const encryptedProfileResult = encryptableProfile.encryptWithKeystore(
        testEnv.getNodeWrapper(),
        testEnv.getResolver()
      );
      expect(isOk(encryptedProfileResult)).toBe(true);
      if (isErr(encryptedProfileResult)) {
        throw new Error(`Encryption failed: ${encryptedProfileResult.error.message}`);
      }

      const encryptedProfile = encryptedProfileResult.value;
      expect(encryptedProfile.id).toBe(profile.id);
      expect(encryptedProfile.search_encrypted).toBeDefined();
      expect(encryptedProfile.system_encrypted).toBeDefined();
      expect(encryptedProfile.system_only_encrypted).toBeDefined();
      expect(encryptedProfile.user_encrypted).toBeDefined();

      // Test decryptWithKeystore on the encrypted companion (matches Rust: encrypted.decrypt_with_keystore(&node_ks))
      const encryptedCompanion = encryptedProfile as RunarEncryptable<any, any>;
      const finalNodeProfile = encryptedCompanion.decryptWithKeystore(
        testEnv.getNodeWrapper(),
        logger
      );
      expect(isOk(finalNodeProfile)).toBe(true);
      if (isErr(finalNodeProfile)) {
        throw new Error(`Final node decryption failed: ${finalNodeProfile.error.message}`);
      }

      const finalProfile = finalNodeProfile.value;
      expect(finalProfile.id).toBe(profile.id);
      expect(finalProfile.name).toBe(profile.name);
      expect(finalProfile.privateData).toBe(''); // Should be empty for node
      expect(finalProfile.email).toBe(profile.email);
      expect(finalProfile.systemMetadata).toBe(profile.systemMetadata);
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
      expect(isOk(serializeResult)).toBe(true);
      if (isErr(serializeResult)) {
        throw new Error(`Serialization failed: ${serializeResult.error.message}`);
      }
      expect(serializeResult.value.length).toBeGreaterThan(0);

      // Deserialize with keystore
      const deserContext = testEnv.createDeserializationContext(testEnv.getMobileWrapper());
      const deserializeResult = AnyValue.deserialize(
        serializeResult.value,
        testEnv.getMobileWrapper(),
        logger
      );
      if (isErr(deserializeResult)) {
        console.log('Deserialization failed:', deserializeResult.error.message);
        throw new Error(`Deserialization failed: ${deserializeResult.error.message}`);
      }
      expect(isOk(deserializeResult)).toBe(true);

      // Verify the decrypted data
      const decrypted = deserializeResult.value;
      const asProfileResult = decrypted.as<TestProfile>();
      expect(isOk(asProfileResult)).toBe(true);
      if (isErr(asProfileResult)) {
        throw new Error(`as<TestProfile> failed: ${asProfileResult.error.message}`);
      }

      const decryptedProfile = asProfileResult.value;
      expect(decryptedProfile.id).toBe(mixedData.id);
      expect(decryptedProfile.name).toBe(mixedData.name);
      expect(decryptedProfile.privateData).toBe(mixedData.privateData);
      expect(decryptedProfile.email).toBe(mixedData.email);
      expect(decryptedProfile.systemMetadata).toBe(''); // system_only field should be empty for mobile keystore
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
      expect(isOk(serializeResult)).toBe(true);
      if (isErr(serializeResult)) {
        throw new Error(`Serialization failed: ${serializeResult.error.message}`);
      }

      // CRITICAL: Deserialize with MOBILE keystore (has user profile keys, NO network keys)
      // This tests reverse access control - system fields should be empty, user fields should contain data
      const deserializeResult = AnyValue.deserialize(
        serializeResult.value,
        testEnv.getMobileWrapper(), // ✅ Using mobile wrapper for reverse access control test
        logger
      );
      if (isErr(deserializeResult)) {
        console.log('Deserialization failed:', deserializeResult.error.message);
        throw new Error(`Deserialization failed: ${deserializeResult.error.message}`);
      }
      expect(isOk(deserializeResult)).toBe(true);

      // Verify the decrypted data with reverse access control
      const decrypted = deserializeResult.value;
      const asProfileResult = decrypted.as<TestProfile>();
      expect(isOk(asProfileResult)).toBe(true);
      if (isErr(asProfileResult)) {
        throw new Error(`as<TestProfile> failed: ${asProfileResult.error.message}`);
      }

      const decryptedProfile = asProfileResult.value;

      // ✅ REVERSE ACCESS CONTROL TEST: User fields should contain data (mobile keystore has user profile keys)
      expect(decryptedProfile.id).toBe(systemOnlyData.id); // plain field - should contain data
      expect(decryptedProfile.name).toBe(systemOnlyData.name); // system field - should contain data (mobile has profile keys)
      expect(decryptedProfile.privateData).toBe(systemOnlyData.privateData); // user field - should contain data
      expect(decryptedProfile.email).toBe(systemOnlyData.email); // search field - should contain data (mobile has profile keys)

      // ✅ System_only fields should be EMPTY (mobile keystore has no network keys)
      expect(decryptedProfile.systemMetadata).toBe(''); // system_only field - should be empty
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

      expect(isOk(serializeResult)).toBe(true);
      if (isErr(serializeResult)) {
        throw new Error(`Serialization failed: ${serializeResult.error.message}`);
      }
      // Encryption time for large data: ${encryptTime}ms

      // Test decryption
      const deserContext = testEnv.createDeserializationContext(testEnv.getMobileWrapper());
      const deserializeResult = AnyValue.deserialize(
        serializeResult.value,
        testEnv.getMobileWrapper(),
        logger
      );
      if (isErr(deserializeResult)) {
        console.log('Deserialization failed:', deserializeResult.error.message);
        throw new Error(`Deserialization failed: ${deserializeResult.error.message}`);
      }
      expect(isOk(deserializeResult)).toBe(true);

      // Verify data integrity
      const decrypted = deserializeResult.value;
      const asProfileResult = decrypted.as<TestProfile>();
      expect(isOk(asProfileResult)).toBe(true);
      if (isErr(asProfileResult)) {
        throw new Error(`as<TestProfile> failed: ${asProfileResult.error.message}`);
      }

      const decryptedProfile = asProfileResult.value;
      expect(decryptedProfile.name.length).toBe(1000);
      expect(decryptedProfile.privateData.length).toBe(1000);
      expect(decryptedProfile.email.length).toBe(1000);
      expect(decryptedProfile.systemMetadata).toBe(''); // system_only field should be empty for mobile keystore
    });
  });
});
