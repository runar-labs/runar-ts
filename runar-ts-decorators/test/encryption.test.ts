import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { type RunarEncryptable } from '../src/index';
import { TestProfile } from '../test_fixtures/dist/test_fixtures/test_fixtures';
import type { EncryptedTestProfile } from '../src/encrypted-types';
import { AnyValueTestEnvironment } from '../../runar-ts-serializer/test/test_utils/key_managers';

// Import Result type and utilities
import { Result, isErr, isOk } from 'runar-ts-common/src/error/Result';

// Import logging
import { Logger, Component } from 'runar-ts-common/src/logging/logger';
import { LoggingConfig, LogLevel, applyLoggingConfig } from 'runar-ts-common/src/logging/config';

/**
 * DIRECT ENCRYPTION/DECRYPTION TESTS
 *
 * This file contains tests for direct encryption/decryption operations without AnyValue serialization.
 * These tests focus on:
 * - Direct encryptWithKeystore/decryptWithKeystore calls
 * - Keystore capability validation
 * - PKI workflow validation
 * - Multi-recipient envelope encryption
 * - Network-only encryption
 *
 * NO MOCKS, NO STUBS, NO SHORTCUTS - Real cryptographic operations only
 */

describe('Direct Encryption/Decryption Tests', () => {
  let testEnv: AnyValueTestEnvironment;
  let logger: Logger;

  beforeAll(async () => {
    // Setup comprehensive logging for debugging
    const loggingConfig = LoggingConfig.new().withDefaultLevel(LogLevel.Info);

    applyLoggingConfig(loggingConfig);
    logger = Logger.newRoot(Component.Node).setNodeId('test-node-123');

    logger.info('Starting Direct Encryption/Decryption Tests');

    testEnv = new AnyValueTestEnvironment();
    await testEnv.initialize();
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  describe('Direct Encryption/Decryption Operations', () => {
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
        testEnv.getUserMobileWrapper(),
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
        testEnv.getUserMobileWrapper(),
        logger
      );
      expect(isOk(decryptedMobile)).toBe(true);
      if (isErr(decryptedMobile)) {
        throw new Error(`Mobile decryption failed: ${decryptedMobile.error.message}`);
      }

      const mobileProfile = decryptedMobile.value;
      expect(mobileProfile.id).toBe(original.id);
      expect(mobileProfile.name).toBe(''); // Mobile should NOT have access to name
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
  });

  describe('Keystore Capability Validation', () => {
    it('should validate mobile vs node access patterns', async () => {
      const testData = new TestProfile(
        'access-123',
        'Access Test',
        'access private',
        'access@example.com',
        'access metadata'
      );

      // Test mobile keystore capabilities
      const mobileCaps = testEnv.getUserMobileWrapper().getKeystoreCaps();
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

  describe('PKI and Certificate Workflow', () => {
    it('should complete full PKI workflow validation', () => {
      console.log('🔐 Testing Complete PKI Workflow');

      // Validate mobile keystore initialization
      expect(testEnv.getUserMobileWrapper()).toBeDefined();
      const mobileCaps = testEnv.getUserMobileWrapper().getKeystoreCaps();
      expect(mobileCaps.hasProfileKeys).toBe(true);
      expect(mobileCaps.hasNetworkKeys).toBe(false);

      // Validate node keystore initialization
      expect(testEnv.getNodeWrapper()).toBeDefined();
      const nodeCaps = testEnv.getNodeWrapper().getKeystoreCaps();
      expect(nodeCaps.hasProfileKeys).toBe(false);
      expect(nodeCaps.hasNetworkKeys).toBe(true);

      // Validate network setup
      expect(testEnv.getNetworkPublicKey().length).toBeGreaterThan(0);

      // Validate profile key generation
      expect(testEnv.getUserProfileKeys().length).toBe(1);
      expect(testEnv.getUserProfileKeys()[0].length).toBe(65); // ECDSA P-256 uncompressed

      // Validate label resolver configuration
      const config = testEnv.getLabelResolverConfig();
      expect(config.labelMappings.size).toBe(4);
      expect(config.labelMappings.has('user')).toBe(true);
      expect(config.labelMappings.has('system')).toBe(true);
      expect(config.labelMappings.has('search')).toBe(true);
      expect(config.labelMappings.has('system_only')).toBe(true);

      console.log('   ✅ Complete PKI workflow validated');
    });
  });

  describe('Multi-Recipient Envelope Encryption', () => {
    it('should handle multiple profile recipients correctly', async () => {
      console.log('🔐 Testing Multi-Recipient Envelope Encryption');

      const testData = new Uint8Array([111, 222, 333]);
      const allProfileKeys = testEnv.getUserProfileKeys();

      // Encrypt for multiple recipients
      const encrypted = testEnv
        .getUserMobileWrapper()
        .encryptWithEnvelope(testData, testEnv.getNetworkPublicKey(), allProfileKeys);

      expect(encrypted.length).toBeGreaterThan(testData.length);

      // Both mobile and node should be able to decrypt
      const mobileDecrypted = testEnv.getUserMobileWrapper().decryptEnvelope(encrypted);
      const nodeDecrypted = testEnv.getNodeWrapper().decryptEnvelope(encrypted);

      expect(mobileDecrypted).toEqual(testData);
      expect(nodeDecrypted).toEqual(testData);

      console.log('   ✅ Multi-recipient encryption successful');
    });

    it('should handle network-only encryption', async () => {
      console.log('🔐 Testing Network-Only Encryption');

      const testData = new Uint8Array([1, 1, 1]);

      // Encrypt with network key only (empty profile keys)
      const encrypted = testEnv
        .getUserMobileWrapper()
        .encryptWithEnvelope(testData, testEnv.getNetworkPublicKey(), []);

      // Node should be able to decrypt (has network key)
      const nodeDecrypted = testEnv.getNodeWrapper().decryptEnvelope(encrypted);
      expect(nodeDecrypted).toEqual(testData);

      console.log('   ✅ Network-only encryption successful');
    });
  });
});
