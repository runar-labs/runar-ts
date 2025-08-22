import { TopicPath } from './TopicPath.js';
import { Result, ok, err } from '../error';

export type PathTrieMatch<T> = { content: T; params: Map<string, string> };

class TrieNode<T> {
  content: T[] = [];
  children: Map<string, TrieNode<T>> = new Map();
  wildcardChild: TrieNode<T> | null = null;
  templateChild: TrieNode<T> | null = null;
  templateParamName: string | null = null;
  multiWildcard: T[] = [];
  count = 0;
}

export class PathTrie<T> {
  private networks: Map<string, TrieNode<T>> = new Map();
  private totalCount = 0;

  static default<T>(): PathTrie<T> {
    return new PathTrie<T>();
  }

  setValues(topic: TopicPath, contentList: T[]): void {
    const net = topic.networkId();
    const root =
      this.networks.get(net) ??
      (this.networks.set(net, new TrieNode<T>()), this.networks.get(net)!);
    const segments = topic.getSegments();
    const added = this.setValuesInternal(root, segments, 0, contentList);
    this.totalCount += added;
  }

  // Return the exact content stored at this topic path without wildcard expansion
  getExactValues(topic: TopicPath): T[] {
    const root = this.networks.get(topic.networkId());
    if (!root) return [];
    const segments = topic.getSegments();
    const node = this.getExactNode(root, segments, 0);
    if (!node) return [];
    const last = segments[segments.length - 1];
    if (last === '>') {
      return [...node.multiWildcard];
    }
    return [...node.content];
  }

  private getExactNode(node: TrieNode<T>, segments: string[], index: number): TrieNode<T> | null {
    if (index >= segments.length) {
      return node;
    }
    const seg = segments[index]!;
    if (seg === '*') {
      return node.wildcardChild ? this.getExactNode(node.wildcardChild, segments, index + 1) : null;
    }
    if (seg === '>') {
      // multi wildcard content is stored at this node's multiWildcard, not deeper
      return node; // exact leaf for '>' uses current node
    }
    if (seg.startsWith('{') && seg.endsWith('}')) {
      return node.templateChild ? this.getExactNode(node.templateChild, segments, index + 1) : null;
    }
    const child = node.children.get(seg);
    return child ? this.getExactNode(child, segments, index + 1) : null;
  }

  setValue(topic: TopicPath, content: T): void {
    this.setValues(topic, [content]);
  }

  addBatchValues(topics: TopicPath[], contents: T[]): void {
    for (const t of topics) this.setValues(t, contents);
  }

  removeValues(topic: TopicPath): void {
    const net = topic.networkId();
    const root = this.networks.get(net);
    if (!root) return;
    const segments = topic.getSegments();
    const removed = this.removeValuesInternal(root, segments, 0);
    this.totalCount -= removed;
  }

  findMatches(topic: TopicPath): Array<PathTrieMatch<T>> {
    if (topic.isPattern()) return this.findWildcardMatches(topic);
    const root = this.networks.get(topic.networkId());
    const results: Array<PathTrieMatch<T>> = [];
    if (!root) return results;
    const params = new Map<string, string>();
    this.findMatchesInternal(root, topic.getSegments(), 0, results, params);
    return results;
  }

  findWildcardMatches(pattern: TopicPath): Array<PathTrieMatch<T>> {
    const root = this.networks.get(pattern.networkId());
    const results: Array<PathTrieMatch<T>> = [];
    if (!root) return results;
    this.collectWildcardMatches(root, pattern.getSegments(), 0, results);
    return results;
  }

  // For backward compatibility - get just the handlers without parameters
  find(topic: TopicPath): T[] {
    return this.findMatches(topic).map(m => m.content);
  }

  // Remove handlers that match a predicate for a specific topic path
  removeHandler<F extends (value: T) => boolean>(topic: TopicPath, predicate: F): boolean {
    const networkId = topic.networkId();
    const networkTrie = this.networks.get(networkId);
    if (!networkTrie) return false;
    return this.removeHandlerInternal(networkTrie, topic.getSegments(), 0, predicate);
  }

  // Check if this trie is empty (has no handlers or children)
  isEmpty(): boolean {
    return this.totalCount === 0;
  }

  // Get the total number of handlers in the trie
  handlerCount(): number {
    return this.totalCount;
  }

  // Get all values from the trie
  getAllValues(): T[] {
    const results: T[] = [];
    for (const networkTrie of this.networks.values()) {
      this.collectAllValuesInternal(networkTrie, results);
    }
    return results;
  }

  private setValuesInternal(
    node: TrieNode<T>,
    segments: string[],
    index: number,
    handlers: T[]
  ): number {
    if (index >= segments.length) {
      const prev = node.content.length;
      node.content = [...handlers];
      node.count += node.content.length - prev;
      return node.content.length - prev;
    }
    const seg = segments[index]!;
    if (seg === '>') {
      const prev = node.multiWildcard.length;
      node.multiWildcard = [...handlers];
      node.count += node.multiWildcard.length - prev;
      return node.multiWildcard.length - prev;
    }
    if (seg === '*') {
      if (!node.wildcardChild) node.wildcardChild = new TrieNode<T>();
      const before = node.wildcardChild.count;
      const added = this.setValuesInternal(node.wildcardChild, segments, index + 1, handlers);
      node.count += node.wildcardChild.count - before;
      return added;
    }
    if (seg.startsWith('{') && seg.endsWith('}')) {
      if (!node.templateChild) node.templateChild = new TrieNode<T>();
      node.templateParamName = seg.slice(1, -1);
      const before = node.templateChild.count;
      const added = this.setValuesInternal(node.templateChild, segments, index + 1, handlers);
      node.count += node.templateChild.count - before;
      return added;
    }
    const child =
      node.children.get(seg) ??
      (node.children.set(seg, new TrieNode<T>()), node.children.get(seg)!);
    const before = child.count;
    const added = this.setValuesInternal(child, segments, index + 1, handlers);
    node.count += child.count - before;
    return added;
  }

  private removeValuesInternal(node: TrieNode<T>, segments: string[], index: number): number {
    if (index >= segments.length) {
      const prev = node.content.length;
      node.content = [];
      node.count -= prev;
      return prev;
    }
    const seg = segments[index]!;
    if (seg === '*') {
      if (!node.wildcardChild) return 0;
      const before = node.wildcardChild.count;
      const removed = this.removeValuesInternal(node.wildcardChild, segments, index + 1);
      node.count -= before - node.wildcardChild.count;
      return removed;
    }
    if (seg.startsWith('{') && seg.endsWith('}')) {
      if (!node.templateChild) return 0;
      const before = node.templateChild.count;
      const removed = this.removeValuesInternal(node.templateChild, segments, index + 1);
      node.count -= before - node.templateChild.count;
      return removed;
    }
    const child = node.children.get(seg);
    if (!child) return 0;
    const before = child.count;
    const removed = this.removeValuesInternal(child, segments, index + 1);
    node.count -= before - child.count;
    return removed;
  }

  private findMatchesInternal(
    node: TrieNode<T>,
    segments: string[],
    index: number,
    results: Array<PathTrieMatch<T>>,
    params: Map<string, string>
  ): void {
    if (index >= segments.length) {
      for (const c of node.content) results.push({ content: c, params: new Map(params) });
      // Multi wildcard at this level also applies
      for (const c of node.multiWildcard) results.push({ content: c, params: new Map(params) });
      return;
    }
    const seg = segments[index]!;
    // Exact child
    const child = node.children.get(seg);
    if (child) this.findMatchesInternal(child, segments, index + 1, results, params);
    // Template child
    if (node.templateChild && node.templateParamName) {
      params.set(node.templateParamName, seg);
      this.findMatchesInternal(node.templateChild, segments, index + 1, results, params);
      params.delete(node.templateParamName);
    }
    // Wildcard child matches exactly one segment
    if (node.wildcardChild)
      this.findMatchesInternal(node.wildcardChild, segments, index + 1, results, params);
    // Multi wildcard at this level matches any tail
    for (const c of node.multiWildcard) results.push({ content: c, params: new Map(params) });
  }

  private collectWildcardMatches(
    node: TrieNode<T>,
    patternSegments: string[],
    index: number,
    results: Array<PathTrieMatch<T>>
  ): void {
    if (index >= patternSegments.length) {
      // Collect everything from this node down
      this.collectAllHandlers(node, results);
      return;
    }
    const seg = patternSegments[index]!;
    if (seg === '*') {
      this.collectAllHandlers(node, results);
      return;
    }
    if (seg === '>') {
      this.collectAllHandlers(node, results);
      return;
    }
    if (seg.startsWith('{') && seg.endsWith('}')) {
      if (node.templateChild)
        this.collectWildcardMatches(node.templateChild, patternSegments, index + 1, results);
      if (node.wildcardChild)
        this.collectWildcardMatches(node.wildcardChild, patternSegments, index + 1, results);
      for (const [, child] of node.children)
        this.collectWildcardMatches(child, patternSegments, index + 1, results);
      return;
    }
    const child = node.children.get(seg);
    if (child) this.collectWildcardMatches(child, patternSegments, index + 1, results);
  }

  private collectAllHandlers(node: TrieNode<T>, results: Array<PathTrieMatch<T>>): void {
    for (const c of node.content) results.push({ content: c, params: new Map() });
    for (const c of node.multiWildcard) results.push({ content: c, params: new Map() });
    if (node.wildcardChild) this.collectAllHandlers(node.wildcardChild, results);
    if (node.templateChild) this.collectAllHandlers(node.templateChild, results);
    for (const [, child] of node.children) this.collectAllHandlers(child, results);
  }

  private removeHandlerInternal<F extends (value: T) => boolean>(
    node: TrieNode<T>,
    segments: string[],
    index: number,
    predicate: F
  ): boolean {
    if (index >= segments.length) {
      // We've reached the end of the path
      const initialLen = node.content.length;
      node.content = node.content.filter(h => !predicate(h));
      const removed = initialLen - node.content.length;
      node.count -= removed;
      return removed > 0;
    }

    const segment = segments[index]!;
    let removed = false;

    if (segment === '>') {
      // Multi-wildcard - remove from multi_wildcard_handlers
      const initialLen = node.multiWildcard.length;
      node.multiWildcard = node.multiWildcard.filter(h => !predicate(h));
      const removedCount = initialLen - node.multiWildcard.length;
      node.count -= removedCount;
      removed = removedCount > 0;
    } else if (segment === '*') {
      // Single wildcard - delegate to wildcard child if it exists
      if (node.wildcardChild) {
        removed = this.removeHandlerInternal(node.wildcardChild, segments, index + 1, predicate);
      }
    } else if (segment.startsWith('{') && segment.endsWith('}')) {
      // Template parameter - delegate to template child if it exists
      if (node.templateChild) {
        removed = this.removeHandlerInternal(node.templateChild, segments, index + 1, predicate);
      }
    } else {
      // Literal segment - delegate to the appropriate child if it exists
      const child = node.children.get(segment);
      if (child) {
        removed = this.removeHandlerInternal(child, segments, index + 1, predicate);
      }
    }

    return removed;
  }

  // Internal method to collect all values from this trie and its children
  private collectAllValuesInternal(node: TrieNode<T>, results: T[]): void {
    // Add content from this node
    results.push(...node.content);
    results.push(...node.multiWildcard);

    // Recursively collect from children
    for (const child of node.children.values()) {
      this.collectAllValuesInternal(child, results);
    }

    if (node.wildcardChild) {
      this.collectAllValuesInternal(node.wildcardChild, results);
    }

    if (node.templateChild) {
      this.collectAllValuesInternal(node.templateChild, results);
    }
  }





  /**
   * Internal recursive implementation of remove_handler
   */


  /**
   * Check if this trie is empty (has no handlers or children)
   * Equivalent to Rust's is_empty method
   */


  /**
   * Check if a node and its children are empty
   */
  private isNodeEmpty(node: TrieNode<T>): boolean {
    if (node.content.length > 0 || node.multiWildcard.length > 0) {
      return false;
    }

    for (const child of node.children.values()) {
      if (!this.isNodeEmpty(child)) {
        return false;
      }
    }

    if (node.wildcardChild && !this.isNodeEmpty(node.wildcardChild)) {
      return false;
    }

    if (node.templateChild && !this.isNodeEmpty(node.templateChild)) {
      return false;
    }

    return true;
  }





  }
  