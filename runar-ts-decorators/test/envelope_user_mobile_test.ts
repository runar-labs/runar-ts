import { describe, it, expect, beforeEach } from 'bun:test';
import { Keys } from 'runar-nodejs-api';
import { KeystoreFactory, KeysWrapperMobile, KeysWrapperNode } from 'runar-ts-node/src/keys_manager_wrapper';

describe('Envelope User Mobile Test', () => {
  let masterMobileKeys: Keys;
  let userMobileKeys: Keys;
  let nodeKeys: Keys;
  let userMobileWrapper: KeysWrapperMobile;
  let nodeWrapper: KeysWrapperNode;
  let networkPublicKey: Uint8Array;
  let userProfileKeys: Uint8Array[];

  beforeEach(async () => {
    // 1. Setup MASTER mobile keystore (network setup only)
    masterMobileKeys = new Keys();
    masterMobileKeys.setPersistenceDir('/tmp/runar-envelope-user-test-master');
    masterMobileKeys.enableAutoPersist(true);
    masterMobileKeys.initAsMobile();
    await masterMobileKeys.mobileInitializeUserRootKey();
    await masterMobileKeys.flushState();

    // Generate network key from master mobile
    networkPublicKey = masterMobileKeys.mobileGenerateNetworkDataKey();

    // 2. Create USER mobile keystore (profile keys only)
    userMobileKeys = new Keys();
    userMobileKeys.setPersistenceDir('/tmp/runar-envelope-user-test-user');
    userMobileKeys.enableAutoPersist(true);
    userMobileKeys.initAsMobile();
    await userMobileKeys.mobileInitializeUserRootKey();
    await userMobileKeys.flushState();

    // Generate profile keys for user mobile
    const profilePk = new Uint8Array(userMobileKeys.mobileDeriveUserProfileKey('user'));
    userProfileKeys = [profilePk]; // Use the derived profile key
    
    // Flush state after deriving profile keys to ensure they're persisted
    await userMobileKeys.flushState();

    // Install ONLY the network public key on user mobile (not private key)
    // We already have networkPublicKey from master mobile, so just install it directly
    userMobileKeys.mobileInstallNetworkPublicKey(networkPublicKey);

    // 3. Setup node keystore
    nodeKeys = new Keys();
    nodeKeys.setPersistenceDir('/tmp/runar-envelope-user-test-node');
    nodeKeys.enableAutoPersist(true);
    nodeKeys.initAsNode();

    // Install network key on node using master mobile keystore
    const token = nodeKeys.nodeGenerateCsr();
    const nodeAgreementPk = nodeKeys.nodeGetAgreementPublicKey();
    const nkMsg = masterMobileKeys.mobileCreateNetworkKeyMessage(
      networkPublicKey,
      nodeAgreementPk
    );
    nodeKeys.nodeInstallNetworkKey(nkMsg);

    // Create wrappers
    const userMobileResult = KeystoreFactory.create(userMobileKeys, 'frontend');
    if (!userMobileResult.ok) {
      throw new Error(`Failed to create user mobile keystore wrapper: ${(userMobileResult as any).error.message}`);
    }
    userMobileWrapper = userMobileResult.value as KeysWrapperMobile;

    const nodeResult = KeystoreFactory.create(nodeKeys, 'backend');
    if (!nodeResult.ok) {
      throw new Error(`Failed to create node keystore wrapper: ${(nodeResult as any).error.message}`);
    }
    nodeWrapper = nodeResult.value as KeysWrapperNode;
  });

  it('should encrypt with both network and profile keys, then decrypt with user mobile', () => {
    const testData = new Uint8Array([1, 2, 3, 4, 5]);

    console.log('🔐 Testing envelope encryption with user mobile keystore');
    console.log('   📱 User mobile encrypting with both network and profile keys...');
    
    // Encrypt with both network and profile keys
    const encrypted = userMobileWrapper.encryptWithEnvelope(
      testData,
      networkPublicKey,  // Network key
      userProfileKeys    // Profile keys
    );

    expect(encrypted).toBeInstanceOf(Uint8Array);
    expect(encrypted.length).toBeGreaterThan(0);
    expect(encrypted).not.toEqual(testData);
    console.log('   ✅ User mobile encryption completed');

    // User mobile should be able to decrypt with profile keys
    console.log('   📱 User mobile decrypting with profile keys...');
    const decryptedByUserMobile = userMobileWrapper.decryptEnvelope(encrypted);
    
    expect(decryptedByUserMobile).toBeInstanceOf(Uint8Array);
    expect(decryptedByUserMobile).toEqual(testData);
    console.log('   ✅ User mobile decryption successful');

    // Node should also be able to decrypt with network keys
    console.log('   🖥️  Node decrypting with network keys...');
    const decryptedByNode = nodeWrapper.decryptEnvelope(encrypted);
    
    expect(decryptedByNode).toBeInstanceOf(Uint8Array);
    expect(decryptedByNode).toEqual(testData);
    console.log('   ✅ Node decryption successful');

    console.log('   🎉 User mobile envelope dual decryption verified!');
  });

  it('should encrypt with profile keys only, then decrypt with user mobile', () => {
    const testData = new Uint8Array([1, 2, 3, 4, 5]);

    console.log('🔐 Testing envelope encryption with profile keys only');
    console.log('   📱 User mobile encrypting with profile keys only...');
    
    // Encrypt with only profile keys
    const encrypted = userMobileWrapper.encryptWithEnvelope(
      testData,
      null,              // No network key
      userProfileKeys    // Only profile keys
    );

    expect(encrypted).toBeInstanceOf(Uint8Array);
    expect(encrypted.length).toBeGreaterThan(0);
    expect(encrypted).not.toEqual(testData);
    console.log('   ✅ User mobile encryption with profile keys completed');

    // User mobile should be able to decrypt with profile keys
    console.log('   📱 User mobile decrypting with profile keys...');
    const decryptedByUserMobile = userMobileWrapper.decryptEnvelope(encrypted);
    
    expect(decryptedByUserMobile).toBeInstanceOf(Uint8Array);
    expect(decryptedByUserMobile).toEqual(testData);
    console.log('   ✅ User mobile decryption successful');

    // Node should NOT be able to decrypt (no network keys in envelope)
    console.log('   🖥️  Node attempting to decrypt (should fail)...');
    try {
      const decryptedByNode = nodeWrapper.decryptEnvelope(encrypted);
      // If we get here, the test should fail because node shouldn't be able to decrypt
      expect(decryptedByNode).not.toEqual(testData);
      console.log('   ⚠️  Node decryption unexpectedly succeeded');
    } catch (error) {
      console.log('   ✅ Node decryption failed as expected (no network keys)');
      expect(error).toBeDefined();
    }

    console.log('   🎉 Profile-only envelope encryption verified!');
  });
});
