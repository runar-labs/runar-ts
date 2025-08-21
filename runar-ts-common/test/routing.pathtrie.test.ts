import { describe, it, expect } from 'bun:test';
import { PathTrie } from '../src/routing/PathTrie';
import { TopicPath } from '../src/routing/TopicPath';

describe('PathTrie', () => {
  describe('Template matching', () => {
    it('matches template patterns and extracts parameters', () => {
      const trie = new PathTrie<string>();

      // Register a template pattern
      trie.setValue(TopicPath.new('services/{service_path}/state', 'network1'), 'TEMPLATE');

      // Test with a matching topic
      const topic = TopicPath.new('services/math/state', 'network1');
      const matches = trie.find(topic);

      expect(matches).toEqual(['TEMPLATE']);

      // Test parameter extraction
      const matchesWithParams = trie.findMatches(topic);
      expect(matchesWithParams.length).toBe(1);
      expect(matchesWithParams[0].content).toBe('TEMPLATE');
      expect(matchesWithParams[0].params.get('service_path')).toBe('math');

      // Test with a different network
      const topic2 = TopicPath.new('services/math/state', 'network2');
      const matches2 = trie.find(topic2);
      expect(matches2).toEqual([]);
    });

    it('handles multiple template parameters', () => {
      const trie = new PathTrie<string>();

      trie.setValue(
        TopicPath.new('services/{service_path}/actions/{action}', 'network1'),
        'MULTI_PARAMS'
      );

      const topic = TopicPath.new('services/math/actions/add', 'network1');
      const matches = trie.findMatches(topic);

      expect(matches.length).toBe(1);
      expect(matches[0].content).toBe('MULTI_PARAMS');
      expect(matches[0].params.get('service_path')).toBe('math');
      expect(matches[0].params.get('action')).toBe('add');
    });

    it('handles template at beginning and end', () => {
      const trie = new PathTrie<string>();

      trie.setValue(TopicPath.new('{type}/services/state', 'network1'), 'START_TEMPLATE');

      trie.setValue(TopicPath.new('services/state/{param}', 'network1'), 'END_TEMPLATE');

      const topic1 = TopicPath.new('internal/services/state', 'network1');
      const topic2 = TopicPath.new('services/state/details', 'network1');

      expect(trie.find(topic1)).toContain('START_TEMPLATE');
      expect(trie.find(topic2)).toContain('END_TEMPLATE');
    });

    it('handles all templates in a path', () => {
      const trie = new PathTrie<string>();

      trie.setValue(TopicPath.new('{a}/{b}/{c}', 'network1'), 'ALL_TEMPLATES');

      const topic = TopicPath.new('x/y/z', 'network1');
      expect(trie.find(topic)).toContain('ALL_TEMPLATES');
    });

    it('handles repeated template parameter names', () => {
      const trie = new PathTrie<string>();

      trie.setValue(
        TopicPath.new('services/{param}/actions/{param}', 'network1'),
        'REPEATED_PARAM'
      );

      const topic = TopicPath.new('services/param/actions/param', 'network1');
      expect(trie.find(topic)).toContain('REPEATED_PARAM');
    });
  });

  describe('Wildcard matching', () => {
    it('handles single wildcard patterns', () => {
      const trie = new PathTrie<string>();

      trie.setValue(TopicPath.new('services/*/state', 'network1'), 'WILDCARD');

      const topic = TopicPath.new('services/math/state', 'network1');
      expect(trie.find(topic)).toEqual(['WILDCARD']);
    });

    it('handles multi-segment wildcard patterns', () => {
      const trie = new PathTrie<string>();

      trie.setValue(TopicPath.new('services/>', 'network1'), 'MULTI_WILDCARD');

      const topic1 = TopicPath.new('services/math', 'network1');
      const topic2 = TopicPath.new('services/math/actions/add', 'network1');
      const topic3 = TopicPath.new('services/auth/login', 'network1');

      expect(trie.find(topic1)).toContain('MULTI_WILDCARD');
      expect(trie.find(topic2)).toContain('MULTI_WILDCARD');
      expect(trie.find(topic3)).toContain('MULTI_WILDCARD');
    });

    it('handles wildcard at beginning', () => {
      const trie = new PathTrie<string>();

      trie.setValue(TopicPath.new('*/state', 'network1'), 'START_WILDCARD');

      const topic1 = TopicPath.new('auth/state', 'network1');
      const topic2 = TopicPath.new('math/state', 'network1');

      expect(trie.find(topic1)).toContain('START_WILDCARD');
      expect(trie.find(topic2)).toContain('START_WILDCARD');
    });

    it('handles wildcard at end', () => {
      const trie = new PathTrie<string>();

      trie.setValue(TopicPath.new('services/state/*', 'network1'), 'END_WILDCARD');

      const topic = TopicPath.new('services/state/details', 'network1');
      expect(trie.find(topic)).toContain('END_WILDCARD');
    });

    it('handles multiple wildcards', () => {
      const trie = new PathTrie<string>();

      trie.setValue(TopicPath.new('services/*/actions/*', 'network1'), 'MULTI_WILDCARDS');

      const topic = TopicPath.new('services/math/actions/add', 'network1');
      expect(trie.find(topic)).toContain('MULTI_WILDCARDS');
    });
  });

  describe('Combined template and wildcard', () => {
    it('handles template then wildcard', () => {
      const trie = new PathTrie<string>();

      trie.setValue(
        TopicPath.new('services/{service_path}/*/details', 'network1'),
        'TEMPLATE_THEN_WILDCARD'
      );

      const topic = TopicPath.new('services/math/state/details', 'network1');
      expect(trie.find(topic)).toContain('TEMPLATE_THEN_WILDCARD');
    });

    it('handles wildcard then template', () => {
      const trie = new PathTrie<string>();

      trie.setValue(
        TopicPath.new('services/*/actions/{action}', 'network1'),
        'WILDCARD_THEN_TEMPLATE'
      );

      const topic = TopicPath.new('services/math/actions/login', 'network1');
      expect(trie.find(topic)).toContain('WILDCARD_THEN_TEMPLATE');
    });

    it('handles template then multi-wildcard', () => {
      const trie = new PathTrie<string>();

      trie.setValue(TopicPath.new('services/{service_path}/>', 'network1'), 'TEMPLATE_THEN_MULTI');

      const topic = TopicPath.new('services/math/a/b/c/d/e', 'network1');
      expect(trie.find(topic)).toContain('TEMPLATE_THEN_MULTI');
    });

    it('handles complex mix of templates and wildcards', () => {
      const trie = new PathTrie<string>();

      trie.setValue(TopicPath.new('{type}/*/services/{name}/actions/*', 'network1'), 'COMPLEX_MIX');

      const topic = TopicPath.new('internal/any/services/auth/actions/login', 'network1');
      expect(trie.find(topic)).toContain('COMPLEX_MIX');
    });
  });

  describe('Wildcard search intermediate nodes', () => {
    it('finds actions at different levels with wildcard search', () => {
      const trie = new PathTrie<string>();

      // Action at root level
      trie.setValue(TopicPath.new('users_db/execute_query', 'network1'), 'users_db/execute_query');

      // Action at intermediate level
      trie.setValue(
        TopicPath.new('users_db/replication/get_table_events', 'network1'),
        'users_db/replication/get_table_events'
      );

      // Test wildcard search that should find ALL actions for the service
      const searchPath = TopicPath.new('users_db/*', 'network1');
      const matches = trie.find(searchPath);

      expect(matches.length).toBe(2);
      expect(matches).toContain('users_db/execute_query');
      expect(matches).toContain('users_db/replication/get_table_events');

      // Also test with multi-wildcard
      const searchPathMulti = TopicPath.new('users_db/>', 'network1');
      const matchesMulti = trie.find(searchPathMulti);

      expect(matchesMulti.length).toBe(2);
      expect(matchesMulti).toContain('users_db/execute_query');
      expect(matchesMulti).toContain('users_db/replication/get_table_events');
    });

    it('handles deep intermediate nodes', () => {
      const trie = new PathTrie<string>();

      trie.setValue(TopicPath.new('serviceA/action1', 'network1'), 'serviceA/action1');

      trie.setValue(
        TopicPath.new('serviceA/replication/events/get_table_events', 'network1'),
        'serviceA/replication/events/get_table_events'
      );

      trie.setValue(
        TopicPath.new('serviceA/replication/events/get_table_state', 'network1'),
        'serviceA/replication/events/get_table_state'
      );

      trie.setValue(
        TopicPath.new('serviceA/replication/config/get_config', 'network1'),
        'serviceA/replication/config/get_config'
      );

      const searchPath = TopicPath.new('serviceA/*', 'network1');
      const matches = trie.find(searchPath);

      expect(matches.length).toBe(4);
      expect(matches).toContain('serviceA/action1');
      expect(matches).toContain('serviceA/replication/events/get_table_events');
      expect(matches).toContain('serviceA/replication/events/get_table_state');
      expect(matches).toContain('serviceA/replication/config/get_config');
    });

    it('handles mixed levels with wildcard search', () => {
      const trie = new PathTrie<string>();

      trie.setValue(TopicPath.new('serviceB/query', 'network1'), 'serviceB/query');

      trie.setValue(TopicPath.new('serviceB/execute', 'network1'), 'serviceB/execute');

      trie.setValue(
        TopicPath.new('serviceB/replication/sync', 'network1'),
        'serviceB/replication/sync'
      );

      trie.setValue(
        TopicPath.new('serviceB/replication/events', 'network1'),
        'serviceB/replication/events'
      );

      trie.setValue(TopicPath.new('serviceB/admin/config', 'network1'), 'serviceB/admin/config');

      const searchPath = TopicPath.new('serviceB/*', 'network1');
      const matches = trie.find(searchPath);

      expect(matches.length).toBe(5);
      expect(matches).toContain('serviceB/query');
      expect(matches).toContain('serviceB/execute');
      expect(matches).toContain('serviceB/replication/sync');
      expect(matches).toContain('serviceB/replication/events');
      expect(matches).toContain('serviceB/admin/config');
    });
  });

  describe('Network isolation', () => {
    it('isolates networks properly', () => {
      const trie = new PathTrie<string>();

      // Add same paths with different networks
      trie.setValue(TopicPath.new('services/math/state', 'network1'), 'MATH_NETWORK1');

      trie.setValue(TopicPath.new('services/math/state', 'network2'), 'MATH_NETWORK2');

      trie.setValue(TopicPath.new('services/auth/state', 'network1'), 'AUTH_NETWORK1');

      trie.setValue(TopicPath.new('services/auth/state', 'network2'), 'AUTH_NETWORK2');

      // Test exact path matching with network isolation
      const topic1 = TopicPath.new('services/math/state', 'network1');
      const topic2 = TopicPath.new('services/math/state', 'network2');

      expect(trie.find(topic1)).toEqual(['MATH_NETWORK1']);
      expect(trie.find(topic2)).toEqual(['MATH_NETWORK2']);
    });

    it('isolates template paths by network', () => {
      const trie = new PathTrie<string>();

      trie.setValue(
        TopicPath.new('services/{service}/events', 'network1'),
        'EVENTS_TEMPLATE_NETWORK1'
      );

      trie.setValue(
        TopicPath.new('services/{service}/events', 'network2'),
        'EVENTS_TEMPLATE_NETWORK2'
      );

      const topic1 = TopicPath.new('services/math/events', 'network1');
      const topic2 = TopicPath.new('services/math/events', 'network2');

      expect(trie.find(topic1)).toEqual(['EVENTS_TEMPLATE_NETWORK1']);
      expect(trie.find(topic2)).toEqual(['EVENTS_TEMPLATE_NETWORK2']);
    });

    it('isolates wildcard paths by network', () => {
      const trie = new PathTrie<string>();

      trie.setValue(TopicPath.new('services/*/config', 'network1'), 'CONFIG_WILDCARD_NETWORK1');

      trie.setValue(TopicPath.new('services/*/config', 'network2'), 'CONFIG_WILDCARD_NETWORK2');

      const topic1 = TopicPath.new('services/math/config', 'network1');
      const topic2 = TopicPath.new('services/math/config', 'network2');

      expect(trie.find(topic1)).toEqual(['CONFIG_WILDCARD_NETWORK1']);
      expect(trie.find(topic2)).toEqual(['CONFIG_WILDCARD_NETWORK2']);
    });

    it('returns empty for non-existent networks', () => {
      const trie = new PathTrie<string>();

      trie.setValue(TopicPath.new('services/math/state', 'network1'), 'MATH_NETWORK1');

      const topic = TopicPath.new('services/math/state', 'network3');
      expect(trie.find(topic)).toEqual([]);
    });
  });

  describe('Cross-network search', () => {
    it('find_matches only returns matches for specific network', () => {
      const trie = new PathTrie<string>();

      trie.setValue(TopicPath.new('services/math/state', 'network1'), 'MATH_NETWORK1');

      trie.setValue(TopicPath.new('services/math/state', 'network2'), 'MATH_NETWORK2');

      trie.setValue(TopicPath.new('services/*/events', 'network1'), 'EVENTS_WILDCARD_NETWORK1');

      trie.setValue(
        TopicPath.new('services/{service}/config', 'network2'),
        'CONFIG_TEMPLATE_NETWORK2'
      );

      const topic1 = TopicPath.new('services/math/state', 'network1');
      const topic2 = TopicPath.new('services/math/state', 'network2');

      const matches1 = trie.findMatches(topic1);
      const matches2 = trie.findMatches(topic2);

      expect(matches1.length).toBe(1);
      expect(matches1[0].content).toBe('MATH_NETWORK1');

      expect(matches2.length).toBe(1);
      expect(matches2[0].content).toBe('MATH_NETWORK2');
    });

    it('handles wildcard matching with network isolation', () => {
      const trie = new PathTrie<string>();

      trie.setValue(TopicPath.new('services/*/events', 'network1'), 'EVENTS_WILDCARD_NETWORK1');

      const topic = TopicPath.new('services/math/events', 'network1');
      const matches = trie.findMatches(topic);

      expect(matches.length).toBe(1);
      expect(matches[0].content).toBe('EVENTS_WILDCARD_NETWORK1');
    });

    it('handles template matching with parameter extraction', () => {
      const trie = new PathTrie<string>();

      trie.setValue(
        TopicPath.new('services/{service}/config', 'network2'),
        'CONFIG_TEMPLATE_NETWORK2'
      );

      const topic = TopicPath.new('services/math/config', 'network2');
      const matches = trie.findMatches(topic);

      expect(matches.length).toBe(1);
      expect(matches[0].content).toBe('CONFIG_TEMPLATE_NETWORK2');
      expect(matches[0].params.get('service')).toBe('math');
    });
  });

  describe('Basic operations', () => {
    it('sets and finds exact matches', () => {
      const trie = new PathTrie<string>();
      const topic = TopicPath.new('net:service/action', 'default');
      trie.setValue(topic, 'handler1');

      const matches = trie.findMatches(TopicPath.new('net:service/action', 'default'));
      expect(matches.map(m => m.content)).toEqual(['handler1']);
    });

    it('handles single wildcard', () => {
      const trie = new PathTrie<string>();
      trie.setValue(TopicPath.new('net:service/*/state', 'default'), 'h');

      const matches = trie.findMatches(TopicPath.new('net:service/x/state', 'default'));
      expect(matches.length).toBeGreaterThan(0);
    });

    it('handles multi wildcard', () => {
      const trie = new PathTrie<string>();
      trie.setValue(TopicPath.new('net:events/>', 'default'), 'h');

      const matches = trie.findMatches(TopicPath.new('net:events/a/b/c', 'default'));
      expect(matches.length).toBeGreaterThan(0);
    });

    it('handles template params', () => {
      const trie = new PathTrie<string>();
      trie.setValue(TopicPath.new('net:users/{id}/profile', 'default'), 'h');

      const matches = trie.findMatches(TopicPath.new('net:users/123/profile', 'default'));
      expect(matches[0]?.content).toBe('h');
    });
  });
});
