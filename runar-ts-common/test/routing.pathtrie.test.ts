import { describe, it, expect } from 'bun:test';
import { PathTrie } from '../src/routing/PathTrie';
import { TopicPath } from '../src/routing/TopicPath';

describe('PathTrie', () => {
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
