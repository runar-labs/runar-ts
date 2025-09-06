import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { type RunarEncryptable } from '../src/index';
import { 
  TestProfile, 
  AdvancedTestProfile, 
  NestedEncryptedProfile, 
  ComplexPriorityProfile 
} from '../test_fixtures/dist/test_fixtures/test_fixtures';
import type { 
  EncryptedTestProfile, 
  EncryptedAdvancedTestProfile, 
  EncryptedNestedEncryptedProfile, 
  EncryptedComplexPriorityProfile 
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
        console.log(`Encryption failed: ${encryptResult.error.message}`);
        console.log(`Error details:`, encryptResult.error);
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
      
      const original = new NestedEncryptedProfile(
        'parent-123',
        nestedProfile,
        'parent metadata'
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
      expect(encrypted.system_encrypted).toBeDefined();

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
      expect(mobileProfile.metadata).toBe(''); // Should be empty (no access to system field)
      
      // Verify nested profile is decrypted correctly
      console.log('mobileProfile.profile:', mobileProfile.profile);
      expect(mobileProfile.profile).toBeDefined();
      if (mobileProfile.profile) {
        // The nested profile should be an encrypted companion object
        expect(mobileProfile.profile.id).toBe(nestedProfile.id);
        
        // Access encrypted fields using proper type
        const encryptedNestedProfile = mobileProfile.profile as unknown as EncryptedTestProfile;
        expect(encryptedNestedProfile.user_encrypted).toBeDefined();
        expect(encryptedNestedProfile.search_encrypted).toBeDefined();
        expect(encryptedNestedProfile.system_encrypted).toBeDefined();
        expect(encryptedNestedProfile.system_only_encrypted).toBeDefined();
        
        // The nested profile is stored as a plain object with encrypted fields
        // We need to manually decrypt it using the label group decryption
        
        // Since the nested object is stored as a plain object with encrypted fields,
        // we need to manually decrypt each field group
        const decryptedNestedProfile = new TestProfile('', '', '', '', '');
        decryptedNestedProfile.id = encryptedNestedProfile.id;
        
        // Decrypt user fields using decryptLabelGroupSync
        if (encryptedNestedProfile.user_encrypted) {
          const userDecryptResult = require('runar-ts-serializer/src/encryption').decryptLabelGroupSync(
            encryptedNestedProfile.user_encrypted,
            testEnv.getUserMobileWrapper(),
            logger
          );
          if (userDecryptResult.ok) {
            const userFields = userDecryptResult.value as Record<string, unknown>;
            decryptedNestedProfile.privateData = userFields.privateData as string || '';
          }
        }
        
        // Decrypt search fields using decryptLabelGroupSync
        if (encryptedNestedProfile.search_encrypted) {
          const searchDecryptResult = require('runar-ts-serializer/src/encryption').decryptLabelGroupSync(
            encryptedNestedProfile.search_encrypted,
            testEnv.getUserMobileWrapper(),
            logger
          );
          if (searchDecryptResult.ok) {
            const searchFields = searchDecryptResult.value as Record<string, unknown>;
            decryptedNestedProfile.email = searchFields.email as string || '';
          }
        }
        
        // Verify the decrypted nested profile
        expect(decryptedNestedProfile.id).toBe(nestedProfile.id);
        expect(decryptedNestedProfile.name).toBe(''); // Should be empty (no access to system field)
        expect(decryptedNestedProfile.privateData).toBe(nestedProfile.privateData);
        expect(decryptedNestedProfile.email).toBe(nestedProfile.email);
        expect(decryptedNestedProfile.systemMetadata).toBe(''); // Should be empty (no access)
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

      // Test decryption with null keystore (should handle gracefully)
      const encryptedCompanion = encrypted as unknown as RunarEncryptable<
        TestProfile,
        EncryptedTestProfile
      >;
      const decryptedResult = encryptedCompanion.decryptWithKeystore(
        null as any,
        logger
      );
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
      (encrypted as EncryptedTestProfile).user_encrypted = 'corrupted data' as unknown as EncryptedLabelGroup;

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
      const original = new TestProfile(
        'large-123',
        largeData,
        largeData,
        largeData,
        largeData
      );

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

      console.log(`   📈 Large data encryption/decryption completed in ${duration}ms`);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second

      const mobileProfile = decryptedResult.value;
      expect(mobileProfile.id).toBe(original.id);
      expect(mobileProfile.privateData).toBe(original.privateData);
      expect(mobileProfile.email).toBe(original.email);
    });
  });
});
