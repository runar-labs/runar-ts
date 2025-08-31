import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  LabelResolver,
  createContextLabelResolver,
  LabelKeyword,
  LabelResolverConfig,
  LabelValue,
} from '../src/label_resolver.js';

describe('LabelResolver', () => {
  describe('createContextLabelResolver', () => {
    it('should create resolver with system and user labels', () => {
      // Create a simple label resolver config
      const config: LabelResolverConfig = {
        labelMappings: new Map([
          [
            'system',
            {
              networkPublicKey: new Uint8Array([1, 2, 3, 4]),
              userKeySpec: undefined,
            },
          ],
          [
            'current_user',
            {
              networkPublicKey: new Uint8Array([5, 6, 7, 8]),
              userKeySpec: LabelKeyword.CurrentUser,
            },
          ],
        ]),
      };

      // Test validation
      const validationResult = LabelResolver.validateLabelConfig(config);
      assert(validationResult.ok, 'Config validation should pass');

      // Test resolver creation without user context (empty profile keys)
      const emptyProfileKeys: Uint8Array[] = [];
      const resolverResult = createContextLabelResolver(config, emptyProfileKeys);
      assert(resolverResult.ok, 'Resolver creation should succeed');
      
      const resolver = resolverResult.value;
      assert(resolver.canResolve('system'), 'Should resolve system label');
      assert(resolver.canResolve('current_user'), 'Should resolve current_user label');

      // Test resolver creation with user context
      const userKeys = [
        new Uint8Array([10, 11, 12]),
        new Uint8Array([13, 14, 15]),
      ];
      const resolverWithUserResult = createContextLabelResolver(config, userKeys);
      assert(resolverWithUserResult.ok, 'Resolver creation with user keys should succeed');

      const resolverWithUser = resolverWithUserResult.value;

      // Verify current_user label gets user keys
      const currentUserInfoResult = resolverWithUser.resolveLabelInfo('current_user');
      assert(currentUserInfoResult.ok, 'Should resolve current_user label info');
      
      const currentUserInfo = currentUserInfoResult.value;
      assert(currentUserInfo, 'current_user info should exist');
      assert.deepStrictEqual(
        currentUserInfo.profilePublicKeys,
        userKeys,
        'current_user should have user profile keys'
      );
    });

    it('should validate label resolver configuration', () => {
      // Test empty config (should fail)
      const emptyConfig: LabelResolverConfig = {
        labelMappings: new Map(),
      };
      const emptyValidationResult = LabelResolver.validateLabelConfig(emptyConfig);
      assert(!emptyValidationResult.ok, 'Empty config validation should fail');
      assert(
        emptyValidationResult.error.message.includes('at least one label mapping'),
        'Should have appropriate error message'
      );

      // Test invalid label with neither network key nor user spec (should fail)
      const invalidConfig: LabelResolverConfig = {
        labelMappings: new Map([
          [
            'invalid',
            {
              networkPublicKey: undefined,
              userKeySpec: undefined,
            },
          ],
        ]),
      };
      const invalidValidationResult = LabelResolver.validateLabelConfig(invalidConfig);
      assert(!invalidValidationResult.ok, 'Invalid config validation should fail');
      assert(
        invalidValidationResult.error.message.includes('must specify either network_public_key or user_key_spec'),
        'Should have appropriate error message'
      );

      // Test valid user-only label
      const validUserOnlyConfig: LabelResolverConfig = {
        labelMappings: new Map([
          [
            'user_only',
            {
              networkPublicKey: undefined,
              userKeySpec: LabelKeyword.CurrentUser,
            },
          ],
        ]),
      };
      const validUserOnlyValidationResult = LabelResolver.validateLabelConfig(validUserOnlyConfig);
      assert(validUserOnlyValidationResult.ok, 'Valid user-only config validation should pass');
    });

    it('should handle user-only labels correctly', () => {
      const config: LabelResolverConfig = {
        labelMappings: new Map([
          [
            'user_only',
            {
              networkPublicKey: undefined,
              userKeySpec: LabelKeyword.CurrentUser,
            },
          ],
        ]),
      };

      const userKeys = [new Uint8Array([1, 2, 3])];
      const resolverResult = createContextLabelResolver(config, userKeys);
      assert(resolverResult.ok, 'User-only resolver creation should succeed');

      const resolver = resolverResult.value;
      const userOnlyInfoResult = resolver.resolveLabelInfo('user_only');
      assert(userOnlyInfoResult.ok, 'Should resolve user_only label info');

      const userOnlyInfo = userOnlyInfoResult.value;
      assert(userOnlyInfo, 'user_only info should exist');
      assert(!userOnlyInfo.networkPublicKey, 'user_only should not have network public key');
      assert.deepStrictEqual(
        userOnlyInfo.profilePublicKeys,
        userKeys,
        'user_only should have user profile keys'
      );
    });

    it('should handle network-only labels correctly', () => {
      const config: LabelResolverConfig = {
        labelMappings: new Map([
          [
            'network_only',
            {
              networkPublicKey: new Uint8Array([1, 2, 3, 4]),
              userKeySpec: undefined,
            },
          ],
        ]),
      };

      const emptyProfileKeys: Uint8Array[] = [];
      const resolverResult = createContextLabelResolver(config, emptyProfileKeys);
      assert(resolverResult.ok, 'Network-only resolver creation should succeed');

      const resolver = resolverResult.value;
      const networkOnlyInfoResult = resolver.resolveLabelInfo('network_only');
      assert(networkOnlyInfoResult.ok, 'Should resolve network_only label info');

      const networkOnlyInfo = networkOnlyInfoResult.value;
      assert(networkOnlyInfo, 'network_only info should exist');
      assert(networkOnlyInfo.networkPublicKey, 'network_only should have network public key');
      assert.deepStrictEqual(
        networkOnlyInfo.profilePublicKeys,
        [],
        'network_only should have empty profile keys'
      );
    });

    it('should handle mixed labels correctly', () => {
      const config: LabelResolverConfig = {
        labelMappings: new Map([
          [
            'mixed',
            {
              networkPublicKey: new Uint8Array([1, 2, 3, 4]),
              userKeySpec: LabelKeyword.CurrentUser,
            },
          ],
        ]),
      };

      const userKeys = [new Uint8Array([5, 6, 7])];
      const resolverResult = createContextLabelResolver(config, userKeys);
      assert(resolverResult.ok, 'Mixed resolver creation should succeed');

      const resolver = resolverResult.value;
      const mixedInfoResult = resolver.resolveLabelInfo('mixed');
      assert(mixedInfoResult.ok, 'Should resolve mixed label info');

      const mixedInfo = mixedInfoResult.value;
      assert(mixedInfo, 'mixed info should exist');
      assert(mixedInfo.networkPublicKey, 'mixed should have network public key');
      assert.deepStrictEqual(
        mixedInfo.profilePublicKeys,
        userKeys,
        'mixed should have user profile keys'
      );
    });
  });

  describe('LabelResolver instance methods', () => {
    it('should resolve label info correctly', () => {
      const config: LabelResolverConfig = {
        labelMappings: new Map([
          [
            'test_label',
            {
              networkPublicKey: new Uint8Array([1, 2, 3]),
              userKeySpec: LabelKeyword.CurrentUser,
            },
          ],
        ]),
      };

      const userKeys = [new Uint8Array([4, 5, 6])];
      const resolverResult = createContextLabelResolver(config, userKeys);
      assert(resolverResult.ok, 'Resolver creation should succeed');

      const resolver = resolverResult.value;

      // Test resolveLabelInfo
      const infoResult = resolver.resolveLabelInfo('test_label');
      assert(infoResult.ok, 'Should resolve label info');
      
      const info = infoResult.value;
      assert(info, 'Label info should exist');
      assert.deepStrictEqual(
        info.networkPublicKey,
        new Uint8Array([1, 2, 3]),
        'Network public key should match'
      );
      assert.deepStrictEqual(
        info.profilePublicKeys,
        userKeys,
        'Profile public keys should match'
      );

      // Test non-existent label
      const nonExistentResult = resolver.resolveLabelInfo('non_existent');
      assert(nonExistentResult.ok, 'Should return ok for non-existent label');
      assert(!nonExistentResult.value, 'Non-existent label should return undefined');
    });

    it('should check label resolution correctly', () => {
      const config: LabelResolverConfig = {
        labelMappings: new Map([
          [
            'existing_label',
            {
              networkPublicKey: new Uint8Array([1, 2, 3]),
              userKeySpec: undefined,
            },
          ],
        ]),
      };

      const resolverResult = createContextLabelResolver(config, []);
      assert(resolverResult.ok, 'Resolver creation should succeed');

      const resolver = resolverResult.value;

      // Test canResolve
      assert(resolver.canResolve('existing_label'), 'Should resolve existing label');
      assert(!resolver.canResolve('non_existent'), 'Should not resolve non-existent label');
    });

    it('should return available labels correctly', () => {
      const config: LabelResolverConfig = {
        labelMappings: new Map([
          [
            'label1',
            {
              networkPublicKey: new Uint8Array([1, 2, 3]),
              userKeySpec: undefined,
            },
          ],
          [
            'label2',
            {
              networkPublicKey: undefined,
              userKeySpec: LabelKeyword.CurrentUser,
            },
          ],
        ]),
      };

      const userKeys = [new Uint8Array([4, 5, 6])]; // Need user keys for CurrentUser label
      const resolverResult = createContextLabelResolver(config, userKeys);
      assert(resolverResult.ok, 'Resolver creation should succeed');

      const resolver = resolverResult.value;

      // Test availableLabels
      const availableLabels = resolver.availableLabels();
      assert.deepStrictEqual(
        availableLabels.sort(),
        ['label1', 'label2'].sort(),
        'Available labels should match'
      );
    });
  });

  describe('Error handling', () => {
    it('should handle empty network public key correctly', () => {
      const config: LabelResolverConfig = {
        labelMappings: new Map([
          [
            'empty_network',
            {
              networkPublicKey: new Uint8Array(), // Empty array
              userKeySpec: undefined,
            },
          ],
        ]),
      };

      const resolverResult = createContextLabelResolver(config, []);
      assert(!resolverResult.ok, 'Resolver creation should fail with empty network key');
      assert(
        resolverResult.error.message.includes('must specify either network_public_key or user_key_spec'),
        'Should have appropriate error message'
      );
    });

    it('should handle label with no keys correctly', () => {
      const config: LabelResolverConfig = {
        labelMappings: new Map([
          [
            'no_keys',
            {
              networkPublicKey: undefined,
              userKeySpec: undefined,
            },
          ],
        ]),
      };

      const resolverResult = createContextLabelResolver(config, []);
      assert(!resolverResult.ok, 'Resolver creation should fail with no keys');
      assert(
        resolverResult.error.message.includes('must specify either network_public_key or user_key_spec'),
        'Should have appropriate error message'
      );
    });
  });
});
