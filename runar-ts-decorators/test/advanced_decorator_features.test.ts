import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { type RunarEncryptable } from '../src/index';
import {
  TestProfile,
  AdvancedTestProfile,
  NestedEncryptedProfile,
  ComplexPriorityProfile,
  SystemMetadata,
} from '../test_fixtures/dist/test_fixtures/test_fixtures';
import type {
  EncryptedTestProfile,
  EncryptedAdvancedTestProfile,
  EncryptedNestedEncryptedProfile,
  EncryptedComplexPriorityProfile,
} from '../src/encrypted-types';
import { TestEnvironment } from '../../runar-ts-serializer/test/test_utils/key_managers';
import { EncryptedLabelGroup } from '../../runar-ts-serializer/src/encryption';

// Import Result type and utilities
import { Result, isErr, isOk } from 'runar-ts-common/src/error/Result';

// Import logging
import { Logger, Component } from 'runar-ts-common/src/logging/logger';
import { LoggingConfig, LogLevel, applyLoggingConfig } from 'runar-ts-common/src/logging/config';

/**
 * ADVANCED DECORATOR FEATURES TESTS
 *
 * This file contains comprehensive tests for advanced decorator features:
 * - Multiple labels per field (@runar(['label1', 'label2']))
 * - Field grouping by label
 * - Nested encrypted objects
 * - Complex field handling
 * - Error handling and edge cases
 *
 * NO MOCKS, NO STUBS, NO SHORTCUTS - Real cryptographic operations only
 */

describe('Advanced Decorator Features Tests', () => {
  let testEnv: TestEnvironment;
  let logger: Logger;

  beforeAll(async () => {
    // Setup comprehensive logging for debugging
    const loggingConfig = LoggingConfig.new().withDefaultLevel(LogLevel.Info);
    applyLoggingConfig(loggingConfig);
    logger = Logger.newRoot(Component.Node).setNodeId('test-node-123');

    logger.info('Starting Advanced Decorator Features Tests');

    testEnv = new TestEnvironment();
    await testEnv.initialize();
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  describe('Multiple Labels Per Field', () => {
    it('should handle fields with multiple labels correctly', async () => {
      const original = new AdvancedTestProfile(
        'multi-123',
        'shared data',
        'system data',
        'user data',
        'search data',
        'custom data'
      );

      // Test encryption
      const encryptableOriginal = original as AdvancedTestProfile &
        RunarEncryptable<AdvancedTestProfile, EncryptedAdvancedTestProfile>;
      const encryptResult = encryptableOriginal.encryptWithKeystore(
        testEnv.getUserMobileWrapper(),
        testEnv.getResolver()
      );

      if (isErr(encryptResult)) {
        // Encryption failed - error details are in the result
      }
      expect(isOk(encryptResult)).toBe(true);
      if (isErr(encryptResult)) {
        throw new Error(`Encryption failed: ${encryptResult.error.message}`);
      }

      const encrypted = encryptResult.value;

      // Verify encrypted struct has the expected fields
      expect(encrypted.id).toBe('multi-123');
      expect(encrypted.system_encrypted).toBeDefined();
      expect(encrypted.user_encrypted).toBeDefined();
      expect(encrypted.search_encrypted).toBeDefined();
      expect(encrypted.custom_encrypted).toBeDefined();

      // Test decryption with mobile (should have access to user and search fields)
      const encryptedCompanion = encrypted as unknown as RunarEncryptable<
        AdvancedTestProfile,
        EncryptedAdvancedTestProfile
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
      expect(mobileProfile.sharedData).toBe(original.sharedData); // Should be accessible via user label
      expect(mobileProfile.userData).toBe(original.userData);
      expect(mobileProfile.searchData).toBe(original.searchData);
      expect(mobileProfile.systemData).toBe(''); // Should be empty (no access)
      expect(mobileProfile.customData).toBe(original.customData); // Should be accessible (user label)
    });

    it('should handle field grouping by label correctly', async () => {
      const original = new ComplexPriorityProfile(
        'priority-123',
        'critical data',
        'system info',
        'user info',
        'search info',
        'custom info',
        'shared info'
      );

      // Test encryption
      const encryptableOriginal = original as ComplexPriorityProfile &
        RunarEncryptable<ComplexPriorityProfile, EncryptedComplexPriorityProfile>;
      const encryptResult = encryptableOriginal.encryptWithKeystore(
        testEnv.getUserMobileWrapper(),
        testEnv.getResolver()
      );
      expect(isOk(encryptResult)).toBe(true);
      if (isErr(encryptResult)) {
        throw new Error(`Encryption failed: ${encryptResult.error.message}`);
      }

      const encrypted = encryptResult.value;

      // Verify encrypted struct has the expected fields
      expect(encrypted.id).toBe('priority-123');
      expect(encrypted.system_only_encrypted).toBeDefined();
      expect(encrypted.system_encrypted).toBeDefined();
      expect(encrypted.user_encrypted).toBeDefined();
      expect(encrypted.search_encrypted).toBeDefined();
      expect(encrypted.custom_encrypted).toBeDefined();

      // Test decryption with mobile (should have access to user and search fields)
      const encryptedCompanion = encrypted as unknown as RunarEncryptable<
        ComplexPriorityProfile,
        EncryptedComplexPriorityProfile
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
      expect(mobileProfile.userInfo).toBe(original.userInfo);
      expect(mobileProfile.searchInfo).toBe(original.searchInfo);
      expect(mobileProfile.sharedInfo).toBe(original.sharedInfo); // Should be accessible via user label
      expect(mobileProfile.criticalData).toBe(''); // Should be empty (no access)
      expect(mobileProfile.systemInfo).toBe(''); // Should be empty (no access)
      expect(mobileProfile.customInfo).toBe(original.customInfo); // Should be accessible (user label)
    });
  });

  describe('Nested Encrypted Objects', () => {
    it('should handle nested encrypted objects correctly', async () => {
      const nestedProfile = new TestProfile(
        'nested-123',
        'nested name',
        'nested private',
        'nested@example.com',
        'nested metadata'
      );

      const systemMetadata = new SystemMetadata(
        'metadata-123',
        'metadata@example.com',
        'metadata data'
      );

      const nestedData = new TestProfile(
        'nested-data-123',
        'nested data name',
        'nested data private',
        'nesteddata@example.com',
        'nested data metadata'
      );

      const original = new NestedEncryptedProfile(
        'parent-123',
        nestedProfile,
        systemMetadata,
        'user private data',
        nestedData
      );

      // Test encryption
      const encryptableOriginal = original as NestedEncryptedProfile &
        RunarEncryptable<NestedEncryptedProfile, EncryptedNestedEncryptedProfile>;
      const encryptResult = encryptableOriginal.encryptWithKeystore(
        testEnv.getUserMobileWrapper(),
        testEnv.getResolver()
      );
      expect(isOk(encryptResult)).toBe(true);
      if (isErr(encryptResult)) {
        throw new Error(`Encryption failed: ${encryptResult.error.message}`);
      }

      const encrypted = encryptResult.value;

      // Verify encrypted struct has the expected fields
      expect(encrypted.id).toBe('parent-123');
      expect(encrypted.user_encrypted).toBeDefined();
      // Note: system_encrypted is not present because metadata is stored as EncryptedSystemMetadata directly

      // Test decryption with mobile (should have access to user fields including nested profile)
      const encryptedCompanion = encrypted as unknown as RunarEncryptable<
        NestedEncryptedProfile,
        EncryptedNestedEncryptedProfile
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
      expect(mobileProfile.userPrivateData).toBe(original.userPrivateData); // Should have access to user field

      // Verify nested profile is decrypted correctly (mobile has access to user fields)
      expect(mobileProfile.profile).toBeDefined();
      if (mobileProfile.profile) {
        // The nested profile should be decrypted as a plain TestProfile object
        expect(mobileProfile.profile.id).toBe(nestedProfile.id);
        expect(mobileProfile.profile.name).toBe(''); // Should be empty (no access to system field)
        expect(mobileProfile.profile.privateData).toBe(nestedProfile.privateData); // Should have access to user field
        expect(mobileProfile.profile.email).toBe(nestedProfile.email); // Should have access to search field
        expect(mobileProfile.profile.systemMetadata).toBe(''); // Should be empty (no access to system_only field)
      }

      // Verify nested data is decrypted correctly (mobile has access to user fields)
      expect(mobileProfile.nestedData).toBeDefined();
      if (mobileProfile.nestedData) {
        // The nested data should be decrypted as a plain TestProfile object
        expect(mobileProfile.nestedData.id).toBe(nestedData.id);
        expect(mobileProfile.nestedData.name).toBe(''); // Should be empty (no access to system field)
        expect(mobileProfile.nestedData.privateData).toBe(nestedData.privateData); // Should have access to user field
        expect(mobileProfile.nestedData.email).toBe(nestedData.email); // Should have access to search field
        expect(mobileProfile.nestedData.systemMetadata).toBe(''); // Should be empty (no access to system_only field)
      }

      // Verify metadata is null (mobile has no access to system fields)
      expect(mobileProfile.metadata).toBeNull(); // Should be null (no access to system field)
    });

    it('should handle nested encrypted objects with node keystore (reverse access control)', async () => {
      const nestedProfile = new TestProfile(
        'nested-node-123',
        'nested node name',
        'nested node private',
        'nestednode@example.com',
        'nested node metadata'
      );

      const systemMetadata = new SystemMetadata(
        'metadata-node-123',
        'metadatanode@example.com',
        'metadata node data'
      );

      const nestedData = new TestProfile(
        'nested-data-node-123',
        'nested data node name',
        'nested data node private',
        'nesteddatanode@example.com',
        'nested data node metadata'
      );

      const original = new NestedEncryptedProfile(
        'parent-node-123',
        nestedProfile,
        systemMetadata,
        'user private data',
        nestedData
      );

      // Test encryption with mobile keystore
      const encryptableOriginal = original as NestedEncryptedProfile &
        RunarEncryptable<NestedEncryptedProfile, EncryptedNestedEncryptedProfile>;
      const encryptResult = encryptableOriginal.encryptWithKeystore(
        testEnv.getUserMobileWrapper(),
        testEnv.getResolver()
      );
      expect(isOk(encryptResult)).toBe(true);
      if (isErr(encryptResult)) {
        throw new Error(`Encryption failed: ${encryptResult.error.message}`);
      }

      const encrypted = encryptResult.value;

      // Test decryption with node keystore (should have access to system fields)
      const encryptedCompanion = encrypted as unknown as RunarEncryptable<
        NestedEncryptedProfile,
        EncryptedNestedEncryptedProfile
      >;
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
      expect(nodeProfile.userPrivateData).toBe(''); // Should be empty (no access to user field)

      // Verify nested profile is decrypted correctly (node has access to system fields)
      expect(nodeProfile.profile).toBeNull(); // Should be null (no access to user field)

      // Verify nested data is decrypted correctly (node has access to system fields)
      expect(nodeProfile.nestedData).toBeNull(); // Should be null (no access to user field)

      // Verify metadata is decrypted correctly (node has access to system fields)
      expect(nodeProfile.metadata).toBeDefined();
      if (nodeProfile.metadata) {
        // The metadata should be decrypted as a plain SystemMetadata object
        expect(nodeProfile.metadata.id).toBe(systemMetadata.id);
        expect(nodeProfile.metadata.email).toBe(''); // Should be empty (no access to user field)
        expect(nodeProfile.metadata.metadata).toBe(systemMetadata.metadata); // Should have access to system field
      }
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle missing keystore gracefully', async () => {
      const original = new TestProfile(
        'error-123',
        'error name',
        'error private',
        'error@example.com',
        'error metadata'
      );

      // Test encryption
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

      // Test decryption with null keystore (should handle gracefAully)
      const encryptedCompanion = encrypted as unknown as RunarEncryptable<
        TestProfile,
        EncryptedTestProfile
      >;
      const decryptedResult = encryptedCompanion.decryptWithKeystore(null as any, logger);
      expect(isErr(decryptedResult)).toBe(true);
      if (isErr(decryptedResult)) {
        expect(decryptedResult.error.message).toBe('Keystore is required for decryption');
      }
    });

    it('should handle malformed encrypted data gracefully', async () => {
      const original = new TestProfile(
        'malformed-123',
        'malformed name',
        'malformed private',
        'malformed@example.com',
        'malformed metadata'
      );

      // Test encryption
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

      // Corrupt one of the encrypted fields
      (encrypted as EncryptedTestProfile).user_encrypted =
        'corrupted data' as unknown as EncryptedLabelGroup;

      // Test decryption (should handle corruption gracefully)
      const encryptedCompanion = encrypted as unknown as RunarEncryptable<
        TestProfile,
        EncryptedTestProfile
      >;
      const decryptedResult = encryptedCompanion.decryptWithKeystore(
        testEnv.getUserMobileWrapper(),
        logger
      );
      expect(isOk(decryptedResult)).toBe(true);
      if (isOk(decryptedResult)) {
        const profile = decryptedResult.value;
        expect(profile.id).toBe(original.id);
        // User fields should be empty due to corruption, but other fields should work
        expect(profile.name).toBe(''); // Should be empty (no access)
        expect(profile.privateData).toBe(''); // Should be empty (corrupted)
        expect(profile.email).toBe(original.email); // Should work (search field)
        expect(profile.systemMetadata).toBe(''); // Should be empty (no access)
      }
    });
  });

  describe('Access Control Validation', () => {
    it('should enforce proper access control for custom fields', async () => {
      const original = new AdvancedTestProfile(
        'access-123',
        'shared data',
        'system data',
        'user data',
        'search data',
        'custom data'
      );

      // Test encryption
      const encryptableOriginal = original as AdvancedTestProfile &
        RunarEncryptable<AdvancedTestProfile, EncryptedAdvancedTestProfile>;
      const encryptResult = encryptableOriginal.encryptWithKeystore(
        testEnv.getUserMobileWrapper(),
        testEnv.getResolver()
      );
      expect(isOk(encryptResult)).toBe(true);
      if (isErr(encryptResult)) {
        throw new Error(`Encryption failed: ${encryptResult.error.message}`);
      }

      const encrypted = encryptResult.value;

      // Test decryption with node keystore (should have access to system fields)
      const encryptedCompanion = encrypted as unknown as RunarEncryptable<
        AdvancedTestProfile,
        EncryptedAdvancedTestProfile
      >;
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
      expect(nodeProfile.sharedData).toBe(original.sharedData); // Should be accessible via system label
      expect(nodeProfile.systemData).toBe(original.systemData);
      expect(nodeProfile.userData).toBe(''); // Should be empty (no access - user label only)
      expect(nodeProfile.searchData).toBe(original.searchData); // Should be accessible (search label has network access)
      expect(nodeProfile.customData).toBeUndefined(); // Should be undefined (no access - custom label is user-only)
    });
  });

  describe('Performance and Large Data', () => {
    it('should handle large data efficiently', async () => {
      const largeData = 'x'.repeat(10000); // 10KB of data
      const original = new TestProfile('large-123', largeData, largeData, largeData, largeData);

      const startTime = Date.now();

      // Test encryption
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

      // Test decryption
      const encryptedCompanion = encrypted as unknown as RunarEncryptable<
        TestProfile,
        EncryptedTestProfile
      >;
      const decryptedResult = encryptedCompanion.decryptWithKeystore(
        testEnv.getUserMobileWrapper(),
        logger
      );
      expect(isOk(decryptedResult)).toBe(true);
      if (isErr(decryptedResult)) {
        throw new Error(`Decryption failed: ${decryptedResult.error.message}`);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(1000); // Should complete within 1 second

      const mobileProfile = decryptedResult.value;
      expect(mobileProfile.id).toBe(original.id);
      expect(mobileProfile.privateData).toBe(original.privateData);
      expect(mobileProfile.email).toBe(original.email);
    });
  });
});
