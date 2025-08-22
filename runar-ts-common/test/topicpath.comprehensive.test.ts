/**
 * Comprehensive TopicPath tests matching Rust test coverage
 * Based on topic_path_test.rs, topic_path_wildcard_test.rs, topic_path_template_test.rs
 */

import { describe, test, expect } from 'bun:test';
import { TopicPath } from '../src/routing/TopicPath';

describe('TopicPath Comprehensive Tests (Rust Compatibility)', () => {
  describe('Basic Construction (from topic_path_test.rs)', () => {
    test('should create paths with network_id prefix', () => {
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

    test('should create paths without network_id (uses default)', () => {
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
      const result = TopicPath.new('auth', 'default');
      expect(result.ok).toBe(true);
      if (result.ok) {
        const path = result.value;
        expect(path.networkId()).toBe('default');
        expect(path.servicePath()).toBe('auth');
        expect(path.asString()).toBe('default:auth');
        expect(path.actionPath()).toBe('');
      }
    });

    test('should create paths with multiple path segments', () => {
      const result = TopicPath.new('main:auth/users/details', 'default');
      expect(result.ok).toBe(true);
      if (result.ok) {
        const path = result.value;
        expect(path.networkId()).toBe('main');
        expect(path.servicePath()).toBe('auth');
        expect(path.asString()).toBe('main:auth/users/details');
        expect(path.actionPath()).toBe('auth/users/details');
      }
    });

    test('should reject invalid paths - empty path', () => {
      const result = TopicPath.new('', 'default');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('must have at least one segment');
      }
    });

    test('should reject invalid paths - multiple colons', () => {
      const result = TopicPath.new('main:auth:login', 'default');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('should be');
      }
    });

    test('should reject invalid paths - empty network ID', () => {
      const result = TopicPath.new(':auth/login', 'default');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Network ID cannot be empty');
      }
    });
  });

  describe('Static Constructors', () => {
    test('newService should create service-only paths', () => {
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
      const result = TopicPath.fromFullPath('auth/login');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('missing network_id');
      }
    });

    test('test_default helper should work', () => {
      const result = TopicPath.test_default('auth/login');
      expect(result.ok).toBe(true);
      if (result.ok) {
        const path = result.value;
        expect(path.networkId()).toBe('default');
        expect(path.servicePath()).toBe('auth');
        expect(path.actionPath()).toBe('auth/login');
        expect(path.asString()).toBe('default:auth/login');
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

    test('child should create nested child paths', () => {
      const result = TopicPath.new('main:auth', 'default');
      expect(result.ok).toBe(true);
      if (result.ok) {
        const basePath = result.value;
        const childResult = basePath.child('login');
        expect(childResult.ok).toBe(true);
        if (childResult.ok) {
          const nestedResult = childResult.value.child('advanced');
          expect(nestedResult.ok).toBe(true);
          if (nestedResult.ok) {
            const nested = nestedResult.value;
            expect(nested.asString()).toBe('main:auth/login/advanced');
          }
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

        const parentResult = path.parentResult();
        expect(parentResult.ok).toBe(true);
        if (parentResult.ok) {
          const parent = parentResult.value;
          expect(parent.asString()).toBe('main:auth/users');
          expect(parent.servicePath()).toBe('auth');
        }

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

    test('parent should reject root or service-only paths', () => {
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

    test('newActionTopic should reject invalid action names', () => {
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

    test('newEventTopic should create event topics', () => {
      const serviceResult = TopicPath.new('main:auth', 'default');
      expect(serviceResult.ok).toBe(true);
      if (serviceResult.ok) {
        const servicePath = serviceResult.value;
        const eventResult = servicePath.newEventTopic('user_logged_in');
        expect(eventResult.ok).toBe(true);
        if (eventResult.ok) {
          const eventPath = eventResult.value;
          expect(eventPath.networkId()).toBe('main');
          expect(eventPath.servicePath()).toBe('auth');
          expect(eventPath.actionPath()).toBe('auth/user_logged_in');
        }
      }
    });

    test('newEventTopic should preserve default network ID', () => {
      const serviceResult = TopicPath.new('auth', 'test-network');
      expect(serviceResult.ok).toBe(true);
      if (serviceResult.ok) {
        const servicePath = serviceResult.value;
        const eventResult = servicePath.newEventTopic('user_logged_in');
        expect(eventResult.ok).toBe(true);
        if (eventResult.ok) {
          const eventPath = eventResult.value;
          expect(eventPath.networkId()).toBe('test-network');
          expect(eventPath.servicePath()).toBe('auth');
          expect(eventPath.actionPath()).toBe('auth/user_logged_in');
        }
      }
    });

    test('newEventTopic should reject invalid event names', () => {
      const serviceResult = TopicPath.new('main:auth', 'default');
      expect(serviceResult.ok).toBe(true);
      if (serviceResult.ok) {
        const servicePath = serviceResult.value;
        const eventResult = servicePath.newEventTopic('invalid:name');
        expect(eventResult.ok).toBe(false);
        if (!eventResult.ok) {
          expect(eventResult.error).toContain('cannot contain colons');
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

    test('segment analysis methods should work', () => {
      const result = TopicPath.new('main:service/action', 'default');
      expect(result.ok).toBe(true);
      if (result.ok) {
        const path = result.value;
        expect(path.servicePath()).toBe('service');
        expect(path.getSegments()).toEqual(['service', 'action']);
        expect(path.getSegments().length).toBe(2);
        expect(path.actionPath()).toBe('service/action');
      }
    });

    test('method consistency should be maintained', () => {
      const result = TopicPath.new('main:service/action', 'default');
      expect(result.ok).toBe(true);
      if (result.ok) {
        const path = result.value;
        expect(path.servicePath()).toBe('service');
        expect(path.getSegments()).toEqual(['service', 'action']);
        expect(path.actionPath()).toBe('service/action');
      }
    });

    test('should handle unusual but valid paths', () => {
      const path1Result = TopicPath.new('test-network_01:service', 'fallback');
      expect(path1Result.ok).toBe(true);
      if (path1Result.ok) {
        expect(path1Result.value.networkId()).toBe('test-network_01');
        expect(path1Result.value.servicePath()).toBe('service');
      }

      const path2Result = TopicPath.new('main:my-service_01', 'default');
      expect(path2Result.ok).toBe(true);
      if (path2Result.ok) {
        expect(path2Result.value.servicePath()).toBe('my-service_01');
      }

      const path3Result = TopicPath.new('main:service/a/b/c/d/e/f', 'default');
      expect(path3Result.ok).toBe(true);
      if (path3Result.ok) {
        expect(path3Result.value.getSegments()).toEqual(['service', 'a', 'b', 'c', 'd', 'e', 'f']);
        expect(path3Result.value.actionPath()).toBe('service/a/b/c/d/e/f');
      }
    });
  });

  // Pattern Detection (from topic_path_wildcard_test.rs)
  describe('Pattern Detection', () => {
    test('isPattern should identify patterns correctly', () => {
      const literalResult = TopicPath.new('main:services/auth/login', 'default');
      expect(literalResult.ok).toBe(true);

      if (literalResult.ok) {
        expect(literalResult.value.isPattern()).toBe(false);
      }
    });

    test('isPattern should identify single-segment wildcards', () => {
      const wildcardResult = TopicPath.new('main:services/*/login', 'default');
      expect(wildcardResult.ok).toBe(true);

      if (wildcardResult.ok) {
        expect(wildcardResult.value.isPattern()).toBe(true);
      }
    });

    test('isPattern should identify multi-segment wildcards', () => {
      const multiWildcardResult = TopicPath.new('main:services/>', 'default');
      expect(multiWildcardResult.ok).toBe(true);

      if (multiWildcardResult.ok) {
        expect(multiWildcardResult.value.isPattern()).toBe(true);
        expect(multiWildcardResult.value.hasMultiWildcard()).toBe(true);
      }
    });

    test('hasMultiWildcard should work correctly', () => {
      const literalResult = TopicPath.new('main:services/auth/login', 'default');
      const singleWildcardResult = TopicPath.new('main:services/*/login', 'default');
      const multiWildcardResult = TopicPath.new('main:services/>', 'default');

      expect(literalResult.ok).toBe(true);
      expect(singleWildcardResult.ok).toBe(true);
      expect(multiWildcardResult.ok).toBe(true);

      if (literalResult.ok && singleWildcardResult.ok && multiWildcardResult.ok) {
        expect(literalResult.value.hasMultiWildcard()).toBe(false);
        expect(singleWildcardResult.value.hasMultiWildcard()).toBe(false);
        expect(multiWildcardResult.value.hasMultiWildcard()).toBe(true);
      }
    });

    test('multi-wildcard position rules should be enforced', () => {
      const invalidResult = TopicPath.new('main:services/>/state', 'default');
      expect(invalidResult.ok).toBe(false);
      if (!invalidResult.ok) {
        expect(invalidResult.error).toContain(
          'Multi-segment wildcard (>) must be the last segment'
        );
      }

      const validResult = TopicPath.new('main:services/>', 'default');
      expect(validResult.ok).toBe(true);
      if (validResult.ok) {
        expect(validResult.value.isPattern()).toBe(true);
        expect(validResult.value.hasMultiWildcard()).toBe(true);
      }
    });
  });

  // Wildcard Pattern Matching (from topic_path_wildcard_test.rs)
  describe('Wildcard Pattern Matching', () => {
    test('should match single-segment wildcard patterns', () => {
      const patternResult = TopicPath.new('main:services/*/state', 'default');
      expect(patternResult.ok).toBe(true);

      if (patternResult.ok) {
        const pattern = patternResult.value;

        const matchingPaths = ['main:services/auth/state', 'main:services/math/state'];

        const nonMatchingPaths = [
          'main:services/auth/login',
          'main:services/auth/state/active',
          'main:events/user/created',
        ];

        for (const pathStr of matchingPaths) {
          const pathResult = TopicPath.new(pathStr, 'default');
          expect(pathResult.ok).toBe(true);
          if (pathResult.ok) {
            expect(pathResult.value.matches(pattern)).toBe(true);
          }
        }

        for (const pathStr of nonMatchingPaths) {
          const pathResult = TopicPath.new(pathStr, 'default');
          expect(pathResult.ok).toBe(true);
          if (pathResult.ok) {
            expect(pathResult.value.matches(pattern)).toBe(false);
          }
        }
      }
    });

    test('should match multi-segment wildcard patterns', () => {
      const patternResult = TopicPath.new('main:services/>', 'default');
      expect(patternResult.ok).toBe(true);

      if (patternResult.ok) {
        const pattern = patternResult.value;

        const matchingPaths = [
          'main:services/auth',
          'main:services/auth/login',
          'main:services/math/add/numbers',
        ];

        const nonMatchingPath = 'main:events/user/created';

        for (const pathStr of matchingPaths) {
          const pathResult = TopicPath.new(pathStr, 'default');
          expect(pathResult.ok).toBe(true);
          if (pathResult.ok) {
            expect(pathResult.value.matches(pattern)).toBe(true);
          }
        }

        const nonMatchingResult = TopicPath.new(nonMatchingPath, 'default');
        expect(nonMatchingResult.ok).toBe(true);
        if (nonMatchingResult.ok) {
          expect(nonMatchingResult.value.matches(pattern)).toBe(false);
        }
      }
    });

    test('should handle complex patterns with both wildcard types', () => {
      const patternResult = TopicPath.new('main:services/*/events/>', 'default');
      expect(patternResult.ok).toBe(true);

      if (patternResult.ok) {
        const pattern = patternResult.value;

        const matchingPaths = [
          'main:services/auth/events/user/login',
          'main:services/math/events/calculation/completed',
        ];

        const nonMatchingPaths = ['main:services/auth/state', 'main:services/auth/logs/error'];

        for (const pathStr of matchingPaths) {
          const pathResult = TopicPath.new(pathStr, 'default');
          expect(pathResult.ok).toBe(true);
          if (pathResult.ok) {
            expect(pathResult.value.matches(pattern)).toBe(true);
          }
        }

        for (const pathStr of nonMatchingPaths) {
          const pathResult = TopicPath.new(pathStr, 'default');
          expect(pathResult.ok).toBe(true);
          if (pathResult.ok) {
            expect(pathResult.value.matches(pattern)).toBe(false);
          }
        }
      }
    });

    test('should handle wildcard at beginning of path', () => {
      const patternResult = TopicPath.new('main:*/state', 'default');
      expect(patternResult.ok).toBe(true);

      if (patternResult.ok) {
        const pattern = patternResult.value;

        const matchingPaths = ['main:auth/state', 'main:math/state'];

        const nonMatchingPath = 'main:auth/login';

        for (const pathStr of matchingPaths) {
          const pathResult = TopicPath.new(pathStr, 'default');
          expect(pathResult.ok).toBe(true);
          if (pathResult.ok) {
            expect(pathResult.value.matches(pattern)).toBe(true);
          }
        }

        const nonMatchingResult = TopicPath.new(nonMatchingPath, 'default');
        expect(nonMatchingResult.ok).toBe(true);
        if (nonMatchingResult.ok) {
          expect(nonMatchingResult.value.matches(pattern)).toBe(false);
        }
      }
    });

    test('should isolate patterns by network', () => {
      const patternResult = TopicPath.new('main:services/*/state', 'default');
      const path1Result = TopicPath.new('main:services/auth/state', 'default');
      const path2Result = TopicPath.new('other:services/auth/state', 'default');

      expect(patternResult.ok).toBe(true);
      expect(path1Result.ok).toBe(true);
      expect(path2Result.ok).toBe(true);

      if (patternResult.ok && path1Result.ok && path2Result.ok) {
        expect(path1Result.value.matches(patternResult.value)).toBe(true); // Same network
        expect(path2Result.value.matches(patternResult.value)).toBe(false); // Different network
      }
    });
  });

  // Template Parameter Support (from topic_path_template_test.rs)
  describe('Template Parameter Support', () => {
    test('should identify paths with templates', () => {
      const literalResult = TopicPath.new('main:services/auth/login', 'default');
      const templateResult = TopicPath.new('main:services/{service_path}/state', 'default');

      expect(literalResult.ok).toBe(true);
      expect(templateResult.ok).toBe(true);

      if (literalResult.ok && templateResult.ok) {
        expect(literalResult.value.hasTemplates()).toBe(false);
        expect(templateResult.value.hasTemplates()).toBe(true);
      }
    });

    test('should identify paths with templates at different positions', () => {
      const templateAtBeginningResult = TopicPath.new('main:{service}/actions/list', 'default');
      const templateAtEndResult = TopicPath.new('main:services/actions/{name}', 'default');
      const templateInMiddleResult = TopicPath.new('main:{service}/{action}/{id}', 'default');

      expect(templateAtBeginningResult.ok).toBe(true);
      expect(templateAtEndResult.ok).toBe(true);
      expect(templateInMiddleResult.ok).toBe(true);

      if (templateAtBeginningResult.ok && templateAtEndResult.ok && templateInMiddleResult.ok) {
        expect(templateAtBeginningResult.value.hasTemplates()).toBe(true);
        expect(templateAtEndResult.value.hasTemplates()).toBe(true);
        expect(templateInMiddleResult.value.hasTemplates()).toBe(true);
      }
    });

    test('should handle empty parameter names', () => {
      const pathResult = TopicPath.new('main:services/{}/state', 'default');
      expect(pathResult.ok).toBe(true);
      if (pathResult.ok) {
        expect(pathResult.value.hasTemplates()).toBe(true);
      }
    });
  });

  // Template Parameter Extraction (from topic_path_template_test.rs)
  describe('Template Parameter Extraction', () => {
    test('should extract parameters from template patterns', () => {
      const pathResult = TopicPath.new('services/math/state', 'main');
      expect(pathResult.ok).toBe(true);

      if (pathResult.ok) {
        const path = pathResult.value;
        const paramsResult = path.extractParams('services/{service_path}/state');
        expect(paramsResult.ok).toBe(true);
        if (paramsResult.ok) {
          const params = paramsResult.value;
          expect(params.get('service_path')).toBe('math');
        }
      }
    });

    test('should extract parameters with multiple template parameters', () => {
      const pathResult = TopicPath.new('main:services/math/actions/add', 'default');
      expect(pathResult.ok).toBe(true);

      if (pathResult.ok) {
        const path = pathResult.value;
        const paramsResult = path.extractParams('services/{service_path}/actions/{action}');
        expect(paramsResult.ok).toBe(true);
        if (paramsResult.ok) {
          const params = paramsResult.value;
          expect(params.get('service_path')).toBe('math');
          expect(params.get('action')).toBe('add');
        }
      }
    });

    test('should extract parameters from nested paths', () => {
      const pathResult = TopicPath.new('main:services/math/users/admin', 'default');
      expect(pathResult.ok).toBe(true);

      if (pathResult.ok) {
        const path = pathResult.value;
        const paramsResult = path.extractParams('services/{service}/users/{user_id}');
        expect(paramsResult.ok).toBe(true);
        if (paramsResult.ok) {
          const params = paramsResult.value;
          expect(params.get('service')).toBe('math');
          expect(params.get('user_id')).toBe('admin');
        }
      }
    });

    test('should reject non-matching templates', () => {
      const pathResult = TopicPath.new('main:services/math/state', 'default');
      expect(pathResult.ok).toBe(true);

      if (pathResult.ok) {
        const path = pathResult.value;

        const nonMatchingTemplates = [
          'services/{service_path}/config',
          'users/{user_id}',
          'services/{service_path}',
          'services/{service_path}/state/details',
        ];

        for (const template of nonMatchingTemplates) {
          const paramsResult = path.extractParams(template);
          expect(paramsResult.ok).toBe(false);
        }
      }
    });

    test('should reject templates with different segment count', () => {
      const pathResult = TopicPath.new('main:services/math', 'default');
      expect(pathResult.ok).toBe(true);

      if (pathResult.ok) {
        const path = pathResult.value;
        const paramsResult = path.extractParams('services/{service_path}/state');
        expect(paramsResult.ok).toBe(false);
        if (!paramsResult.ok) {
          expect(paramsResult.error).toContain('segment count');
        }
      }
    });
  });

  // Template Matching (from topic_path_template_test.rs)
  describe('Template Matching', () => {
    test('should match paths against templates', () => {
      const pathResult = TopicPath.new('main:services/math/state', 'default');
      expect(pathResult.ok).toBe(true);

      if (pathResult.ok) {
        const path = pathResult.value;

        const matchingTemplates = [
          'services/{service_path}/state',
          'services/math/state',
          'services/{service_path}/{action}',
        ];

        const nonMatchingTemplates = [
          'services/{service_path}/config',
          'users/{user_id}',
          'services/{service_path}',
          'services/{service_path}/state/details',
        ];

        for (const template of matchingTemplates) {
          expect(path.matchesTemplate(template)).toBe(true);
        }

        for (const template of nonMatchingTemplates) {
          expect(path.matchesTemplate(template)).toBe(false);
        }
      }
    });

    test('should match various template patterns', () => {
      const pathResult = TopicPath.new('main:services/math/state', 'default');
      expect(pathResult.ok).toBe(true);

      if (pathResult.ok) {
        const path = pathResult.value;

        const testCases = [
          { template: 'services/{service_path}/state', expected: true },
          { template: 'services/math/state', expected: true },
          { template: 'services/{service_path}/{action}', expected: true },
          { template: 'services/{service_path}/config', expected: false },
          { template: 'users/{user_id}', expected: false },
          { template: 'services/{service_path}', expected: false },
          { template: 'services/{service_path}/state/details', expected: false },
        ];

        for (const testCase of testCases) {
          expect(path.matchesTemplate(testCase.template)).toBe(testCase.expected);
        }
      }
    });
  });

  // Template Creation (from topic_path_template_test.rs)
  describe('Template Creation', () => {
    test('should create paths from templates and parameters', () => {
      const template = 'services/{service_path}/state';
      const params = new Map<string, string>();
      params.set('service_path', 'math');

      const result = TopicPath.fromTemplate(template, params, 'main');
      expect(result.ok).toBe(true);
      if (result.ok) {
        const path = result.value;
        expect(path.asString()).toBe('main:services/math/state');
        expect(path.servicePath()).toBe('services');
        expect(path.networkId()).toBe('main');
      }
    });

    test('should handle multiple template parameters', () => {
      const template = 'services/{service_path}/actions/{action}';
      const params = new Map<string, string>();
      params.set('service_path', 'math');
      params.set('action', 'add');

      const result = TopicPath.fromTemplate(template, params, 'main');
      expect(result.ok).toBe(true);
      if (result.ok) {
        const path = result.value;
        expect(path.asString()).toBe('main:services/math/actions/add');
        expect(path.servicePath()).toBe('services');
        expect(path.networkId()).toBe('main');
      }
    });

    test('should handle missing parameters', () => {
      const template = 'services/{service_path}/{action}';
      const params = new Map<string, string>();
      params.set('service_path', 'math');
      // Missing 'action' parameter

      const result = TopicPath.fromTemplate(template, params, 'main');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Missing parameter value for 'action'");
      }
    });

    test('should create paths for specific service actions', () => {
      const template = 'services/{service_path}/actions';
      const params = new Map<string, string>();
      params.set('service_path', 'auth');

      const result = TopicPath.fromTemplate(template, params, 'main');
      expect(result.ok).toBe(true);
      if (result.ok) {
        const path = result.value;
        expect(path.asString()).toBe('main:services/auth/actions');
      }
    });

    test('should handle complex template patterns', () => {
      const template = 'services/{service_path}/users/{user_id}/profile';
      const params = new Map<string, string>();
      params.set('service_path', 'auth');
      params.set('user_id', '12345');

      const result = TopicPath.fromTemplate(template, params, 'main');
      expect(result.ok).toBe(true);
      if (result.ok) {
        const path = result.value;
        expect(path.asString()).toBe('main:services/auth/users/12345/profile');
      }
    });
  });

  // Template Path Key Behavior (from topic_path_template_test.rs)
  describe('Template Path Key Behavior', () => {
    test('should handle template path key behavior', () => {
      const templateResult = TopicPath.new('services/{service_path}', 'default');
      const matchValueResult = TopicPath.new('services/math', 'default');
      const notMatchResult = TopicPath.new('services/math/config', 'default');

      expect(templateResult.ok).toBe(true);
      expect(matchValueResult.ok).toBe(true);
      expect(notMatchResult.ok).toBe(true);

      if (templateResult.ok && matchValueResult.ok && notMatchResult.ok) {
        // A template path shouldn't match a concrete path in this direction
        expect(templateResult.value.matches(matchValueResult.value)).toBe(false);

        // But a concrete path should match a template via the matches_template method
        expect(matchValueResult.value.matchesTemplate('services/{service_path}')).toBe(true);
      }
    });

    test('should handle wildcard pattern matching', () => {
      const wildcardResult = TopicPath.new('services/*/state', 'default');
      const matchPath1Result = TopicPath.new('services/math/state', 'default');
      const matchPath2Result = TopicPath.new('services/auth/state', 'default');
      const nonMatchResult = TopicPath.new('services/math/config', 'default');

      expect(wildcardResult.ok).toBe(true);
      expect(matchPath1Result.ok).toBe(true);
      expect(matchPath2Result.ok).toBe(true);
      expect(nonMatchResult.ok).toBe(true);

      if (wildcardResult.ok && matchPath1Result.ok && matchPath2Result.ok && nonMatchResult.ok) {
        expect(matchPath1Result.value.matches(wildcardResult.value)).toBe(true);
        expect(matchPath2Result.value.matches(wildcardResult.value)).toBe(true);
        expect(nonMatchResult.value.matches(wildcardResult.value)).toBe(false);
      }
    });

    test('should handle simplified template key behavior', () => {
      const templateResult = TopicPath.new('main:services/{service_path}', 'default');
      const concreteResult = TopicPath.new('main:services/math', 'default');

      expect(templateResult.ok).toBe(true);
      expect(concreteResult.ok).toBe(true);

      if (templateResult.ok && concreteResult.ok) {
        // A template path shouldn't match a concrete path in this direction
        expect(templateResult.value.matches(concreteResult.value)).toBe(false);

        // But a concrete path should match a template via the matches_template method
        expect(concreteResult.value.matchesTemplate('services/{service_path}')).toBe(true);
      }
    });

    test('should handle normalized template matching', () => {
      const templateResult = TopicPath.new('main:services/{service_path}', 'default');
      const concreteResult = TopicPath.new('main:services/math', 'default');

      expect(templateResult.ok).toBe(true);
      expect(concreteResult.ok).toBe(true);

      if (templateResult.ok && concreteResult.ok) {
        // A template path shouldn't match a concrete path in this direction
        expect(templateResult.value.matches(concreteResult.value)).toBe(false);

        // But a concrete path should match a template via the matches_template method
        expect(concreteResult.value.matchesTemplate('services/{service_path}')).toBe(true);
      }
    });
  });

  // Registry Service Use Cases (from topic_path_template_test.rs)
  describe('Registry Service Use Cases', () => {
    test('should handle registry service path templates', () => {
      const listTemplate = 'services/list';
      const serviceTemplate = 'services/{service_path}';
      const stateTemplate = 'services/{service_path}/state';

      const listPathResult = TopicPath.new('main:services/list', 'default');
      const infoPathResult = TopicPath.new('main:services/math', 'default');
      const statePathResult = TopicPath.new('main:services/math/state', 'default');

      expect(listPathResult.ok).toBe(true);
      expect(infoPathResult.ok).toBe(true);
      expect(statePathResult.ok).toBe(true);

      if (listPathResult.ok && infoPathResult.ok && statePathResult.ok) {
        expect(listPathResult.value.matchesTemplate(listTemplate)).toBe(true);
        expect(infoPathResult.value.matchesTemplate(serviceTemplate)).toBe(true);
        expect(statePathResult.value.matchesTemplate(stateTemplate)).toBe(true);
      }
    });

    test('should extract service path from requests', () => {
      const stateTemplate = 'services/{service_path}/state';
      const statePathResult = TopicPath.new('main:services/math/state', 'default');

      expect(statePathResult.ok).toBe(true);
      if (statePathResult.ok) {
        const statePath = statePathResult.value;
        const paramsResult = statePath.extractParams(stateTemplate);
        expect(paramsResult.ok).toBe(true);
        if (paramsResult.ok) {
          const params = paramsResult.value;
          expect(params.get('service_path')).toBe('math');
        }
      }
    });

    test('should create paths for specific service actions', () => {
      const actionsTemplate = 'services/{service_path}/actions';
      const params = new Map<string, string>();
      params.set('service_path', 'auth');

      const result = TopicPath.fromTemplate(actionsTemplate, params, 'main');
      expect(result.ok).toBe(true);
      if (result.ok) {
        const path = result.value;
        expect(path.asString()).toBe('main:services/auth/actions');
      }
    });

    test('should handle real-world registry service scenarios', () => {
      const listServicesTemplate = 'services/list';
      const serviceInfoTemplate = 'services/{service_path}';
      const serviceStateTemplate = 'services/{service_path}/state';

      const listPathResult = TopicPath.new('main:services/list', 'default');
      const infoPathResult = TopicPath.new('main:services/math', 'default');
      const statePathResult = TopicPath.new('main:services/math/state', 'default');

      expect(listPathResult.ok).toBe(true);
      expect(infoPathResult.ok).toBe(true);
      expect(statePathResult.ok).toBe(true);

      if (listPathResult.ok && infoPathResult.ok && statePathResult.ok) {
        // Create template path objects for testing matches() in both directions
        const templatePathResult = TopicPath.new(serviceInfoTemplate, 'default');
        expect(templatePathResult.ok).toBe(true);

        if (templatePathResult.ok) {
          // These should match their respective templates using matches_template
          expect(listPathResult.value.matchesTemplate(listServicesTemplate)).toBe(true);
          expect(infoPathResult.value.matchesTemplate(serviceInfoTemplate)).toBe(true);
          expect(statePathResult.value.matchesTemplate(serviceStateTemplate)).toBe(true);

          // A template path shouldn't match a concrete path in this direction
          expect(templatePathResult.value.matches(infoPathResult.value)).toBe(false);

          // Extract parameters
          const infoParamsResult = infoPathResult.value.extractParams(serviceInfoTemplate);
          expect(infoParamsResult.ok).toBe(true);
          if (infoParamsResult.ok) {
            const infoParams = infoParamsResult.value;
            expect(infoParams.get('service_path')).toBe('math');
          }

          const stateParamsResult = statePathResult.value.extractParams(serviceStateTemplate);
          expect(stateParamsResult.ok).toBe(true);
          if (stateParamsResult.ok) {
            const stateParams = stateParamsResult.value;
            expect(stateParams.get('service_path')).toBe('math');
          }
        }
      }
    });
  });

  // Error Handling
  describe('Error Handling', () => {
    test('all methods should return Result types', () => {
      const result = TopicPath.new('', 'default');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(typeof result.error).toBe('string');
        expect(result.error.length).toBeGreaterThan(0);
      }
    });
  });
});
