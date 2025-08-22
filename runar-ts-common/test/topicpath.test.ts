/**
 * Comprehensive tests for TopicPath implementation
 * Based on Rust test patterns from runar-node-tests
 * Covers: Basic functionality, wildcards, templates, and edge cases
 */

import { describe, test, expect } from 'bun:test';
import { TopicPath } from '../src/routing/TopicPath';

describe('TopicPath', () => {
  describe('Basic Construction', () => {
    test('should create valid paths', () => {
      // Test with network_id prefix
      const result = TopicPath.new('main:auth/login', 'default');
      expect(result.ok).toBe(true);
      if (result.ok) {
        const path = result.value;
        expect(path.networkId()).toBe('main');
        expect(path.servicePath()).toBe('auth');
        expect(path.getSegments()).toEqual(['auth', 'login']);
        expect(path.asString()).toBe('main:auth/login');
        expect(path.actionPath()).toBe('auth/login');
      }
    });

    test('should create paths without network prefix', () => {
      // Test without network_id (uses default)
      const result = TopicPath.new('auth/login', 'default');
      expect(result.ok).toBe(true);
      if (result.ok) {
        const path = result.value;
        expect(path.networkId()).toBe('default');
        expect(path.servicePath()).toBe('auth');
        expect(path.getSegments()).toEqual(['auth', 'login']);
        expect(path.asString()).toBe('default:auth/login');
        expect(path.actionPath()).toBe('auth/login');
      }
    });

    test('should create service-only paths', () => {
      // Test with just service name
      const result = TopicPath.new('auth', 'default');
      expect(result.ok).toBe(true);
      if (result.ok) {
        const path = result.value;
        expect(path.networkId()).toBe('default');
        expect(path.servicePath()).toBe('auth');
        expect(path.asString()).toBe('default:auth');
        expect(path.actionPath()).toBe('');
        expect(path.getSegments()).toEqual(['auth']);
      }
    });

    test('should handle complex paths with multiple segments', () => {
      const result = TopicPath.new('main:auth/users/details', 'default');
      expect(result.ok).toBe(true);
      if (result.ok) {
        const path = result.value;
        expect(path.networkId()).toBe('main');
        expect(path.servicePath()).toBe('auth');
        expect(path.asString()).toBe('main:auth/users/details');
        expect(path.actionPath()).toBe('auth/users/details');
        expect(path.getSegments()).toEqual(['auth', 'users', 'details']);
      }
    });

    test('should reject invalid paths', () => {
      // Empty path
      const emptyResult = TopicPath.new('', 'default');
      expect(emptyResult.ok).toBe(false);
      if (!emptyResult.ok) {
        expect(emptyResult.error).toContain('must have at least one segment');
      }

      // Multiple colons
      const multiColonResult = TopicPath.new('main:auth:login', 'default');
      expect(multiColonResult.ok).toBe(false);
      if (!multiColonResult.ok) {
        expect(multiColonResult.error).toContain('should be');
      }

      // Empty network ID
      const emptyNetworkResult = TopicPath.new(':auth/login', 'default');
      expect(emptyNetworkResult.ok).toBe(false);
      if (!emptyNetworkResult.ok) {
        expect(emptyNetworkResult.error).toContain('network ID cannot be empty');
      }
    });
  });

  describe('Static Constructors', () => {
    test('newService should create service paths', () => {
      const result = TopicPath.newService('main', 'auth');
      expect(result.ok).toBe(true);
      if (result.ok) {
        const path = result.value;
        expect(path.networkId()).toBe('main');
        expect(path.servicePath()).toBe('auth');
        expect(path.asString()).toBe('main:auth');
        expect(path.actionPath()).toBe('');
        expect(path.getSegments()).toEqual(['auth']);
      }
    });

    test('fromFullPath should parse full paths', () => {
      const result = TopicPath.fromFullPath('main:auth/login');
      expect(result.ok).toBe(true);
      if (result.ok) {
        const path = result.value;
        expect(path.networkId()).toBe('main');
        expect(path.servicePath()).toBe('auth');
        expect(path.actionPath()).toBe('auth/login');
      }
    });

    test('fromFullPath should reject invalid full paths', () => {
      const result = TopicPath.fromFullPath('auth/login'); // Missing colon
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('missing network_id');
      }
    });
  });

  describe('Path Manipulation', () => {
    test('child should create child paths', () => {
      const result = TopicPath.new('main:auth', 'default');
      expect(result.ok).toBe(true);
      if (result.ok) {
        const basePath = result.value;
        const childResult = basePath.child('login');
        expect(childResult.ok).toBe(true);
        if (childResult.ok) {
          const child = childResult.value;
          expect(child.asString()).toBe('main:auth/login');
          expect(child.networkId()).toBe('main');
          expect(child.servicePath()).toBe('auth');
          expect(child.actionPath()).toBe('auth/login');
        }
      }
    });

    test('child should reject invalid segments', () => {
      const result = TopicPath.new('main:auth', 'default');
      expect(result.ok).toBe(true);
      if (result.ok) {
        const basePath = result.value;
        const childResult = basePath.child('invalid/segment');
        expect(childResult.ok).toBe(false);
        if (!childResult.ok) {
          expect(childResult.error).toContain('cannot contain slashes');
        }
      }
    });

    test('parent should create parent paths', () => {
      const result = TopicPath.new('main:auth/users/details', 'default');
      expect(result.ok).toBe(true);
      if (result.ok) {
        const path = result.value;

        // Get parent (one level up)
        const parentResult = path.parentResult();
        expect(parentResult.ok).toBe(true);
        if (parentResult.ok) {
          const parent = parentResult.value;
          expect(parent.asString()).toBe('main:auth/users');
          expect(parent.servicePath()).toBe('auth');
        }

        // Get grandparent (two levels up)
        if (parentResult.ok) {
          const grandparentResult = parentResult.value.parentResult();
          expect(grandparentResult.ok).toBe(true);
          if (grandparentResult.ok) {
            const grandparent = grandparentResult.value;
            expect(grandparent.asString()).toBe('main:auth');
          }
        }
      }
    });

    test('parent should reject root paths', () => {
      const result = TopicPath.new('main:service', 'default');
      expect(result.ok).toBe(true);
      if (result.ok) {
        const servicePath = result.value;
        const parentResult = servicePath.parentResult();
        expect(parentResult.ok).toBe(false);
        if (!parentResult.ok) {
          expect(parentResult.error).toContain('Cannot get parent of root or service-only path');
        }
      }
    });
  });

  describe('Path Analysis', () => {
    test('startsWith should work correctly', () => {
      const pathResult = TopicPath.new('main:auth/users/list', 'default');
      const prefix1Result = TopicPath.new('main:auth', 'default');
      const prefix2Result = TopicPath.new('main:auth/users', 'default');
      const differentNetworkResult = TopicPath.new('other:auth/users', 'default');
      const differentServiceResult = TopicPath.new('main:payments', 'default');

      expect(pathResult.ok).toBe(true);
      expect(prefix1Result.ok).toBe(true);
      expect(prefix2Result.ok).toBe(true);
      expect(differentNetworkResult.ok).toBe(true);
      expect(differentServiceResult.ok).toBe(true);

      if (
        pathResult.ok &&
        prefix1Result.ok &&
        prefix2Result.ok &&
        differentNetworkResult.ok &&
        differentServiceResult.ok
      ) {
        const path = pathResult.value;

        expect(path.startsWith(prefix1Result.value)).toBe(true);
        expect(path.startsWith(prefix2Result.value)).toBe(true);
        expect(path.startsWith(differentNetworkResult.value)).toBe(false);
        expect(path.startsWith(differentServiceResult.value)).toBe(false);
      }
    });

    test('segment analysis methods', () => {
      const result = TopicPath.new('main:service/action', 'default');
      expect(result.ok).toBe(true);
      if (result.ok) {
        const path = result.value;

        // Test service_path vs getSegments consistency
        expect(path.servicePath()).toBe('service');
        expect(path.getSegments()).toEqual(['service', 'action']);
        expect(path.segmentCount()).toBe(2);
        expect(path.segmentCount()).toBe(path.getSegments().length);

        // Test action path
        expect(path.actionPath()).toBe('service/action');
      }
    });
  });

  describe('Action Topic Creation', () => {
    test('newActionTopic should create action topics', () => {
      const serviceResult = TopicPath.new('main:auth', 'default');
      expect(serviceResult.ok).toBe(true);
      if (serviceResult.ok) {
        const servicePath = serviceResult.value;
        const actionResult = servicePath.newActionTopic('login');
        expect(actionResult.ok).toBe(true);
        if (actionResult.ok) {
          const actionPath = actionResult.value;
          expect(actionPath.networkId()).toBe('main');
          expect(actionPath.servicePath()).toBe('auth');
          expect(actionPath.actionPath()).toBe('auth/login');
        }
      }
    });

    test('newActionTopic should reject invalid names', () => {
      const serviceResult = TopicPath.new('main:auth', 'default');
      expect(serviceResult.ok).toBe(true);
      if (serviceResult.ok) {
        const servicePath = serviceResult.value;
        const actionResult = servicePath.newActionTopic('invalid:name');
        expect(actionResult.ok).toBe(false);
        if (!actionResult.ok) {
          expect(actionResult.error).toContain('cannot contain colons');
        }
      }
    });

    test('newActionTopic should reject nested action paths', () => {
      const pathResult = TopicPath.new('main:services/auth', 'default');
      expect(pathResult.ok).toBe(true);
      if (pathResult.ok) {
        const path = pathResult.value;
        const actionResult = path.newActionTopic('verify_token');
        expect(actionResult.ok).toBe(false);
        if (!actionResult.ok) {
          expect(actionResult.error).toContain(
            'cannot create an action path on top of another action path'
          );
        }
      }
    });
  });

  describe('Template and Pattern Support', () => {
    test('should identify patterns and templates', () => {
      const wildcardResult = TopicPath.new('main:services/*/state', 'default');
      const templateResult = TopicPath.new('main:services/{service_path}/state', 'default');
      const literalResult = TopicPath.new('main:services/auth/state', 'default');

      expect(wildcardResult.ok).toBe(true);
      expect(templateResult.ok).toBe(true);
      expect(literalResult.ok).toBe(true);

      if (wildcardResult.ok && templateResult.ok && literalResult.ok) {
        expect(wildcardResult.value.isPattern()).toBe(true);
        expect(templateResult.value.isPattern()).toBe(false); // Template is not a pattern for wildcard matching
        expect(literalResult.value.isPattern()).toBe(false);

        expect(wildcardResult.value.hasTemplates()).toBe(false);
        expect(templateResult.value.hasTemplates()).toBe(true);
        expect(literalResult.value.hasTemplates()).toBe(false);
      }
    });

    test('fromTemplate should create paths with parameters', () => {
      const params = new Map<string, string>();
      params.set('service_path', 'math');
      params.set('action', 'add');

      const result = TopicPath.fromTemplate('services/{service_path}/{action}', params, 'main');
      expect(result.ok).toBe(true);
      if (result.ok) {
        const path = result.value;
        expect(path.asString()).toBe('main:services/math/add');
        expect(path.networkId()).toBe('main');
        expect(path.servicePath()).toBe('services');
      }
    });

    test('fromTemplate should handle missing parameters', () => {
      const params = new Map<string, string>();
      params.set('service_path', 'math');
      // Missing 'action' parameter

      const result = TopicPath.fromTemplate('services/{service_path}/{action}', params, 'main');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Missing parameter value for 'action'");
      }
    });
  });

  describe('Path Matching', () => {
    test('matches should work with exact paths', () => {
      const path1Result = TopicPath.new('main:auth/login', 'default');
      const path2Result = TopicPath.new('main:auth/login', 'default');
      const differentPathResult = TopicPath.new('main:auth/logout', 'default');

      expect(path1Result.ok).toBe(true);
      expect(path2Result.ok).toBe(true);
      expect(differentPathResult.ok).toBe(true);

      if (path1Result.ok && path2Result.ok && differentPathResult.ok) {
        expect(path1Result.value.matches(path2Result.value)).toBe(true);
        expect(path1Result.value.matches(differentPathResult.value)).toBe(false);
      }
    });

    test('matches should work with wildcards', () => {
      const patternResult = TopicPath.new('main:services/*/state', 'default');
      const matchingPathResult = TopicPath.new('main:services/math/state', 'default');
      const nonMatchingPathResult = TopicPath.new('main:services/math/config', 'default');

      expect(patternResult.ok).toBe(true);
      expect(matchingPathResult.ok).toBe(true);
      expect(nonMatchingPathResult.ok).toBe(true);

      if (patternResult.ok && matchingPathResult.ok && nonMatchingPathResult.ok) {
        expect(matchingPathResult.value.matches(patternResult.value)).toBe(true);
        expect(nonMatchingPathResult.value.matches(patternResult.value)).toBe(false);
      }
    });

    test('matches should work with templates', () => {
      const templateResult = TopicPath.new('main:services/{service}/events', 'default');
      const concreteResult = TopicPath.new('main:services/math/events', 'default');

      expect(templateResult.ok).toBe(true);
      expect(concreteResult.ok).toBe(true);

      if (templateResult.ok && concreteResult.ok) {
        // Concrete path should match template
        expect(concreteResult.value.matches(templateResult.value)).toBe(true);
        // Template should NOT match concrete (directional)
        expect(templateResult.value.matches(concreteResult.value)).toBe(false);
      }
    });

    test('matches should respect network isolation', () => {
      const path1Result = TopicPath.new('network1:services/math/state', 'default');
      const path2Result = TopicPath.new('network2:services/math/state', 'default');

      expect(path1Result.ok).toBe(true);
      expect(path2Result.ok).toBe(true);

      if (path1Result.ok && path2Result.ok) {
        expect(path1Result.value.matches(path2Result.value)).toBe(false);
      }
    });
  });

  describe('Parameter Extraction', () => {
    test('extractParams should extract template parameters', () => {
      const pathResult = TopicPath.new('main:services/math/actions/add', 'default');
      expect(pathResult.ok).toBe(true);
      if (pathResult.ok) {
        const path = pathResult.value;
        const template = 'services/{service_path}/actions/{action}';

        const paramsResult = path.extractParams(template);
        expect(paramsResult.ok).toBe(true);
        if (paramsResult.ok) {
          const params = paramsResult.value;
          expect(params.get('service_path')).toBe('math');
          expect(params.get('action')).toBe('add');
        }
      }
    });

    test('extractParams should handle missing templates gracefully', () => {
      const pathResult = TopicPath.new('main:services/math/actions/add', 'default');
      expect(pathResult.ok).toBe(true);
      if (pathResult.ok) {
        const path = pathResult.value;
        const wrongTemplate = 'users/{user_id}/profile';

        const paramsResult = path.extractParams(wrongTemplate);
        expect(paramsResult.ok).toBe(false);
        if (!paramsResult.ok) {
          expect(paramsResult.error).toContain('segment count');
        }
      }
    });

    test('matchesTemplate should work correctly', () => {
      const pathResult = TopicPath.new('main:services/math/state', 'default');
      expect(pathResult.ok).toBe(true);
      if (pathResult.ok) {
        const path = pathResult.value;

        expect(path.matchesTemplate('services/{service_path}/state')).toBe(true);
        expect(path.matchesTemplate('services/{service_path}/config')).toBe(false);
        expect(path.matchesTemplate('users/{user_id}/profile')).toBe(false);
      }
    });
  });

  describe('Error Handling', () => {
    test('all methods should return Result types', () => {
      // This is more of a TypeScript compilation test, but we can verify
      // that methods that should fail actually do fail appropriately
      const result = TopicPath.new('', 'default');
      expect(result.ok).toBe(false);

      if (!result.ok) {
        expect(typeof result.error).toBe('string');
        expect(result.error.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Edge Cases', () => {
    test('should handle unusual but valid paths', () => {
      // Network ID with special characters
      const path1Result = TopicPath.new('test-network_01:service', 'fallback');
      expect(path1Result.ok).toBe(true);
      if (path1Result.ok) {
        expect(path1Result.value.networkId()).toBe('test-network_01');
      }

      // Service path with special characters
      const path2Result = TopicPath.new('main:my-service_01', 'default');
      expect(path2Result.ok).toBe(true);
      if (path2Result.ok) {
        expect(path2Result.value.servicePath()).toBe('my-service_01');
      }

      // Long paths with many segments
      const path3Result = TopicPath.new('main:service/a/b/c/d/e/f', 'default');
      expect(path3Result.ok).toBe(true);
      if (path3Result.ok) {
        expect(path3Result.value.getSegments()).toEqual(['service', 'a', 'b', 'c', 'd', 'e', 'f']);
        expect(path3Result.value.actionPath()).toBe('service/a/b/c/d/e/f');
      }
    });

    test('test_default helper should work', () => {
      const path = TopicPath.test_default('auth/login');
      expect(path.networkId()).toBe('default');
      expect(path.servicePath()).toBe('auth');
      expect(path.actionPath()).toBe('auth/login');
      expect(path.asString()).toBe('default:auth/login');
    });
  });
});
