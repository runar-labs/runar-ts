/**
 * Comprehensive tests for PathTrie implementation
 * Based on Rust test patterns from runar-node-tests
 */

import { describe, test, expect } from 'bun:test';
import { PathTrie, PathTrieMatch } from '../src/routing/PathTrie';
import { TopicPath } from '../src/routing/TopicPath';

describe('PathTrie', () => {
  describe('Basic Operations', () => {
    test('should create and use default PathTrie', () => {
      const trie = PathTrie.default<string>();
      expect(trie).toBeDefined();
      expect(trie.isEmpty()).toBe(true);
      expect(trie.handlerCount()).toBe(0);
    });

    test('should set and get values', () => {
      const trie = PathTrie.default<string>();
      const topicResult = TopicPath.new('main:services/math/state', 'default');
      expect(topicResult.ok).toBe(true);

      if (topicResult.ok) {
        const topic = topicResult.value;

        // Set a value
        trie.setValues(topic, ['handler1', 'handler2']);
        expect(trie.isEmpty()).toBe(false);
        expect(trie.handlerCount()).toBe(2);

        // Get exact values
        const values = trie.getExactValues(topic);
        expect(values).toEqual(['handler1', 'handler2']);
      }
    });

    test('should set and get single values', () => {
      const trie = PathTrie.default<string>();
      const topicResult = TopicPath.new('main:services/math/add', 'default');
      expect(topicResult.ok).toBe(true);

      if (topicResult.ok) {
        const topic = topicResult.value;

        // Set a single value
        trie.setValue(topic, 'math_handler');
        expect(trie.handlerCount()).toBe(1);

        // Get exact values
        const values = trie.getExactValues(topic);
        expect(values).toEqual(['math_handler']);
      }
    });

    test('should handle batch values', () => {
      const trie = PathTrie.default<string>();
      const topics: TopicPath[] = [];
      const contents = ['handler1', 'handler2'];

      // Create multiple topics
      const topic1Result = TopicPath.new('main:services/math/add', 'default');
      const topic2Result = TopicPath.new('main:services/math/subtract', 'default');

      expect(topic1Result.ok).toBe(true);
      expect(topic2Result.ok).toBe(true);

      if (topic1Result.ok && topic2Result.ok) {
        topics.push(topic1Result.value);
        topics.push(topic2Result.value);

        // Add batch values
        trie.addBatchValues(topics, contents);
        expect(trie.handlerCount()).toBe(4); // 2 topics × 2 handlers each

        // Check first topic
        const values1 = trie.getExactValues(topics[0]);
        expect(values1).toEqual(['handler1', 'handler2']);

        // Check second topic
        const values2 = trie.getExactValues(topics[1]);
        expect(values2).toEqual(['handler1', 'handler2']);
      }
    });
  });

  describe('Template Matching', () => {
    test('should match template patterns', () => {
      const trie = PathTrie.default<string>();

      // Register a template pattern
      const templateResult = TopicPath.new('services/{service_path}/state', 'network1');
      expect(templateResult.ok).toBe(true);

      if (templateResult.ok) {
        const template = templateResult.value;
        trie.setValue(template, 'TEMPLATE');

        // Test with a matching topic
        const topicResult = TopicPath.new('services/math/state', 'network1');
        expect(topicResult.ok).toBe(true);

        if (topicResult.ok) {
          const topic = topicResult.value;
          const matches = trie.find(topic);

          expect(matches).toEqual(['TEMPLATE']);
        }
      }
    });

    test('should extract template parameters', () => {
      const trie = PathTrie.default<string>();

      // Register a template pattern
      const templateResult = TopicPath.new('services/{service_path}/state', 'network1');
      expect(templateResult.ok).toBe(true);

      if (templateResult.ok) {
        const template = templateResult.value;
        trie.setValue(template, 'TEMPLATE');

        // Test with a matching topic
        const topicResult = TopicPath.new('services/math/state', 'network1');
        expect(topicResult.ok).toBe(true);

        if (topicResult.ok) {
          const topic = topicResult.value;
          const matchesWithParams = trie.findMatches(topic);

          expect(matchesWithParams.length).toBe(1);
          expect(matchesWithParams[0].content).toBe('TEMPLATE');
          expect(matchesWithParams[0].params.get('service_path')).toBe('math');
        }
      }
    });

    test('should handle multiple template parameters', () => {
      const trie = PathTrie.default<string>();

      // Register a template with multiple parameters
      const templateResult = TopicPath.new('services/{service_path}/actions/{action}', 'network1');
      expect(templateResult.ok).toBe(true);

      if (templateResult.ok) {
        const template = templateResult.value;
        trie.setValue(template, 'MULTI_PARAMS');

        // Test with a matching topic
        const topicResult = TopicPath.new('services/math/actions/add', 'network1');
        expect(topicResult.ok).toBe(true);

        if (topicResult.ok) {
          const topic = topicResult.value;
          const matchesWithParams = trie.findMatches(topic);

          expect(matchesWithParams.length).toBe(1);
          expect(matchesWithParams[0].content).toBe('MULTI_PARAMS');
          expect(matchesWithParams[0].params.get('service_path')).toBe('math');
          expect(matchesWithParams[0].params.get('action')).toBe('add');
        }
      }
    });
  });

  describe('Wildcard Matching', () => {
    test('should match single wildcard patterns', () => {
      const trie = PathTrie.default<string>();

      // Register a wildcard pattern
      const patternResult = TopicPath.new('services/*/state', 'network1');
      expect(patternResult.ok).toBe(true);

      if (patternResult.ok) {
        const pattern = patternResult.value;
        trie.setValue(pattern, 'WILDCARD');

        // Test with a matching topic
        const topicResult = TopicPath.new('services/math/state', 'network1');
        expect(topicResult.ok).toBe(true);

        if (topicResult.ok) {
          const topic = topicResult.value;
          const matches = trie.find(topic);

          expect(matches).toEqual(['WILDCARD']);
        }
      }
    });

    test('should match multi-wildcard patterns', () => {
      const trie = PathTrie.default<string>();

      // Register a multi-wildcard pattern
      const patternResult = TopicPath.new('services/>', 'network1');
      expect(patternResult.ok).toBe(true);

      if (patternResult.ok) {
        const pattern = patternResult.value;
        trie.setValue(pattern, 'MULTI_WILDCARD');

        // Test with different path lengths
        const topics = ['services/math/state', 'services/math/actions/add', 'services/a/b/c/d/e/f'];

        for (const topicStr of topics) {
          const topicResult = TopicPath.new(topicStr, 'network1');
          expect(topicResult.ok).toBe(true);

          if (topicResult.ok) {
            const topic = topicResult.value;
            const matches = trie.find(topic);
            expect(matches).toEqual(['MULTI_WILDCARD']);
          }
        }
      }
    });

    test('should handle wildcard search', () => {
      const trie = PathTrie.default<string>();

      // Add multiple services
      const services = [
        { path: 'serviceA/action1', handler: 'serviceA/action1' },
        { path: 'serviceA/action2', handler: 'serviceA/action2' },
        { path: 'serviceA/action3', handler: 'serviceA/action3' },
      ];

      for (const service of services) {
        const topicResult = TopicPath.new(service.path, 'network1');
        expect(topicResult.ok).toBe(true);
        if (topicResult.ok) {
          trie.setValue(topicResult.value, service.handler);
        }
      }

      // Test wildcard search
      const searchResult = TopicPath.new('serviceA/*', 'network1');
      expect(searchResult.ok).toBe(true);

      if (searchResult.ok) {
        const searchPattern = searchResult.value;
        const matches = trie.findWildcardMatches(searchPattern);

        expect(matches.length).toBe(3);
        const handlerNames = matches.map(m => m.content);
        expect(handlerNames).toContain('serviceA/action1');
        expect(handlerNames).toContain('serviceA/action2');
        expect(handlerNames).toContain('serviceA/action3');
      }
    });
  });

  describe('Network Isolation', () => {
    test('should maintain network isolation', () => {
      const trie = PathTrie.default<string>();

      // Add same path with different networks
      const topic1Result = TopicPath.new('services/math/state', 'network1');
      const topic2Result = TopicPath.new('services/math/state', 'network2');
      expect(topic1Result.ok).toBe(true);
      expect(topic2Result.ok).toBe(true);

      if (topic1Result.ok && topic2Result.ok) {
        trie.setValue(topic1Result.value, 'MATH_NETWORK1');
        trie.setValue(topic2Result.value, 'MATH_NETWORK2');

        // Find in network1
        const matches1 = trie.find(topic1Result.value);
        expect(matches1).toEqual(['MATH_NETWORK1']);

        // Find in network2
        const matches2 = trie.find(topic2Result.value);
        expect(matches2).toEqual(['MATH_NETWORK2']);
      }
    });

    test('should handle cross-network template matching', () => {
      const trie = PathTrie.default<string>();

      // Add template in network1
      const templateResult = TopicPath.new('services/{service}/events', 'network1');
      expect(templateResult.ok).toBe(true);

      if (templateResult.ok) {
        trie.setValue(templateResult.value, 'EVENTS_TEMPLATE_NETWORK1');

        // Add concrete path in network1
        const concreteResult = TopicPath.new('services/math/events', 'network1');
        expect(concreteResult.ok).toBe(true);

        if (concreteResult.ok) {
          const matches = trie.findMatches(concreteResult.value);
          expect(matches.length).toBe(1);
          expect(matches[0].content).toBe('EVENTS_TEMPLATE_NETWORK1');
          expect(matches[0].params.get('service')).toBe('math');
        }
      }
    });
  });

  describe('Handler Management', () => {
    test('should remove handlers with predicate', () => {
      const trie = PathTrie.default<string>();

      const topicResult = TopicPath.new('main:services/test/handler', 'default');
      expect(topicResult.ok).toBe(true);

      if (topicResult.ok) {
        const topic = topicResult.value;

        // Add multiple handlers
        trie.setValues(topic, ['handler1', 'handler2', 'handler3']);
        expect(trie.handlerCount()).toBe(3);

        // Remove handlers containing '2'
        const removed = trie.removeHandler(topic, h => h.includes('2'));
        expect(removed).toBe(true);

        expect(trie.handlerCount()).toBe(2);

        // Check remaining handlers
        const values = trie.getExactValues(topic);
        expect(values).toEqual(['handler1', 'handler3']);
      }
    });

    test('should handle empty trie operations', () => {
      const trie = PathTrie.default<string>();

      const topicResult = TopicPath.new('main:services/test/handler', 'default');
      expect(topicResult.ok).toBe(true);

      if (topicResult.ok) {
        const topic = topicResult.value;

        // Try to remove from empty trie
        const removed = trie.removeHandler(topic, () => true);
        expect(removed).toBe(false);

        // Try to find in empty trie
        const matches = trie.find(topic);
        expect(matches).toEqual([]);

        // Check if empty
        expect(trie.isEmpty()).toBe(true);
      }
    });
  });

  describe('Advanced Operations', () => {
    test('should get all values', () => {
      const trie = PathTrie.default<string>();

      // Add multiple values
      const topics = [
        'main:services/math/add',
        'main:services/math/subtract',
        'main:services/auth/login',
        'main:services/auth/logout',
      ];

      const handlers = ['handler1', 'handler2'];

      for (const topicStr of topics) {
        const topicResult = TopicPath.new(topicStr, 'default');
        expect(topicResult.ok).toBe(true);
        if (topicResult.ok) {
          trie.setValues(topicResult.value, handlers);
        }
      }

      expect(trie.handlerCount()).toBe(8); // 4 topics × 2 handlers each

      const allValues = trie.getAllValues();
      expect(allValues.length).toBe(8);
      expect(allValues).toContain('handler1');
      expect(allValues).toContain('handler2');
    });

    test('should handle complex patterns with mixed templates and wildcards', () => {
      const trie = PathTrie.default<string>();

      // Template + wildcard
      const pattern1Result = TopicPath.new('services/{service_path}/*/details', 'network1');
      expect(pattern1Result.ok).toBe(true);

      if (pattern1Result.ok) {
        trie.setValue(pattern1Result.value, 'TEMPLATE_THEN_WILDCARD');

        // Test matching
        const topicResult = TopicPath.new('services/math/state/details', 'network1');
        expect(topicResult.ok).toBe(true);

        if (topicResult.ok) {
          const matches = trie.findMatches(topicResult.value);
          expect(matches.length).toBe(1);
          expect(matches[0].content).toBe('TEMPLATE_THEN_WILDCARD');
          expect(matches[0].params.get('service_path')).toBe('math');
        }
      }
    });

    test('should handle multi-wildcard at end', () => {
      const trie = PathTrie.default<string>();

      // Multi-wildcard at end
      const patternResult = TopicPath.new('services/{service_path}/>', 'network1');
      expect(patternResult.ok).toBe(true);

      if (patternResult.ok) {
        trie.setValue(patternResult.value, 'TEMPLATE_THEN_MULTI');

        // Test with deep paths
        const deepPaths = ['services/math/a/b/c', 'services/math/x/y/z/w', 'services/auth/simple'];

        for (const pathStr of deepPaths) {
          const topicResult = TopicPath.new(pathStr, 'network1');
          expect(topicResult.ok).toBe(true);

          if (topicResult.ok) {
            const matches = trie.find(topicResult.value);
            expect(matches).toEqual(['TEMPLATE_THEN_MULTI']);
          }
        }
      }
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty handlers list', () => {
      const trie = PathTrie.default<string>();

      const topicResult = TopicPath.new('main:services/test/empty', 'default');
      expect(topicResult.ok).toBe(true);

      if (topicResult.ok) {
        const topic = topicResult.value;

        // Set empty handlers list
        trie.setValues(topic, []);
        expect(trie.isEmpty()).toBe(true);

        // Try to find
        const matches = trie.find(topic);
        expect(matches).toEqual([]);
      }
    });

    test('should handle duplicate handlers', () => {
      const trie = PathTrie.default<string>();

      const topicResult = TopicPath.new('main:services/test/dups', 'default');
      expect(topicResult.ok).toBe(true);

      if (topicResult.ok) {
        const topic = topicResult.value;

        // Add duplicate handlers
        trie.setValues(topic, ['handler1', 'handler1', 'handler2']);
        expect(trie.handlerCount()).toBe(3);

        const values = trie.getExactValues(topic);
        expect(values).toEqual(['handler1', 'handler1', 'handler2']);
      }
    });

    test('should handle removal of non-existent handlers', () => {
      const trie = PathTrie.default<string>();

      const topicResult = TopicPath.new('main:services/test/none', 'default');
      expect(topicResult.ok).toBe(true);

      if (topicResult.ok) {
        const topic = topicResult.value;

        // Add some handlers
        trie.setValues(topic, ['handler1', 'handler2']);

        // Try to remove non-existent handler
        const removed = trie.removeHandler(topic, h => h === 'nonexistent');
        expect(removed).toBe(false);

        // Handlers should remain unchanged
        expect(trie.handlerCount()).toBe(2);
      }
    });
  });

  describe('Performance Characteristics', () => {
    test('should handle many handlers efficiently', () => {
      const trie = PathTrie.default<string>();

      // Add many handlers
      const topicResult = TopicPath.new('main:services/test/many', 'default');
      expect(topicResult.ok).toBe(true);

      if (topicResult.ok) {
        const topic = topicResult.value;
        const handlers: string[] = [];

        // Create many handlers
        for (let i = 0; i < 100; i++) {
          handlers.push(`handler${i}`);
        }

        trie.setValues(topic, handlers);
        expect(trie.handlerCount()).toBe(100);

        // Test that retrieval is fast (this is more of a smoke test)
        const values = trie.getExactValues(topic);
        expect(values.length).toBe(100);
      }
    });

    test('should handle deep path hierarchies', () => {
      const trie = PathTrie.default<string>();

      // Create a very deep path
      const deepPath =
        'main:' + 'level1/level2/level3/level4/level5/level6/level7/level8/level9/level10';
      const topicResult = TopicPath.new(deepPath, 'default');
      expect(topicResult.ok).toBe(true);

      if (topicResult.ok) {
        const topic = topicResult.value;
        trie.setValue(topic, 'deep_handler');

        // Should be able to find it
        const matches = trie.find(topic);
        expect(matches).toEqual(['deep_handler']);
      }
    });
  });

  describe('Wildcard Search Intermediate Nodes (Rust Compatibility)', () => {
    test('should find handlers at all levels with wildcard search', () => {
      const trie = PathTrie.default<string>();

      // Simulate the users_db service with actions at different levels
      // This replicates the actual bug where replication/get_table_events is not found

      // Action at root level
      const action1Result = TopicPath.new('users_db/execute_query', 'network1');
      expect(action1Result.ok).toBe(true);
      if (action1Result.ok) {
        trie.setValue(action1Result.value, 'users_db/execute_query');
      }

      // Action at intermediate level (replication/get_table_events)
      const action2Result = TopicPath.new('users_db/replication/get_table_events', 'network1');
      expect(action2Result.ok).toBe(true);
      if (action2Result.ok) {
        trie.setValue(action2Result.value, 'users_db/replication/get_table_events');
      }

      // Test wildcard search that should find ALL actions for the service
      const searchResult = TopicPath.new('users_db/*', 'network1');
      expect(searchResult.ok).toBe(true);

      if (searchResult.ok) {
        const searchPattern = searchResult.value;
        const matches = trie.find(searchPattern);

        // This should return BOTH actions, but currently only returns execute_query
        // because replication/get_table_events is not a leaf node in the trie structure
        expect(matches.length).toBe(2);
        expect(matches).toContain('users_db/execute_query');
        expect(matches).toContain('users_db/replication/get_table_events');
      }
    });

    test('should find handlers with multi-wildcard search', () => {
      const trie = PathTrie.default<string>();

      // Action at root level
      const action1Result = TopicPath.new('users_db/execute_query', 'network1');
      expect(action1Result.ok).toBe(true);
      if (action1Result.ok) {
        trie.setValue(action1Result.value, 'users_db/execute_query');
      }

      // Action at intermediate level
      const action2Result = TopicPath.new('users_db/replication/get_table_events', 'network1');
      expect(action2Result.ok).toBe(true);
      if (action2Result.ok) {
        trie.setValue(action2Result.value, 'users_db/replication/get_table_events');
      }

      // Test with multi-wildcard to be thorough
      const searchResult = TopicPath.new('users_db/>', 'network1');
      expect(searchResult.ok).toBe(true);

      if (searchResult.ok) {
        const searchPattern = searchResult.value;
        const matches = trie.find(searchPattern);

        expect(matches.length).toBe(2);
        expect(matches).toContain('users_db/execute_query');
        expect(matches).toContain('users_db/replication/get_table_events');
      }
    });

    test('should handle deep intermediate nodes with wildcard search', () => {
      const trie = PathTrie.default<string>();

      // More complex case with deeper intermediate nodes
      const actions = [
        { path: 'serviceA/action1', handler: 'serviceA/action1' },
        {
          path: 'serviceA/replication/events/get_table_events',
          handler: 'serviceA/replication/events/get_table_events',
        },
        {
          path: 'serviceA/replication/events/get_table_state',
          handler: 'serviceA/replication/events/get_table_state',
        },
        {
          path: 'serviceA/replication/config/get_config',
          handler: 'serviceA/replication/config/get_config',
        },
      ];

      for (const action of actions) {
        const topicResult = TopicPath.new(action.path, 'network1');
        expect(topicResult.ok).toBe(true);
        if (topicResult.ok) {
          trie.setValue(topicResult.value, action.handler);
        }
      }

      // Test wildcard search
      const searchResult = TopicPath.new('serviceA/*', 'network1');
      expect(searchResult.ok).toBe(true);

      if (searchResult.ok) {
        const searchPattern = searchResult.value;
        const matches = trie.find(searchPattern);

        // Should find action1 and all replication actions
        expect(matches.length).toBe(4);
        expect(matches).toContain('serviceA/action1');
        expect(matches).toContain('serviceA/replication/events/get_table_events');
        expect(matches).toContain('serviceA/replication/events/get_table_state');
        expect(matches).toContain('serviceA/replication/config/get_config');
      }
    });

    test('should handle mixed level handlers with wildcard search', () => {
      const trie = PathTrie.default<string>();

      // Mixed levels - some at root, some at intermediate
      const actions = [
        { path: 'serviceB/query', handler: 'serviceB/query' },
        { path: 'serviceB/execute', handler: 'serviceB/execute' },
        { path: 'serviceB/replication/sync', handler: 'serviceB/replication/sync' },
        { path: 'serviceB/replication/events', handler: 'serviceB/replication/events' },
        { path: 'serviceB/admin/config', handler: 'serviceB/admin/config' },
      ];

      for (const action of actions) {
        const topicResult = TopicPath.new(action.path, 'network1');
        expect(topicResult.ok).toBe(true);
        if (topicResult.ok) {
          trie.setValue(topicResult.value, action.handler);
        }
      }

      // Test wildcard search
      const searchResult = TopicPath.new('serviceB/*', 'network1');
      expect(searchResult.ok).toBe(true);

      if (searchResult.ok) {
        const searchPattern = searchResult.value;
        const matches = trie.find(searchPattern);

        // Should find ALL actions at all levels
        expect(matches.length).toBe(5);
        expect(matches).toContain('serviceB/query');
        expect(matches).toContain('serviceB/execute');
        expect(matches).toContain('serviceB/replication/sync');
        expect(matches).toContain('serviceB/replication/events');
        expect(matches).toContain('serviceB/admin/config');
      }
    });
  });

  describe('Cross-Network Search (Rust Compatibility)', () => {
    test('should isolate searches by network for exact matches', () => {
      const trie = PathTrie.default<string>();

      // Add same paths with different networks
      const actions = [
        { path: 'services/math/state', network: 'network1', handler: 'MATH_NETWORK1' },
        { path: 'services/math/state', network: 'network2', handler: 'MATH_NETWORK2' },
        { path: 'services/auth/state', network: 'network1', handler: 'AUTH_NETWORK1' },
        { path: 'services/auth/state', network: 'network2', handler: 'AUTH_NETWORK2' },
      ];

      for (const action of actions) {
        const topicResult = TopicPath.new(action.path, action.network);
        expect(topicResult.ok).toBe(true);
        if (topicResult.ok) {
          trie.setValue(topicResult.value, action.handler);
        }
      }

      // Test exact path matching with network isolation
      const topic1Result = TopicPath.new('services/math/state', 'network1');
      expect(topic1Result.ok).toBe(true);
      if (topic1Result.ok) {
        const matches1 = trie.find(topic1Result.value);
        expect(matches1).toEqual(['MATH_NETWORK1']);
      }

      const topic2Result = TopicPath.new('services/math/state', 'network2');
      expect(topic2Result.ok).toBe(true);
      if (topic2Result.ok) {
        const matches2 = trie.find(topic2Result.value);
        expect(matches2).toEqual(['MATH_NETWORK2']);
      }

      // Test non-existent network
      const topic3Result = TopicPath.new('services/math/state', 'network3');
      expect(topic3Result.ok).toBe(true);
      if (topic3Result.ok) {
        const matches3 = trie.find(topic3Result.value);
        expect(matches3).toEqual([]);
      }
    });

    test('should isolate searches by network for template matches', () => {
      const trie = PathTrie.default<string>();

      // Add template paths with different networks
      const templates = [
        {
          path: 'services/{service}/events',
          network: 'network1',
          handler: 'EVENTS_TEMPLATE_NETWORK1',
        },
        {
          path: 'services/{service}/events',
          network: 'network2',
          handler: 'EVENTS_TEMPLATE_NETWORK2',
        },
      ];

      for (const template of templates) {
        const topicResult = TopicPath.new(template.path, template.network);
        expect(topicResult.ok).toBe(true);
        if (topicResult.ok) {
          trie.setValue(topicResult.value, template.handler);
        }
      }

      // Test template matching with network isolation
      const topic1Result = TopicPath.new('services/math/events', 'network1');
      expect(topic1Result.ok).toBe(true);
      if (topic1Result.ok) {
        const matches1 = trie.find(topic1Result.value);
        expect(matches1).toEqual(['EVENTS_TEMPLATE_NETWORK1']);
      }

      const topic2Result = TopicPath.new('services/math/events', 'network2');
      expect(topic2Result.ok).toBe(true);
      if (topic2Result.ok) {
        const matches2 = trie.find(topic2Result.value);
        expect(matches2).toEqual(['EVENTS_TEMPLATE_NETWORK2']);
      }

      // Test parameter extraction with network isolation
      if (topic1Result.ok) {
        const matchesWithParams = trie.findMatches(topic1Result.value);
        expect(matchesWithParams.length).toBe(1);
        expect(matchesWithParams[0].content).toBe('EVENTS_TEMPLATE_NETWORK1');
        expect(matchesWithParams[0].params.get('service')).toBe('math');
      }
    });

    test('should isolate searches by network for wildcard matches', () => {
      const trie = PathTrie.default<string>();

      // Add wildcard paths with different networks
      const wildcards = [
        { path: 'services/*/config', network: 'network1', handler: 'CONFIG_WILDCARD_NETWORK1' },
        { path: 'services/*/config', network: 'network2', handler: 'CONFIG_WILDCARD_NETWORK2' },
      ];

      for (const wildcard of wildcards) {
        const topicResult = TopicPath.new(wildcard.path, wildcard.network);
        expect(topicResult.ok).toBe(true);
        if (topicResult.ok) {
          trie.setValue(topicResult.value, wildcard.handler);
        }
      }

      // Test wildcard matching with network isolation
      const topic1Result = TopicPath.new('services/math/config', 'network1');
      expect(topic1Result.ok).toBe(true);
      if (topic1Result.ok) {
        const matches1 = trie.find(topic1Result.value);
        expect(matches1).toEqual(['CONFIG_WILDCARD_NETWORK1']);
      }

      const topic2Result = TopicPath.new('services/math/config', 'network2');
      expect(topic2Result.ok).toBe(true);
      if (topic2Result.ok) {
        const matches2 = trie.find(topic2Result.value);
        expect(matches2).toEqual(['CONFIG_WILDCARD_NETWORK2']);
      }
    });
  });

  describe('Complex Template and Wildcard Combinations (Rust Compatibility)', () => {
    test('should handle template then wildcard patterns', () => {
      const trie = PathTrie.default<string>();

      // Template + wildcard
      const patternResult = TopicPath.new('services/{service_path}/*/details', 'network1');
      expect(patternResult.ok).toBe(true);

      if (patternResult.ok) {
        trie.setValue(patternResult.value, 'TEMPLATE_THEN_WILDCARD');

        // Test matching
        const topicResult = TopicPath.new('services/math/state/details', 'network1');
        expect(topicResult.ok).toBe(true);

        if (topicResult.ok) {
          const matches = trie.findMatches(topicResult.value);
          expect(matches.length).toBe(1);
          expect(matches[0].content).toBe('TEMPLATE_THEN_WILDCARD');
          expect(matches[0].params.get('service_path')).toBe('math');
        }
      }
    });

    test('should handle wildcard then template patterns', () => {
      const trie = PathTrie.default<string>();

      // Wildcard + template
      const patternResult = TopicPath.new('services/*/actions/{action}', 'network1');
      expect(patternResult.ok).toBe(true);

      if (patternResult.ok) {
        trie.setValue(patternResult.value, 'WILDCARD_THEN_TEMPLATE');

        // Test matching
        const topicResult = TopicPath.new('services/math/actions/login', 'network1');
        expect(topicResult.ok).toBe(true);

        if (topicResult.ok) {
          const matches = trie.findMatches(topicResult.value);
          expect(matches.length).toBe(1);
          expect(matches[0].content).toBe('WILDCARD_THEN_TEMPLATE');
          expect(matches[0].params.get('action')).toBe('login');
        }
      }
    });

    test('should handle template then multi-wildcard patterns', () => {
      const trie = PathTrie.default<string>();

      // Template + multi-wildcard
      const patternResult = TopicPath.new('services/{service_path}/>', 'network1');
      expect(patternResult.ok).toBe(true);

      if (patternResult.ok) {
        trie.setValue(patternResult.value, 'TEMPLATE_THEN_MULTI');

        // Test with deep paths
        const deepPaths = ['services/math/a/b/c', 'services/math/x/y/z/w', 'services/auth/simple'];

        for (const pathStr of deepPaths) {
          const topicResult = TopicPath.new(pathStr, 'network1');
          expect(topicResult.ok).toBe(true);

          if (topicResult.ok) {
            const matches = trie.find(topicResult.value);
            expect(matches).toContain('TEMPLATE_THEN_MULTI');
          }
        }
      }
    });

    test('should handle multi-wildcard then template patterns', () => {
      const trie = PathTrie.default<string>();

      // Multi-wildcard at end with template earlier
      const patternResult = TopicPath.new('{type}/services/>', 'network1');
      expect(patternResult.ok).toBe(true);

      if (patternResult.ok) {
        trie.setValue(patternResult.value, 'MULTI_THEN_TEMPLATE');

        // Test multi-wildcard then template
        const topicResult = TopicPath.new('internal/services/math/actions/anything', 'network1');
        expect(topicResult.ok).toBe(true);

        if (topicResult.ok) {
          const matches = trie.find(topicResult.value);
          expect(matches).toContain('MULTI_THEN_TEMPLATE');
        }
      }
    });

    test('should handle complex mixed patterns', () => {
      const trie = PathTrie.default<string>();

      // Complex mix of templates and wildcards
      const patternResult = TopicPath.new('{type}/*/services/{name}/actions/*', 'network1');
      expect(patternResult.ok).toBe(true);

      if (patternResult.ok) {
        trie.setValue(patternResult.value, 'COMPLEX_MIX');

        // Test complex mix
        const topicResult = TopicPath.new('internal/any/services/auth/actions/login', 'network1');
        expect(topicResult.ok).toBe(true);

        if (topicResult.ok) {
          const matches = trie.find(topicResult.value);
          expect(matches).toContain('COMPLEX_MIX');
        }
      }
    });
  });

  describe('Template Parameter Edge Cases (Rust Compatibility)', () => {
    test('should handle repeated parameter names', () => {
      const trie = PathTrie.default<string>();

      // Template with repeated parameter name
      const patternResult = TopicPath.new('services/{param}/actions/{param}', 'network1');
      expect(patternResult.ok).toBe(true);

      if (patternResult.ok) {
        trie.setValue(patternResult.value, 'REPEATED_PARAM');

        // Test with repeated parameter
        const topicResult = TopicPath.new('services/param/actions/param', 'network1');
        expect(topicResult.ok).toBe(true);

        if (topicResult.ok) {
          const matches = trie.find(topicResult.value);
          expect(matches).toContain('REPEATED_PARAM');
        }
      }
    });

    test('should handle templates at different positions', () => {
      const trie = PathTrie.default<string>();

      // Template at beginning
      const pattern1Result = TopicPath.new('{type}/services/state', 'network1');
      expect(pattern1Result.ok).toBe(true);
      if (pattern1Result.ok) {
        trie.setValue(pattern1Result.value, 'START_TEMPLATE');
      }

      // Template at end
      const pattern2Result = TopicPath.new('services/state/{param}', 'network1');
      expect(pattern2Result.ok).toBe(true);
      if (pattern2Result.ok) {
        trie.setValue(pattern2Result.value, 'END_TEMPLATE');
      }

      // Template in all positions
      const pattern3Result = TopicPath.new('{a}/{b}/{c}', 'network1');
      expect(pattern3Result.ok).toBe(true);
      if (pattern3Result.ok) {
        trie.setValue(pattern3Result.value, 'ALL_TEMPLATES');
      }

      // Test template at beginning
      const topic1Result = TopicPath.new('internal/services/state', 'network1');
      expect(topic1Result.ok).toBe(true);
      if (topic1Result.ok) {
        const matches1 = trie.find(topic1Result.value);
        expect(matches1).toContain('START_TEMPLATE');
      }

      // Test template at end
      const topic2Result = TopicPath.new('services/state/details', 'network1');
      expect(topic2Result.ok).toBe(true);
      if (topic2Result.ok) {
        const matches2 = trie.find(topic2Result.value);
        expect(matches2).toContain('END_TEMPLATE');
      }

      // Test all templates
      const topic3Result = TopicPath.new('x/y/z', 'network1');
      expect(topic3Result.ok).toBe(true);
      if (topic3Result.ok) {
        const matches3 = trie.find(topic3Result.value);
        expect(matches3).toContain('ALL_TEMPLATES');
      }
    });
  });
});
