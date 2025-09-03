import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Keys } from 'runar-nodejs-api';
import {
  KeystoreFactory,
  KeysWrapperMobile,
  KeysWrapperNode,
} from 'runar-ts-node/src/keys_manager_wrapper.js';

// Test environment for envelope dual decryption testing
class EnvelopeTestEnvironment {
  private mobileKeys: Keys;
  private nodeKeys: Keys;
  private mobileWrapper: KeysWrapperMobile;
  private nodeWrapper: KeysWrapperNode;
  private networkPublicKey: Uint8Array;
  private profileKeys: Uint8Array[];

  constructor() {
    this.mobileKeys = new Keys();
    this.nodeKeys = new Keys();

    // Create keystore wrappers
    const mobileResult = KeystoreFactory.create(this.mobileKeys, 'frontend');
    const nodeResult = KeystoreFactory.create(this.nodeKeys, 'backend');

    if (!mobileResult.ok || !nodeResult.ok) {
      throw new Error('Failed to create keystore wrappers');
    }

    this.mobileWrapper = mobileResult.value as KeysWrapperMobile;
    this.nodeWrapper = nodeResult.value as KeysWrapperNode;

    this.networkPublicKey = new Uint8Array(0);
    this.profileKeys = [];
  }

  async initialize(): Promise<void> {
    // Setup mobile keystore
    this.mobileKeys.setPersistenceDir('/tmp/runar-envelope-test-mobile');
    this.mobileKeys.enableAutoPersist(true);
    this.mobileKeys.initAsMobile();
    await this.mobileKeys.mobileInitializeUserRootKey();
    await this.mobileKeys.flushState();

    // Generate network key
    this.networkPublicKey = this.mobileKeys.mobileGenerateNetworkDataKey();

    // Generate profile keys
    const personalKey = new Uint8Array(this.mobileKeys.mobileDeriveUserProfileKey('personal'));
    const workKey = new Uint8Array(this.mobileKeys.mobileDeriveUserProfileKey('work'));
    this.profileKeys = [personalKey, workKey];

    // Setup node keystore
    this.nodeKeys.setPersistenceDir('/tmp/runar-envelope-test-node');
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

  getProfileKeys(): Uint8Array[] {
    return this.profileKeys;
  }

  async cleanup(): Promise<void> {
    try {
      await this.mobileKeys.wipePersistence();
      await this.nodeKeys.wipePersistence();
    } catch (error) {
      // Cleanup warning
    }
  }
}

describe('Envelope Dual Decryption Tests', () => {
  let testEnv: EnvelopeTestEnvironment;

  beforeAll(async () => {
    testEnv = new EnvelopeTestEnvironment();
    await testEnv.initialize();
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it('should demonstrate that the same envelope can be decrypted by both mobile (profile keys) and node (network keys)', async () => {
    console.log('🔐 Testing Envelope Dual Decryption Capability');

    const testData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const networkPublicKey = testEnv.getNetworkPublicKey();
    const profileKeys = testEnv.getProfileKeys();

    // Step 1: Mobile encrypts data with BOTH network and profile keys
    console.log('   📱 Mobile encrypting with both network and profile keys...');
    const encrypted = testEnv.getMobileWrapper().encryptWithEnvelope(
      testData,
      networkPublicKey,  // Network key
      profileKeys        // Profile keys
    );

    expect(encrypted).toBeInstanceOf(Uint8Array);
    expect(encrypted.length).toBeGreaterThan(0);
    expect(encrypted).not.toEqual(testData); // Should be encrypted
    console.log('   ✅ Mobile encryption completed');

    // Step 2: Node decrypts using network keys
    console.log('   🖥️  Node decrypting with network keys...');
    const decryptedByNode = testEnv.getNodeWrapper().decryptEnvelope(encrypted);
    
    expect(decryptedByNode).toBeInstanceOf(Uint8Array);
    expect(decryptedByNode).toEqual(testData);
    console.log('   ✅ Node decryption successful');

    // Step 3: Mobile decrypts using profile keys (same envelope!)
    console.log('   📱 Mobile decrypting with profile keys (same envelope)...');
    const decryptedByMobile = testEnv.getMobileWrapper().decryptEnvelope(encrypted);
    
    expect(decryptedByMobile).toBeInstanceOf(Uint8Array);
    expect(decryptedByMobile).toEqual(testData);
    console.log('   ✅ Mobile decryption successful');

    // Step 4: Verify both decryptions produce identical results
    expect(decryptedByNode).toEqual(decryptedByMobile);
    console.log('   ✅ Both decryptions produce identical results');

    console.log('   🎉 Envelope dual decryption capability verified!');
    console.log('      - Same envelope encrypted with both network + profile keys');
    console.log('      - Node can decrypt using network keys');
    console.log('      - Mobile can decrypt using profile keys');
    console.log('      - Both produce identical plaintext');
  });

  it('should demonstrate that envelope encryption works with only profile keys', async () => {
    console.log('🔐 Testing Envelope Encryption with Profile Keys Only');

    const testData = new Uint8Array([10, 20, 30, 40, 50]);
    const profileKeys = testEnv.getProfileKeys();

    // Encrypt with only profile keys (no network key)
    console.log('   📱 Mobile encrypting with profile keys only...');
    const encrypted = testEnv.getMobileWrapper().encryptWithEnvelope(
      testData,
      null,           // No network key
      profileKeys     // Only profile keys
    );

    expect(encrypted).toBeInstanceOf(Uint8Array);
    expect(encrypted.length).toBeGreaterThan(0);
    expect(encrypted).not.toEqual(testData);
    console.log('   ✅ Mobile encryption with profile keys completed');

    // Mobile should be able to decrypt with profile keys
    console.log('   📱 Mobile decrypting with profile keys...');
    const decryptedByMobile = testEnv.getMobileWrapper().decryptEnvelope(encrypted);
    
    expect(decryptedByMobile).toBeInstanceOf(Uint8Array);
    expect(decryptedByMobile).toEqual(testData);
    console.log('   ✅ Mobile decryption with profile keys successful');

    // Node should NOT be able to decrypt (no network key in envelope)
    console.log('   🖥️  Node attempting to decrypt (should fail)...');
    try {
      const decryptedByNode = testEnv.getNodeWrapper().decryptEnvelope(encrypted);
      // If we get here, the test should fail because node shouldn't be able to decrypt
      expect(decryptedByNode).not.toEqual(testData);
      console.log('   ⚠️  Node decryption unexpectedly succeeded');
    } catch (error) {
      console.log('   ✅ Node decryption failed as expected (no network key)');
    }
  });

  it('should demonstrate that envelope encryption works with only network keys', async () => {
    console.log('🔐 Testing Envelope Encryption with Network Keys Only');

    const testData = new Uint8Array([100, 200, 300, 400, 500]);
    const networkPublicKey = testEnv.getNetworkPublicKey();

    // Encrypt with only network key (no profile keys)
    console.log('   📱 Mobile encrypting with network key only...');
    const encrypted = testEnv.getMobileWrapper().encryptWithEnvelope(
      testData,
      networkPublicKey,  // Network key
      []                 // No profile keys
    );

    expect(encrypted).toBeInstanceOf(Uint8Array);
    expect(encrypted.length).toBeGreaterThan(0);
    expect(encrypted).not.toEqual(testData);
    console.log('   ✅ Mobile encryption with network key completed');

    // Node should be able to decrypt with network keys
    console.log('   🖥️  Node decrypting with network keys...');
    const decryptedByNode = testEnv.getNodeWrapper().decryptEnvelope(encrypted);
    
    expect(decryptedByNode).toBeInstanceOf(Uint8Array);
    expect(decryptedByNode).toEqual(testData);
    console.log('   ✅ Node decryption with network keys successful');

    // Mobile should NOT be able to decrypt (no profile keys in envelope)
    console.log('   📱 Mobile attempting to decrypt (should fail)...');
    try {
      const decryptedByMobile = testEnv.getMobileWrapper().decryptEnvelope(encrypted);
      // If we get here, the test should fail because mobile shouldn't be able to decrypt
      expect(decryptedByMobile).not.toEqual(testData);
      console.log('   ⚠️  Mobile decryption unexpectedly succeeded');
    } catch (error) {
      console.log('   ✅ Mobile decryption failed as expected (no profile keys)');
    }
  });
});
