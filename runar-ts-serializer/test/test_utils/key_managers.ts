import { Keys } from 'runar-nodejs-api';
import {
  LabelResolverConfig,
  LabelResolver,
  SerializationContext,
  DeserializationContext,
  createContextLabelResolver,
  LabelKeyword,
} from '../../src/index';
import {
  KeystoreFactory,
  KeysWrapperMobile,
  KeysWrapperNode,
} from '../../../runar-ts-node/src/keys_manager_wrapper';

// Import Result type and utilities
import { Result, isErr } from 'runar-ts-common/src/error/Result';

/**
 * Test environment that mirrors Rust TestEnvironment EXACTLY
 *
 * REAL-WORLD SETUP:
 * 1. Master Mobile: Used only for setup/admin, generates network keys and certificates
 *    - Never used by end users or applications
 *    - Only used to set up nodes and generate network infrastructure
 * 2. User Mobile: End user device with only user profile keys + network PUBLIC key
 *    - Contains user profile keys (public and private)
 *    - Contains ONLY network PUBLIC key (never private keys)
 *    - Cannot decrypt network-encrypted data (no network private keys)
 *    - Can encrypt for network (has network public key)
 * 3. Node: Backend with network private keys (no user profile keys)
 *    - Contains network private keys for decryption
 *    - No user profile keys (cannot decrypt user-encrypted data)
 *    - Can decrypt network-encrypted data
 */
export class AnyValueTestEnvironment {
  private masterMobileKeys: Keys; // Master mobile - used only for setup/admin
  private userMobileKeys: Keys; // User mobile - end user device with profile keys + network public key
  private nodeKeys: Keys; // Node - backend with network private keys
  private userMobileWrapper: KeysWrapperMobile | null;
  private nodeWrapper: KeysWrapperNode | null;
  private networkId: string;
  private networkPublicKey: Uint8Array;
  private userProfileKeys: Uint8Array[];
  private labelResolverConfig: LabelResolverConfig;
  private resolver: LabelResolver | null; // Will be set during initialization

  constructor() {
    // Initialize all three keystores
    this.masterMobileKeys = new Keys();
    this.userMobileKeys = new Keys();
    this.nodeKeys = new Keys();

    // Will create wrappers after proper initialization
    this.userMobileWrapper = null; // Will be set after initialization
    this.nodeWrapper = null; // Will be set after initialization

    this.networkId = '';
    this.networkPublicKey = new Uint8Array(0);
    this.userProfileKeys = [];
    this.labelResolverConfig = { labelMappings: new Map() };
    this.resolver = null;
  }

  async initialize(): Promise<void> {
    // Initializing Test Environment with Real Keys - MIRRORING RUST encryption_test.rs EXACTLY
    // This setup simulates the real-world scenario:
    // 1. Master Mobile: Used for setup/admin, generates network keys and certificates
    // 2. User Mobile: End user device with only user profile keys, NO network private keys
    // 3. Node: Backend with network private keys, NO user profile keys

    // 1. Setup MASTER mobile keystore (like mobile_network_master in Rust)
    // This is used for setup/admin, generates network keys, never used by end users
    this.masterMobileKeys.setPersistenceDir('/tmp/runar-anyvalue-test-master-mobile');
    this.masterMobileKeys.enableAutoPersist(true);
    this.masterMobileKeys.initAsMobile();
    await this.masterMobileKeys.mobileInitializeUserRootKey();
    await this.masterMobileKeys.flushState();

    // Generate network key from master mobile
    this.networkPublicKey = this.masterMobileKeys.mobileGenerateNetworkDataKey();
    this.networkId = 'generated-network';

    // 2. Create USER mobile keystore (like user_mobile in Rust)
    // This simulates an end user's mobile device with only user profile keys
    this.userMobileKeys.setPersistenceDir('/tmp/runar-anyvalue-test-user-mobile');
    this.userMobileKeys.enableAutoPersist(true);
    this.userMobileKeys.initAsMobile();
    await this.userMobileKeys.mobileInitializeUserRootKey();
    await this.userMobileKeys.flushState();

    // Generate profile keys for user mobile (like profile_pk in Rust)
    const profilePk = new Uint8Array(this.userMobileKeys.mobileDeriveUserProfileKey('user'));
    this.userProfileKeys = [profilePk];

    // Install ONLY the network public key on user mobile (not private key)
    // This is the key difference - user mobile can encrypt for network but cannot decrypt network-encrypted data
    this.userMobileKeys.mobileInstallNetworkPublicKey(this.networkPublicKey);

    // Create user mobile wrapper
    const userMobileResult = KeystoreFactory.createMobile(this.userMobileKeys);
    if (isErr(userMobileResult)) {
      throw new Error(
        `Failed to create user mobile keystore wrapper: ${userMobileResult.error.message}`
      );
    }
    this.userMobileWrapper = userMobileResult.value;

    // 3. Setup node keys (like node_keys in Rust)
    this.nodeKeys.setPersistenceDir('/tmp/runar-anyvalue-test-node');
    this.nodeKeys.enableAutoPersist(true);
    this.nodeKeys.initAsNode();

    // Install network key on node using master mobile keystore
    const token = this.nodeKeys.nodeGenerateCsr();
    const nodeAgreementPk = this.nodeKeys.nodeGetAgreementPublicKey();
    const nkMsg = this.masterMobileKeys.mobileCreateNetworkKeyMessage(
      this.networkPublicKey,
      nodeAgreementPk
    );
    this.nodeKeys.nodeInstallNetworkKey(nkMsg);

    // Create node wrapper
    const nodeResult = KeystoreFactory.createNode(this.nodeKeys);
    if (isErr(nodeResult)) {
      throw new Error(`Failed to create node keystore wrapper: ${nodeResult.error.message}`);
    }
    this.nodeWrapper = nodeResult.value;

    // Create label resolver config that mirrors Rust encryption_test.rs EXACTLY
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
            userKeySpec: undefined,
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
    if (isErr(resolverResult)) {
      throw new Error(`Failed to create resolver: ${resolverResult.error.message}`);
    }
    this.resolver = resolverResult.value;

    // Network created with public key, profile keys generated, Test Environment initialized successfully
  }

  getUserMobileWrapper(): KeysWrapperMobile {
    if (this.userMobileWrapper === null) {
      throw new Error('User mobile wrapper not initialized. Call initialize() first.');
    }
    return this.userMobileWrapper;
  }

  getNodeWrapper(): KeysWrapperNode {
    if (this.nodeWrapper === null) {
      throw new Error('Node wrapper not initialized. Call initialize() first.');
    }
    return this.nodeWrapper;
  }

  // Get master mobile keys (for reference - not used in tests, only for setup)
  getMasterMobileKeys(): Keys {
    return this.masterMobileKeys;
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
    if (this.resolver === null) {
      throw new Error('Resolver not initialized. Call initialize() first.');
    }
    return this.resolver;
  }

  createSerializationContext(keystore: KeysWrapperMobile): SerializationContext {
    return {
      keystore,
      resolver: this.getResolver(),
      networkPublicKey: this.networkPublicKey,
      profilePublicKeys: this.userProfileKeys,
    };
  }

  createDeserializationContext(
    keystore: KeysWrapperNode | KeysWrapperMobile
  ): DeserializationContext {
    return {
      keystore,
      resolver: this.getResolver(),
    };
  }

  async cleanup(): Promise<void> {
    try {
      await this.masterMobileKeys.wipePersistence();
      await this.userMobileKeys.wipePersistence();
      await this.nodeKeys.wipePersistence();
    } catch (error) {
      // Cleanup warning: ${error.message}
    }
  }
}
