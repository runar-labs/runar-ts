import { describe, it, expect, beforeEach } from 'bun:test';
import { TopicPath } from '../src/routing/TopicPath.js';
import { PathTrie } from '../src/routing/PathTrie.js';

describe('Comprehensive TopicPath and PathTrie Tests (Mirroring Rust)', () => {
  describe('TopicPath Wildcard Functionality', () => {
    it('should identify patterns correctly', () => {
      // Test without wildcards
      const path1 = TopicPath.new('main:services/auth/login', 'default');
      expect(path1.isPattern()).toBe(false);

      // Test with single-segment wildcard
      const pattern1 = TopicPath.new('main:services/*/login', 'default');
      expect(pattern1.isPattern()).toBe(true);

      // Test with multi-segment wildcard
      const pattern2 = TopicPath.new('main:services/>', 'default');
      expect(pattern2.isPattern()).toBe(true);
      expect(pattern2.hasMultiWildcard()).toBe(true);
    });

    it('should match single wildcard patterns', () => {
      // Create pattern with single-segment wildcard
      const pattern = TopicPath.new('main:services/*/state', 'default');

      // Test successful matches
      const path1 = TopicPath.new('main:services/auth/state', 'default');
      const path2 = TopicPath.new('main:services/math/state', 'default');

      expect(pattern.matches(path1)).toBe(true);
      expect(pattern.matches(path2)).toBe(true);

      // Test non-matches
      const nonMatch1 = TopicPath.new('main:services/auth/login', 'default');
      const nonMatch2 = TopicPath.new('main:services/auth/state/active', 'default');
      const nonMatch3 = TopicPath.new('main:events/user/created', 'default');

      expect(pattern.matches(nonMatch1)).toBe(false); // Different last segment
      expect(pattern.matches(nonMatch2)).toBe(false); // Too many segments
      expect(pattern.matches(nonMatch3)).toBe(false); // Different service path
    });

    it('should match multi wildcard patterns', () => {
      // Create pattern with multi-segment wildcard
      const pattern = TopicPath.new('main:services/>', 'default');

      // Test successful matches (should match any path that starts with "services")
      const path1 = TopicPath.new('main:services/auth', 'default');
      const path2 = TopicPath.new('main:services/auth/login', 'default');
      const path3 = TopicPath.new('main:services/math/add/numbers', 'default');

      expect(pattern.matches(path1)).toBe(true);
      expect(pattern.matches(path2)).toBe(true);
      expect(pattern.matches(path3)).toBe(true);

      // Test non-matches
      const nonMatch1 = TopicPath.new('main:events/user/created', 'default');
      expect(pattern.matches(nonMatch1)).toBe(false); // Different service path
    });

    it('should enforce multi-wildcard positioning rules', () => {
      // Multi-wildcard must be the last segment
      expect(() => TopicPath.new('main:services/>/state', 'default')).toThrow();

      // But can be in the middle of a pattern as long as it's the last segment
      const validPattern = TopicPath.new('main:services/>', 'default');
      expect(validPattern.isPattern()).toBe(true);
      expect(validPattern.hasMultiWildcard()).toBe(true);
    });

    it('should handle complex patterns with both wildcard types', () => {
      // Pattern with both types of wildcards
      const pattern = TopicPath.new('main:services/*/events/>', 'default');

      // Test successful matches
      const path1 = TopicPath.new('main:services/auth/events/user/login', 'default');
      const path2 = TopicPath.new('main:services/math/events/calculation/completed', 'default');

      expect(pattern.matches(path1)).toBe(true);
      expect(pattern.matches(path2)).toBe(true);

      // Test non-matches
      const nonMatch1 = TopicPath.new('main:services/auth/state', 'default');
      const nonMatch2 = TopicPath.new('main:services/auth/logs/error', 'default');

      expect(pattern.matches(nonMatch1)).toBe(false); // Different segment after service
      expect(pattern.matches(nonMatch2)).toBe(false); // "logs" instead of "events"
    });

    it('should handle wildcard at beginning of path', () => {
      // Pattern with wildcard at beginning
      const pattern = TopicPath.new('main:*/state', 'default');

      // Test successful matches (should match any service with "state" action)
      const path1 = TopicPath.new('main:auth/state', 'default');
      const path2 = TopicPath.new('main:math/state', 'default');

      expect(pattern.matches(path1)).toBe(true);
      expect(pattern.matches(path2)).toBe(true);

      // Test non-matches
      const nonMatch1 = TopicPath.new('main:auth/login', 'default');
      expect(pattern.matches(nonMatch1)).toBe(false); // Different action
    });

    it('should isolate patterns by network', () => {
      // Patterns should only match within the same network
      const pattern = TopicPath.new('main:services/*/state', 'default');
      const path1 = TopicPath.new('main:services/auth/state', 'default');
      const path2 = TopicPath.new('other:services/auth/state', 'default');

      expect(pattern.matches(path1)).toBe(true); // Same network
      expect(pattern.matches(path2)).toBe(false); // Different network
    });
  });

  describe('TopicPath Template Functionality', () => {
    it('should extract parameters from template patterns', () => {
      // An actual path that matches the template
      const path = TopicPath.new('services/math/state', 'main');

      // Extract parameters from the path using template string
      const params = path.extractParams('services/{service_path}/state');
      expect(params.get('service_path')).toBe('math');
    });

    it('should match paths against templates', () => {
      // const template = TopicPath.new('services/{service_path}/state', 'main');

      // Paths that should match
      const path1 = TopicPath.new('main:services/math/state', 'default');
      const path2 = TopicPath.new('main:services/auth/state', 'default');

      expect(path1.matchesTemplate('services/{service_path}/state')).toBe(true);
      expect(path2.matchesTemplate('services/{service_path}/state')).toBe(true);

      // Paths that shouldn't match
      const path3 = TopicPath.new('main:services/math', 'default');
      const path4 = TopicPath.new('main:users/auth/profile', 'default');

      expect(path3.matchesTemplate('services/{service_path}/state')).toBe(false);
      expect(path4.matchesTemplate('services/{service_path}/state')).toBe(false);
    });

    it('should create paths from templates and parameters', () => {
      const template = 'services/{service_path}/state';
      const params = new Map([['service_path', 'math']]);

      const path = TopicPath.fromTemplate(template, params, 'main');
      expect(path.asString()).toBe('main:services/math/state');
      expect(path.servicePath()).toBe('services');
      expect(path.networkId()).toBe('main');
    });

    it('should handle multiple template parameters', () => {
      const template = 'services/{service_path}/actions/{action}';
      const params = new Map([
        ['service_path', 'math'],
        ['action', 'add'],
      ]);

      const path = TopicPath.fromTemplate(template, params, 'main');
      expect(path.asString()).toBe('main:services/math/actions/add');
    });

    it('should reject paths that dont match segment count', () => {
      const path = TopicPath.new('main:services/math', 'default');
      expect(() => path.extractParams('services/{service_path}/state')).toThrow();
    });
  });

  describe('PathTrie Template and Wildcard Matching', () => {
    let trie: PathTrie<string>;

    beforeEach(() => {
      trie = PathTrie.default();
    });

    it('should match template patterns and extract parameters', () => {
      // Register a template pattern
      trie.setValue(TopicPath.new('services/{service_path}/state', 'network1'), 'TEMPLATE');

      // Test with a matching topic
      const topic = TopicPath.new('services/math/state', 'network1');
      const matches = trie.find(topic);

      expect(matches).toEqual(['TEMPLATE']);

      // Test parameter extraction
      const matchesWithParams = trie.findMatches(topic);
      expect(matchesWithParams).toHaveLength(1);
      expect(matchesWithParams[0].content).toBe('TEMPLATE');
      expect(matchesWithParams[0].params.get('service_path')).toBe('math');
    });

    it('should handle network isolation', () => {
      // Add same paths with different networks
      trie.setValue(TopicPath.new('services/math/state', 'network1'), 'MATH_NETWORK1');

      trie.setValue(TopicPath.new('services/math/state', 'network2'), 'MATH_NETWORK2');

      // Test exact path matching with network isolation
      const topic1 = TopicPath.new('services/math/state', 'network1');
      const matches1 = trie.find(topic1);
      expect(matches1).toEqual(['MATH_NETWORK1']);

      const topic2 = TopicPath.new('services/math/state', 'network2');
      const matches2 = trie.find(topic2);
      expect(matches2).toEqual(['MATH_NETWORK2']);

      // Test non-existent network
      const topic3 = TopicPath.new('services/math/state', 'network3');
      const matches3 = trie.find(topic3);
      expect(matches3).toEqual([]);
    });

    it('should match wildcard patterns', () => {
      // Register a wildcard pattern
      trie.setValue(TopicPath.new('services/*/state', 'network1'), 'WILDCARD');

      // Test with a matching topic
      const topic = TopicPath.new('services/math/state', 'network1');
      const matches = trie.find(topic);

      expect(matches).toEqual(['WILDCARD']);

      // Test with a different network
      const topic2 = TopicPath.new('services/math/state', 'network2');
      const matches2 = trie.find(topic2);

      expect(matches2).toEqual([]);
    });

    it('should handle multi-segment wildcard patterns', () => {
      // Multi-segment wildcard
      trie.setValue(TopicPath.new('services/>', 'network1'), 'MULTI_WILDCARD');

      // Test with different segment counts
      const topic1 = TopicPath.new('services/math/state', 'network1');
      const matches1 = trie.find(topic1);
      expect(matches1).toEqual(['MULTI_WILDCARD']);

      const topic2 = TopicPath.new('services/math/actions/add', 'network1');
      const matches2 = trie.find(topic2);
      expect(matches2).toEqual(['MULTI_WILDCARD']);
    });

    it('should handle complex mixed patterns', () => {
      // Template + wildcard
      trie.setValue(
        TopicPath.new('services/{service_path}/*/details', 'network1'),
        'TEMPLATE_THEN_WILDCARD'
      );

      // Test template then wildcard
      const topic1 = TopicPath.new('services/math/state/details', 'network1');
      const matches1 = trie.find(topic1);
      expect(matches1).toEqual(['TEMPLATE_THEN_WILDCARD']);
    });

    it('should handle wildcard search with intermediate nodes', () => {
      // Simulate service with actions at different levels
      trie.setValue(TopicPath.new('users_db/execute_query', 'network1'), 'users_db/execute_query');

      trie.setValue(
        TopicPath.new('users_db/replication/get_table_events', 'network1'),
        'users_db/replication/get_table_events'
      );

      // Test wildcard search
      const searchPath = TopicPath.new('users_db/*', 'network1');
      const matches = trie.find(searchPath);

      // Should find all actions at root level
      expect(matches).toHaveLength(2);
      expect(matches).toContain('users_db/execute_query');
      expect(matches).toContain('users_db/replication/get_table_events');
    });
  });

  describe('Advanced PathTrie Scenarios', () => {
    let trie: PathTrie<string>;

    beforeEach(() => {
      trie = PathTrie.default();
    });

    it('should handle repeated template parameter names', () => {
      // Add handler with repeated parameter name
      trie.setValue(
        TopicPath.new('services/{param}/actions/{param}', 'network1'),
        'REPEATED_PARAM'
      );

      // Test matching
      const topic = TopicPath.new('services/param/actions/param', 'network1');
      const matches = trie.find(topic);
      expect(matches).toEqual(['REPEATED_PARAM']);
    });

    it('should handle all template positions', () => {
      // Template at beginning
      trie.setValue(TopicPath.new('{type}/services/state', 'network1'), 'START_TEMPLATE');

      // Template at end
      trie.setValue(TopicPath.new('services/state/{param}', 'network1'), 'END_TEMPLATE');

      // Template in all positions
      trie.setValue(TopicPath.new('{a}/{b}/{c}', 'network1'), 'ALL_TEMPLATES');

      // Test all templates (note: more specific templates may match multiple patterns)
      const topic1 = TopicPath.new('internal/services/state', 'network1');
      const matches1 = trie.find(topic1);
      expect(matches1).toContain('START_TEMPLATE');
      expect(matches1).toContain('ALL_TEMPLATES'); // More general pattern also matches

      const topic2 = TopicPath.new('services/state/details', 'network1');
      const matches2 = trie.find(topic2);
      expect(matches2).toContain('END_TEMPLATE');
      expect(matches2).toContain('ALL_TEMPLATES'); // More general pattern also matches

      const topic3 = TopicPath.new('x/y/z', 'network1');
      expect(trie.find(topic3)).toEqual(['ALL_TEMPLATES']);
    });

    it('should handle deep path matching with multi-wildcard', () => {
      trie.setValue(TopicPath.new('services/math/>', 'network1'), 'TEMPLATE_THEN_MULTI');

      // Test with deep path
      const topic = TopicPath.new('services/math/a/b/c/d/e', 'network1');
      const matches = trie.find(topic);
      expect(matches).toEqual(['TEMPLATE_THEN_MULTI']);
    });
  });

  describe('Registry Service Use Cases', () => {
    it('should handle registry service path templates', () => {
      // Create actual request paths
      const listPath = TopicPath.new('main:services/list', 'default');
      const infoPath = TopicPath.new('main:services/math', 'default');
      const statePath = TopicPath.new('main:services/math/state', 'default');

      // Test template matching
      expect(listPath.matchesTemplate('services/list')).toBe(true);
      expect(infoPath.matchesTemplate('services/{service_path}')).toBe(true);
      expect(statePath.matchesTemplate('services/{service_path}/state')).toBe(true);

      // Test parameter extraction
      const infoParams = infoPath.extractParams('services/{service_path}');
      expect(infoParams.get('service_path')).toBe('math');

      const stateParams = statePath.extractParams('services/{service_path}/state');
      expect(stateParams.get('service_path')).toBe('math');
    });

    it('should create paths for specific service actions', () => {
      const template = 'services/{service_path}/actions';
      const params = new Map([['service_path', 'auth']]);

      const path = TopicPath.fromTemplate(template, params, 'main');
      expect(path.asString()).toBe('main:services/auth/actions');
    });
  });
});
