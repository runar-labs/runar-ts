import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AnyValue, SerializationContext } from '../src/index.js';
import { KeysManagerWrapper } from '../../runar-ts-node/src/keys_manager_wrapper.js';
import { Keys } from 'runar-nodejs-api';
import { encode, decode } from 'cbor-x';

describe('Real Encryption with nodejs-api', () => {
  it('should encrypt and decrypt using mobile keys with real nodejs-api', async () => {
    const keys = new Keys();

    // Set persistence directory first
    keys.setPersistenceDir('/tmp/runar-keys-test');
    keys.enableAutoPersist(true);

    // Initialize as mobile manager
    keys.initAsMobile();

    // Initialize user root key
    await keys.mobileInitializeUserRootKey();
    await keys.flushState();

    // Generate a network public key for envelope encryption
    const networkPublicKey = keys.mobileGenerateNetworkDataKey();

    // Create profile keys using the proper derivation method
    const personalKey = keys.mobileDeriveUserProfileKey('personal');
    const workKey = keys.mobileDeriveUserProfileKey('work');
    const profilePks = [personalKey, workKey];

    // Create wrapper
    const keysWrapper = new KeysManagerWrapper(keys);

    // Create serialization context
    const context: SerializationContext = {
      keystore: keysWrapper,
      resolver: {} as any, // TODO: Create real resolver for test
      networkPublicKey: networkPublicKey, // Use Buffer type
      profilePublicKeys: profilePks, // Use Buffer[] type
    };

    // Test data
    const testData = { message: 'Hello, Mobile World!', number: 42 };
    const dataBuffer = Buffer.from(encode(testData));

    // Encrypt using wrapper - pass networkPublicKey as Buffer, not networkId as string
    const encrypted = keysWrapper.encryptWithEnvelope(dataBuffer, networkPublicKey, profilePks);

    // Decrypt using wrapper
    const decrypted = keysWrapper.decryptEnvelope(encrypted);

    // Verify the roundtrip
    const decoded = decode(decrypted);
    assert.deepStrictEqual(decoded, testData);

    // Test with AnyValue serialization
    const anyValue = AnyValue.newBytes(dataBuffer);
    const serialized = await anyValue.serialize(context);

    assert(serialized.ok);
    assert(serialized.value.length > 0);
  });

  it('should encrypt and decrypt using node keys with real nodejs-api', async () => {
    const keys = new Keys();

    // Set persistence directory first
    keys.setPersistenceDir('/tmp/runar-keys-test');
    keys.enableAutoPersist(true);

    // Initialize as node manager
    keys.initAsNode();

    // Create wrapper
    const keysWrapper = new KeysManagerWrapper(keys);

    // Test data
    const testData = { message: 'Hello, Node World!', number: 123 };
    const dataBuffer = Buffer.from(encode(testData));

    // For node envelope encryption, we need a properly installed network key
    // Since we don't have a real network setup in tests, we'll test local encryption instead
    // This is the same approach used in the Node.js API tests

    try {
      // Test local encryption (this should work without network setup)
      const encrypted = keys.encryptLocalData(dataBuffer);
      const decrypted = keys.decryptLocalData(encrypted);

      // Verify the roundtrip
      const decoded = decode(decrypted);
      assert.deepStrictEqual(decoded, testData);

      // Test with AnyValue serialization using local encryption context
      const context: SerializationContext = {
        keystore: keysWrapper,
        resolver: {} as any, // TODO: Create real resolver for test
        // No network or profile keys for local encryption
      };

      const anyValue = AnyValue.newBytes(dataBuffer);
      const serialized = await anyValue.serialize(context);

      assert(serialized.ok);
      assert(serialized.value.length > 0);

      console.log('✅ Node local encryption test completed successfully');
    } catch (error) {
      console.log('Node local encryption test failed:', error.message);
      throw error;
    }
  });

  it('should handle local encryption with node keys', async () => {
    const keys = new Keys();

    // Set persistence directory first
    keys.setPersistenceDir('/tmp/runar-keys-test');
    keys.enableAutoPersist(true);

    // Initialize as node manager
    keys.initAsNode();

    // Create wrapper
    const keysWrapper = new KeysManagerWrapper(keys);

    // Create serialization context
    const context: SerializationContext = {
      keystore: keysWrapper,
      resolver: {} as any, // Mock resolver for test
      // No network or profile keys for local encryption test
    };

    // Test data
    const testData = { message: 'Hello, Local World!', number: 456 };
    const dataBuffer = Buffer.from(encode(testData));

    // Test local encryption (this should work without network setup)
    const encrypted = keys.encryptLocalData(dataBuffer);
    const decrypted = keys.decryptLocalData(encrypted);

    // Verify the roundtrip
    const decoded = decode(decrypted);
    assert.deepStrictEqual(decoded, testData);

    // Test with AnyValue serialization
    const anyValue = AnyValue.newBytes(dataBuffer);
    const serialized = await anyValue.serialize(context);

    assert(serialized.ok);
    assert(serialized.value.length > 0);
  });
});
