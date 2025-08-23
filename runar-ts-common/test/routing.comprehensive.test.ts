import { describe, it, expect, beforeEach } from 'bun:test';
import { TopicPath } from '../src/routing/TopicPath.js';
import { PathTrie } from '../src/routing/PathTrie.js';

describe('Comprehensive TopicPath and PathTrie Tests (Mirroring Rust)', () => {
  describe('TopicPath Wildcard Functionality', () => {
    it('should identify patterns correctly', () => {
      // Test without wildcards
      const path1Result = TopicPath.new('main:services/auth/login', 'default');
      expect(path1Result.ok).toBe(true);
      if (path1Result.ok) {
        expect(path1Result.value.isPattern()).toBe(false);
      }

      // Test with single-segment wildcard
      const pattern1Result = TopicPath.new('main:services/*/login', 'default');
      expect(pattern1Result.ok).toBe(true);
      if (pattern1Result.ok) {
        expect(pattern1Result.value.isPattern()).toBe(true);
      }

      // Test with multi-segment wildcard
      const pattern2Result = TopicPath.new('main:services/>', 'default');
      expect(pattern2Result.ok).toBe(true);
      if (pattern2Result.ok) {
        expect(pattern2Result.value.isPattern()).toBe(true);
        expect(pattern2Result.value.hasMultiWildcard()).toBe(true);
      }
    });

    it('should match single wildcard patterns', () => {
      // Create pattern with single-segment wildcard
      const patternResult = TopicPath.new('main:services/*/state', 'default');
      expect(patternResult.ok).toBe(true);

      if (patternResult.ok) {
        const pattern = patternResult.value;

        // Test successful matches
        const path1Result = TopicPath.new('main:services/auth/state', 'default');
        const path2Result = TopicPath.new('main:services/math/state', 'default');
        expect(path1Result.ok).toBe(true);
        expect(path2Result.ok).toBe(true);

        if (path1Result.ok && path2Result.ok) {
          expect(pattern.matches(path1Result.value)).toBe(true);
          expect(pattern.matches(path2Result.value)).toBe(true);
        }

        // Test non-matches
        const nonMatch1Result = TopicPath.new('main:services/auth/login', 'default');
        const nonMatch2Result = TopicPath.new('main:services/auth/state/active', 'default');
        const nonMatch3Result = TopicPath.new('main:events/user/created', 'default');

        expect(nonMatch1Result.ok).toBe(true);
        expect(nonMatch2Result.ok).toBe(true);
        expect(nonMatch3Result.ok).toBe(true);

        if (nonMatch1Result.ok && nonMatch2Result.ok && nonMatch3Result.ok) {
          expect(pattern.matches(nonMatch1Result.value)).toBe(false); // Different last segment
          expect(pattern.matches(nonMatch2Result.value)).toBe(false); // Too many segments
          expect(pattern.matches(nonMatch3Result.value)).toBe(false); // Different service path
        }
      }
    });

    it('should match multi wildcard patterns', () => {
      // Create pattern with multi-segment wildcard
      const patternResult = TopicPath.new('main:services/>', 'default');
      expect(patternResult.ok).toBe(true);

      if (patternResult.ok) {
        const pattern = patternResult.value;

        // Test successful matches (should match any path that starts with "services")
        const path1Result = TopicPath.new('main:services/auth', 'default');
        const path2Result = TopicPath.new('main:services/auth/login', 'default');
        const path3Result = TopicPath.new('main:services/math/add/numbers', 'default');

        expect(path1Result.ok).toBe(true);
        expect(path2Result.ok).toBe(true);
        expect(path3Result.ok).toBe(true);

        if (path1Result.ok && path2Result.ok && path3Result.ok) {
          expect(pattern.matches(path1Result.value)).toBe(true);
          expect(pattern.matches(path2Result.value)).toBe(true);
          expect(pattern.matches(path3Result.value)).toBe(true);
        }

        // Test non-matches
        const nonMatch1Result = TopicPath.new('main:events/user/created', 'default');
        expect(nonMatch1Result.ok).toBe(true);
        if (nonMatch1Result.ok) {
          expect(pattern.matches(nonMatch1Result.value)).toBe(false); // Different service path
        }
      }
    });

    it('should enforce multi-wildcard positioning rules', () => {
      // Multi-wildcard must be the last segment
      const invalidResult = TopicPath.new('main:services/>/state', 'default');
      expect(invalidResult.ok).toBe(false);
      expect(invalidResult.error).toContain('Multi-segment wildcard');

      // But can be in the middle of a pattern as long as it's the last segment
      const validPatternResult = TopicPath.new('main:services/>', 'default');
      expect(validPatternResult.ok).toBe(true);
      if (validPatternResult.ok) {
        expect(validPatternResult.value.isPattern()).toBe(true);
        expect(validPatternResult.value.hasMultiWildcard()).toBe(true);
      }
    });

    it('should handle complex patterns with both wildcard types', () => {
      // Pattern with both types of wildcards
      const patternResult = TopicPath.new('main:services/*/events/>', 'default');
      expect(patternResult.ok).toBe(true);

      if (patternResult.ok) {
        // Test successful matches
        const path1Result = TopicPath.new('main:services/auth/events/user/login', 'default');
        const path2Result = TopicPath.new(
          'main:services/math/events/calculation/completed',
          'default'
        );

        expect(path1Result.ok).toBe(true);
        expect(path2Result.ok).toBe(true);

        if (path1Result.ok && path2Result.ok) {
          expect(patternResult.value.matches(path1Result.value)).toBe(true);
          expect(patternResult.value.matches(path2Result.value)).toBe(true);

          // Test non-matches
          const nonMatch1Result = TopicPath.new('main:services/auth/state', 'default');
          const nonMatch2Result = TopicPath.new('main:services/auth/logs/error', 'default');

          expect(nonMatch1Result.ok).toBe(true);
          expect(nonMatch2Result.ok).toBe(true);

          if (nonMatch1Result.ok && nonMatch2Result.ok) {
            expect(patternResult.value.matches(nonMatch1Result.value)).toBe(false); // Different segment after service
            expect(patternResult.value.matches(nonMatch2Result.value)).toBe(false); // "logs" instead of "events"
          }
        }
      }
    });

    it('should handle wildcard at beginning of path', () => {
      // Pattern with wildcard at beginning
      const patternResult = TopicPath.new('main:*/state', 'default');
      expect(patternResult.ok).toBe(true);

      if (patternResult.ok) {
        // Test successful matches (should match any service with "state" action)
        const path1Result = TopicPath.new('main:auth/state', 'default');
        const path2Result = TopicPath.new('main:math/state', 'default');

        expect(path1Result.ok).toBe(true);
        expect(path2Result.ok).toBe(true);

        if (path1Result.ok && path2Result.ok) {
          expect(patternResult.value.matches(path1Result.value)).toBe(true);
          expect(patternResult.value.matches(path2Result.value)).toBe(true);

          // Test non-matches
          const nonMatch1Result = TopicPath.new('main:auth/login', 'default');
          expect(nonMatch1Result.ok).toBe(true);

          if (nonMatch1Result.ok) {
            expect(patternResult.value.matches(nonMatch1Result.value)).toBe(false); // Different action
          }
        }
      }
    });

    it('should isolate patterns by network', () => {
      // Patterns should only match within the same network
      const patternResult = TopicPath.new('main:services/*/state', 'default');
      const path1Result = TopicPath.new('main:services/auth/state', 'default');
      const path2Result = TopicPath.new('other:services/auth/state', 'default');

      expect(patternResult.ok).toBe(true);
      expect(path1Result.ok).toBe(true);
      expect(path2Result.ok).toBe(true);

      if (patternResult.ok && path1Result.ok && path2Result.ok) {
        expect(patternResult.value.matches(path1Result.value)).toBe(true); // Same network
        expect(patternResult.value.matches(path2Result.value)).toBe(false); // Different network
      }
    });
  });

  describe('TopicPath Template Functionality', () => {
    it('should extract parameters from template patterns', () => {
      // An actual path that matches the template
      const pathResult = TopicPath.new('services/math/state', 'main');
      expect(pathResult.ok).toBe(true);

      if (pathResult.ok) {
        // Extract parameters from the path using template string
        const paramsResult = pathResult.value.extractParams('services/{service_path}/state');
        expect(paramsResult.ok).toBe(true);

        if (paramsResult.ok) {
          expect(paramsResult.value.get('service_path')).toBe('math');
        }
      }
    });

    it('should match paths against templates', () => {
      // const template = TopicPath.new('services/{service_path}/state', 'main');

      // Paths that should match
      const path1Result = TopicPath.new('main:services/math/state', 'default');
      const path2Result = TopicPath.new('main:services/auth/state', 'default');

      expect(path1Result.ok).toBe(true);
      expect(path2Result.ok).toBe(true);

      if (path1Result.ok && path2Result.ok) {
        expect(path1Result.value.matchesTemplate('services/{service_path}/state')).toBe(true);
        expect(path2Result.value.matchesTemplate('services/{service_path}/state')).toBe(true);

        // Paths that shouldn't match
        const path3Result = TopicPath.new('main:services/math', 'default');
        const path4Result = TopicPath.new('main:users/auth/profile', 'default');

        expect(path3Result.ok).toBe(true);
        expect(path4Result.ok).toBe(true);

        if (path3Result.ok && path4Result.ok) {
          expect(path3Result.value.matchesTemplate('services/{service_path}/state')).toBe(false);
          expect(path4Result.value.matchesTemplate('services/{service_path}/state')).toBe(false);
        }
      }
    });

    it('should create paths from templates and parameters', () => {
      const template = 'services/{service_path}/state';
      const params = new Map([['service_path', 'math']]);

      const pathResult = TopicPath.fromTemplate(template, params, 'main');
      expect(pathResult.ok).toBe(true);

      if (pathResult.ok) {
        expect(pathResult.value.asString()).toBe('main:services/math/state');
        expect(pathResult.value.servicePath()).toBe('services');
        expect(pathResult.value.networkId()).toBe('main');
      }
    });

    it('should handle multiple template parameters', () => {
      const template = 'services/{service_path}/actions/{action}';
      const params = new Map([
        ['service_path', 'math'],
        ['action', 'add'],
      ]);

      const pathResult = TopicPath.fromTemplate(template, params, 'main');
      expect(pathResult.ok).toBe(true);

      if (pathResult.ok) {
        expect(pathResult.value.asString()).toBe('main:services/math/actions/add');
      }
    });

    it('should reject paths that dont match segment count', () => {
      const pathResult = TopicPath.new('main:services/math', 'default');
      expect(pathResult.ok).toBe(true);

      if (pathResult.ok) {
        const paramsResult = pathResult.value.extractParams('services/{service_path}/state');
        expect(paramsResult.ok).toBe(false);
        expect(paramsResult.error).toContain('segment count');
      }
    });
  });

  describe('PathTrie Template and Wildcard Matching', () => {
    let trie: PathTrie<string>;

    beforeEach(() => {
      trie = PathTrie.default();
    });

    it('should match template patterns and extract parameters', () => {
      // Register a template pattern
      const templatePathResult = TopicPath.new('services/{service_path}/state', 'network1');
      expect(templatePathResult.ok).toBe(true);

      if (templatePathResult.ok) {
        trie.setValue(templatePathResult.value, 'TEMPLATE');

        // Test with a matching topic
        const topicResult = TopicPath.new('services/math/state', 'network1');
        expect(topicResult.ok).toBe(true);

        if (topicResult.ok) {
          const matches = trie.find(topicResult.value);
          expect(matches).toEqual(['TEMPLATE']);

          // Test parameter extraction
          const matchesWithParams = trie.findMatches(topicResult.value);
          expect(matchesWithParams).toHaveLength(1);
          expect(matchesWithParams[0].content).toBe('TEMPLATE');
          expect(matchesWithParams[0].params.get('service_path')).toBe('math');
        }
      }
    });

    it('should handle network isolation', () => {
      // Add same paths with different networks
      const path1Result = TopicPath.new('services/math/state', 'network1');
      const path2Result = TopicPath.new('services/math/state', 'network2');

      expect(path1Result.ok).toBe(true);
      expect(path2Result.ok).toBe(true);

      if (path1Result.ok && path2Result.ok) {
        trie.setValue(path1Result.value, 'MATH_NETWORK1');
        trie.setValue(path2Result.value, 'MATH_NETWORK2');

        // Test exact path matching with network isolation
        const topic1Result = TopicPath.new('services/math/state', 'network1');
        expect(topic1Result.ok).toBe(true);

        if (topic1Result.ok) {
          const matches1 = trie.find(topic1Result.value);
          expect(matches1).toEqual(['MATH_NETWORK1']);

          const topic2Result = TopicPath.new('services/math/state', 'network2');
          expect(topic2Result.ok).toBe(true);

          if (topic2Result.ok) {
            const matches2 = trie.find(topic2Result.value);
            expect(matches2).toEqual(['MATH_NETWORK2']);

            // Test non-existent network
            const topic3Result = TopicPath.new('services/math/state', 'network3');
            expect(topic3Result.ok).toBe(true);

            if (topic3Result.ok) {
              const matches3 = trie.find(topic3Result.value);
              expect(matches3).toEqual([]);
            }
          }
        }
      }
    });

    it('should match wildcard patterns', () => {
      // Register a wildcard pattern
      const wildcardPathResult = TopicPath.new('services/*/state', 'network1');
      expect(wildcardPathResult.ok).toBe(true);

      if (wildcardPathResult.ok) {
        trie.setValue(wildcardPathResult.value, 'WILDCARD');

        // Test with a matching topic
        const topicResult = TopicPath.new('services/math/state', 'network1');
        expect(topicResult.ok).toBe(true);

        if (topicResult.ok) {
          const matches = trie.find(topicResult.value);
          expect(matches).toEqual(['WILDCARD']);

          // Test with a different network
          const topic2Result = TopicPath.new('services/math/state', 'network2');
          expect(topic2Result.ok).toBe(true);

          if (topic2Result.ok) {
            const matches2 = trie.find(topic2Result.value);
            expect(matches2).toEqual([]);
          }
        }
      }
    });

    it('should handle multi-segment wildcard patterns', () => {
      // Multi-segment wildcard
      const multiWildcardPathResult = TopicPath.new('services/>', 'network1');
      expect(multiWildcardPathResult.ok).toBe(true);

      if (multiWildcardPathResult.ok) {
        trie.setValue(multiWildcardPathResult.value, 'MULTI_WILDCARD');

        // Test with different segment counts
        const topic1Result = TopicPath.new('services/math/state', 'network1');
        expect(topic1Result.ok).toBe(true);

        if (topic1Result.ok) {
          const matches1 = trie.find(topic1Result.value);
          expect(matches1).toEqual(['MULTI_WILDCARD']);

          const topic2Result = TopicPath.new('services/math/actions/add', 'network1');
          expect(topic2Result.ok).toBe(true);

          if (topic2Result.ok) {
            const matches2 = trie.find(topic2Result.value);
            expect(matches2).toEqual(['MULTI_WILDCARD']);
          }
        }
      }
    });

    it('should handle complex mixed patterns', () => {
      // Template + wildcard
      const mixedPatternResult = TopicPath.new('services/{service_path}/*/details', 'network1');
      expect(mixedPatternResult.ok).toBe(true);

      if (mixedPatternResult.ok) {
        trie.setValue(mixedPatternResult.value, 'TEMPLATE_THEN_WILDCARD');

        // Test template then wildcard
        const topic1Result = TopicPath.new('services/math/state/details', 'network1');
        expect(topic1Result.ok).toBe(true);

        if (topic1Result.ok) {
          const matches1 = trie.find(topic1Result.value);
          expect(matches1).toEqual(['TEMPLATE_THEN_WILDCARD']);
        }
      }
    });

    it('should handle wildcard search with intermediate nodes', () => {
      // Simulate service with actions at different levels
      const path1Result = TopicPath.new('users_db/execute_query', 'network1');
      const path2Result = TopicPath.new('users_db/replication/get_table_events', 'network1');

      expect(path1Result.ok).toBe(true);
      expect(path2Result.ok).toBe(true);

      if (path1Result.ok && path2Result.ok) {
        trie.setValue(path1Result.value, 'users_db/execute_query');
        trie.setValue(path2Result.value, 'users_db/replication/get_table_events');

        // Test wildcard search
        const searchPathResult = TopicPath.new('users_db/*', 'network1');
        expect(searchPathResult.ok).toBe(true);

        if (searchPathResult.ok) {
          const matches = trie.find(searchPathResult.value);

          // Should find all actions at root level
          expect(matches).toHaveLength(2);
          expect(matches).toContain('users_db/execute_query');
          expect(matches).toContain('users_db/replication/get_table_events');
        }
      }
    });
  });

  describe('Advanced PathTrie Scenarios', () => {
    let trie: PathTrie<string>;

    beforeEach(() => {
      trie = PathTrie.default();
    });

    it('should handle repeated template parameter names', () => {
      // Add handler with repeated parameter name
      const repeatedParamPathResult = TopicPath.new('services/{param}/actions/{param}', 'network1');
      expect(repeatedParamPathResult.ok).toBe(true);

      if (repeatedParamPathResult.ok) {
        trie.setValue(repeatedParamPathResult.value, 'REPEATED_PARAM');

        // Test matching
        const topicResult = TopicPath.new('services/param/actions/param', 'network1');
        expect(topicResult.ok).toBe(true);

        if (topicResult.ok) {
          const matches = trie.find(topicResult.value);
          expect(matches).toEqual(['REPEATED_PARAM']);
        }
      }
    });

    it('should handle all template positions', () => {
      // Template at beginning
      const startTemplateResult = TopicPath.new('{type}/services/state', 'network1');
      expect(startTemplateResult.ok).toBe(true);

      // Template at end
      const endTemplateResult = TopicPath.new('services/state/{param}', 'network1');
      expect(endTemplateResult.ok).toBe(true);

      // Template in all positions
      const allTemplatesResult = TopicPath.new('{a}/{b}/{c}', 'network1');
      expect(allTemplatesResult.ok).toBe(true);

      if (startTemplateResult.ok && endTemplateResult.ok && allTemplatesResult.ok) {
        trie.setValue(startTemplateResult.value, 'START_TEMPLATE');
        trie.setValue(endTemplateResult.value, 'END_TEMPLATE');
        trie.setValue(allTemplatesResult.value, 'ALL_TEMPLATES');

        // Test all templates (note: more specific templates may match multiple patterns)
        const topic1Result = TopicPath.new('internal/services/state', 'network1');
        expect(topic1Result.ok).toBe(true);

        if (topic1Result.ok) {
          const matches1 = trie.find(topic1Result.value);
          expect(matches1).toContain('START_TEMPLATE');
          expect(matches1).toContain('ALL_TEMPLATES'); // More general pattern also matches

          const topic2Result = TopicPath.new('services/state/details', 'network1');
          expect(topic2Result.ok).toBe(true);

          if (topic2Result.ok) {
            const matches2 = trie.find(topic2Result.value);
            expect(matches2).toContain('END_TEMPLATE');
            expect(matches2).toContain('ALL_TEMPLATES'); // More general pattern also matches

            const topic3Result = TopicPath.new('x/y/z', 'network1');
            expect(topic3Result.ok).toBe(true);

            if (topic3Result.ok) {
              expect(trie.find(topic3Result.value)).toEqual(['ALL_TEMPLATES']);
            }
          }
        }
      }
    });

    it('should handle deep path matching with multi-wildcard', () => {
      const deepPathPatternResult = TopicPath.new('services/math/>', 'network1');
      expect(deepPathPatternResult.ok).toBe(true);

      if (deepPathPatternResult.ok) {
        trie.setValue(deepPathPatternResult.value, 'TEMPLATE_THEN_MULTI');

        // Test with deep path
        const topicResult = TopicPath.new('services/math/a/b/c/d/e', 'network1');
        expect(topicResult.ok).toBe(true);

        if (topicResult.ok) {
          const matches = trie.find(topicResult.value);
          expect(matches).toEqual(['TEMPLATE_THEN_MULTI']);
        }
      }
    });
  });

  describe('Registry Service Use Cases', () => {
    it('should handle registry service path templates', () => {
      // Create actual request paths
      const listPathResult = TopicPath.new('main:services/list', 'default');
      const infoPathResult = TopicPath.new('main:services/math', 'default');
      const statePathResult = TopicPath.new('main:services/math/state', 'default');

      expect(listPathResult.ok).toBe(true);
      expect(infoPathResult.ok).toBe(true);
      expect(statePathResult.ok).toBe(true);

      if (listPathResult.ok && infoPathResult.ok && statePathResult.ok) {
        // Test template matching
        expect(listPathResult.value.matchesTemplate('services/list')).toBe(true);
        expect(infoPathResult.value.matchesTemplate('services/{service_path}')).toBe(true);
        expect(statePathResult.value.matchesTemplate('services/{service_path}/state')).toBe(true);

        // Test parameter extraction
        const infoParamsResult = infoPathResult.value.extractParams('services/{service_path}');
        expect(infoParamsResult.ok).toBe(true);

        if (infoParamsResult.ok) {
          expect(infoParamsResult.value.get('service_path')).toBe('math');
        }

        const stateParamsResult = statePathResult.value.extractParams(
          'services/{service_path}/state'
        );
        expect(stateParamsResult.ok).toBe(true);

        if (stateParamsResult.ok) {
          expect(stateParamsResult.value.get('service_path')).toBe('math');
        }
      }
    });

    it('should create paths for specific service actions', () => {
      const template = 'services/{service_path}/actions';
      const params = new Map([['service_path', 'auth']]);

      const pathResult = TopicPath.fromTemplate(template, params, 'main');
      expect(pathResult.ok).toBe(true);

      if (pathResult.ok) {
        expect(pathResult.value.asString()).toBe('main:services/auth/actions');
      }
    });
  });
});
