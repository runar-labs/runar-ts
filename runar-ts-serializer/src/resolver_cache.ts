import { Result, ok, err } from './result.js';
import { LabelResolver, LabelResolverConfig } from './label_resolver.js';

// ---------------------------------------------------------------------------
// Cache Entry Implementation
// ---------------------------------------------------------------------------

/**
 * Cache entry for a label resolver with metadata
 */
interface CacheEntry {
  resolver: LabelResolver;
  createdAt: number; // Unix timestamp
  lastAccessed: number; // Unix timestamp
}

/**
 * Implementation of cache entry with access tracking
 */
class CacheEntryImpl implements CacheEntry {
  constructor(
    public resolver: LabelResolver,
    public createdAt: number = Date.now() / 1000,
    public lastAccessed: number = Date.now() / 1000
  ) {}

  /**
   * Mark this entry as accessed
   */
  access(): void {
    this.lastAccessed = Date.now() / 1000;
  }

  /**
   * Get the age of this entry in seconds
   */
  get age(): number {
    return Date.now() / 1000 - this.createdAt;
  }
}

// ---------------------------------------------------------------------------
// ResolverCache Implementation
// ---------------------------------------------------------------------------

/**
 * Cache for label resolvers to improve performance
 * Uses simplified cache key strategy: only user_profile_keys (config changes are rare)
 */
export class ResolverCache {
  private cache: Map<string, CacheEntryImpl>;
  private maxSize: number;
  private ttl: number; // seconds

  constructor(maxSize: number, ttlSeconds: number) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttlSeconds;
  }

  /**
   * Create a new resolver cache with default settings
   */
  static newDefault(): ResolverCache {
    return new ResolverCache(1000, 300); // 1000 entries, 5 minutes TTL
  }

  /**
   * Get or create a label resolver, using cache if available
   * Simplified cache key: only user_profile_keys since config changes are rare
   */
  getOrCreate(config: LabelResolverConfig, userProfileKeys: Buffer[]): Result<LabelResolver> {
    const cacheKey = this.generateCacheKey(userProfileKeys);

    // Try to get from cache first
    const existingEntry = this.cache.get(cacheKey);
    if (existingEntry) {
      // Check if entry is still valid
      if (existingEntry.age < this.ttl) {
        existingEntry.access();
        return ok(existingEntry.resolver);
      } else {
        // Remove expired entry
        this.cache.delete(cacheKey);
      }
    }

    // Cache miss - create new resolver
    const resolverResult = LabelResolver.createContextLabelResolver(config, userProfileKeys);
    if (!resolverResult.ok) {
      return resolverResult;
    }

    const resolver = resolverResult.value;

    // Create cache entry
    const newEntry = new CacheEntryImpl(resolver);

    // Insert into cache, handling size limits
    this.insertWithSizeLimit(cacheKey, newEntry);

    return ok(resolver);
  }

  /**
   * Generate a cache key for user profile keys only
   * Uses stable digest for deterministic hashing to match Rust behavior
   */
  private generateCacheKey(userProfileKeys: Buffer[]): string {
    // Create a deterministic hash of the user profile keys
    const sortedKeys = [...userProfileKeys].sort((a, b) => {
      if (a.length !== b.length) return a.length - b.length;
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return a[i] - b[i];
      }
      return 0;
    });

    // For now, use fast JS hash for synchronous operation
    // TODO: Consider implementing async cache key generation if needed
    return this.fastHash(sortedKeys);
  }

  /**
   * Fast JavaScript hash fallback when crypto.subtle is not available
   */
  private fastHash(sortedKeys: Buffer[]): string {
    let hash = 0;
    for (const key of sortedKeys) {
      for (let i = 0; i < key.length; i++) {
        hash = ((hash << 5) - hash + key[i]) | 0;
      }
    }
    return hash.toString(16);
  }

  /**
   * Insert a cache entry, handling size limits
   */
  private insertWithSizeLimit(key: string, entry: CacheEntryImpl): void {
    // If cache is full, remove least recently used entries
    if (this.cache.size >= this.maxSize) {
      this.evictLruEntries();
    }

    this.cache.set(key, entry);
  }

  /**
   * Evict least recently used entries to make room
   */
  private evictLruEntries(): void {
    // When cache is full, we need to make room for at least one new entry
    const targetEvictions = Math.max(1, Math.floor(this.maxSize / 4)); // Evict at least 1, or 25% of entries

    // Collect entries with their access info for sorting
    const entries: Array<[string, number]> = Array.from(this.cache.entries()).map(
      ([key, entry]) => [key, entry.lastAccessed]
    );

    // Sort by last accessed time (oldest first)
    entries.sort(([, a], [, b]) => a - b);

    // Remove the oldest entries
    for (let i = 0; i < targetEvictions; i++) {
      this.cache.delete(entries[i][0]);
    }
  }

  /**
   * Clear expired entries from the cache
   */
  cleanupExpired(): number {
    let removedCount = 0;
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (entry.age >= this.ttl) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      if (this.cache.delete(key)) {
        removedCount++;
      }
    }

    return removedCount;
  }

  /**
   * Get cache statistics
   */
  stats(): CacheStats {
    return {
      totalEntries: this.cache.size,
      maxSize: this.maxSize,
      ttlSeconds: this.ttl,
    };
  }

  /**
   * Clear the entire cache
   */
  clear(): void {
    this.cache.clear();
  }
}

// ---------------------------------------------------------------------------
// Cache Statistics Interface
// ---------------------------------------------------------------------------

/**
 * Statistics for the resolver cache
 */
export interface CacheStats {
  totalEntries: number;
  maxSize: number;
  ttlSeconds: number;
}
