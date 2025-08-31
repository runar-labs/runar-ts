import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ResolverCache, CacheStats } from '../src/resolver_cache.js';
import { LabelResolverConfig, LabelKeyword } from '../src/label_resolver.js';

describe('ResolverCache', () => {
  const createTestConfig = (): LabelResolverConfig => ({
    labelMappings: new Map([
      [
        'system',
        {
          networkPublicKey: new Uint8Array([1, 2, 3, 4]),
          userKeySpec: undefined,
        },
      ],
      [
        'user',
        {
          networkPublicKey: new Uint8Array([5, 6, 7, 8]), // Add network key for user label
          userKeySpec: LabelKeyword.CurrentUser,
        },
      ],
    ]),
  });

  describe('constructor and defaults', () => {
    it('should create cache with custom settings', () => {
      const cache = new ResolverCache(100, 60);
      const stats = cache.stats();
      assert.strictEqual(stats.maxSize, 100);
      assert.strictEqual(stats.ttlSeconds, 60);
      assert.strictEqual(stats.totalEntries, 0);
    });

    it('should create cache with default settings', () => {
      const cache = ResolverCache.newDefault();
      const stats = cache.stats();
      assert.strictEqual(stats.maxSize, 1000);
      assert.strictEqual(stats.ttlSeconds, 300);
      assert.strictEqual(stats.totalEntries, 0);
    });
  });

  describe('getOrCreate', () => {
    it('should create new resolver on cache miss', () => {
      const cache = new ResolverCache(10, 60);
      const config = createTestConfig();
      const userKeys = [new Uint8Array([5, 6, 7])];

      const result = cache.getOrCreate(config, userKeys);
      assert(result.ok, 'Should create resolver successfully');

      const stats = cache.stats();
      assert.strictEqual(stats.totalEntries, 1);
    });

    it('should return cached resolver on cache hit', () => {
      const cache = new ResolverCache(10, 60);
      const config = createTestConfig();
      const userKeys = [new Uint8Array([5, 6, 7])];

      // First call - cache miss
      const result1 = cache.getOrCreate(config, userKeys);
      assert(result1.ok, 'First call should succeed');
      const resolver1 = result1.value;

      // Second call - cache hit
      const result2 = cache.getOrCreate(config, userKeys);
      assert(result2.ok, 'Second call should succeed');
      const resolver2 = result2.value;

      // Should be the same resolver instance
      assert.strictEqual(resolver1, resolver2, 'Should return cached resolver');

      const stats = cache.stats();
      assert.strictEqual(stats.totalEntries, 1);
    });

    it('should handle different user keys as different cache entries', () => {
      const cache = new ResolverCache(10, 60);
      const config = createTestConfig();
      const userKeys1 = [new Uint8Array([5, 6, 7])];
      const userKeys2 = [new Uint8Array([8, 9, 10])];

      // Create resolvers with different user keys
      const result1 = cache.getOrCreate(config, userKeys1);
      const result2 = cache.getOrCreate(config, userKeys2);

      assert(result1.ok, 'First resolver creation should succeed');
      assert(result2.ok, 'Second resolver creation should succeed');
      assert.notStrictEqual(result1.value, result2.value, 'Should create different resolvers');

      const stats = cache.stats();
      assert.strictEqual(stats.totalEntries, 2);
    });

    it('should handle empty user keys correctly', () => {
      const cache = new ResolverCache(10, 60);
      const config = createTestConfig();
      const emptyUserKeys: Uint8Array[] = [];

      const result = cache.getOrCreate(config, emptyUserKeys);
      assert(result.ok, 'Should create resolver with empty user keys');

      const stats = cache.stats();
      assert.strictEqual(stats.totalEntries, 1);
    });
  });

  describe('TTL expiration', () => {
    it('should expire entries after TTL', () => {
      const cache = new ResolverCache(10, 1); // 1 second TTL
      const config = createTestConfig();
      const userKeys = [new Uint8Array([5, 6, 7])];

      // Create resolver
      const result1 = cache.getOrCreate(config, userKeys);
      assert(result1.ok, 'Should create resolver');

      // Wait for TTL to expire
      return new Promise<void>(resolve => {
        setTimeout(() => {
          // Try to get from cache - should create new resolver
          const result2 = cache.getOrCreate(config, userKeys);
          assert(result2.ok, 'Should create new resolver after TTL expiration');
          assert.notStrictEqual(
            result1.value,
            result2.value,
            'Should be different resolver instances'
          );

          const stats = cache.stats();
          assert.strictEqual(stats.totalEntries, 1); // Old entry should be removed

          resolve();
        }, 1100); // Wait slightly more than 1 second
      });
    });

    it('should remove expired entries on access', () => {
      const cache = new ResolverCache(10, 1); // 1 second TTL
      const config = createTestConfig();
      const userKeys = [new Uint8Array([5, 6, 7])];

      // Create resolver
      const result1 = cache.getOrCreate(config, userKeys);
      assert(result1.ok, 'Should create resolver');

      // Wait for TTL to expire
      return new Promise<void>(resolve => {
        setTimeout(() => {
          // Access expired entry - should be removed and new one created
          const result2 = cache.getOrCreate(config, userKeys);
          assert(result2.ok, 'Should create new resolver after TTL expiration');

          const stats = cache.stats();
          assert.strictEqual(stats.totalEntries, 1); // Only new entry should remain

          resolve();
        }, 1100);
      });
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used entries when cache is full', () => {
      const cache = new ResolverCache(3, 60); // Small cache size
      const config = createTestConfig();

      // Fill the cache
      const userKeys1 = [new Uint8Array([1])];
      const userKeys2 = [new Uint8Array([2])];
      const userKeys3 = [new Uint8Array([3])];

      const result1 = cache.getOrCreate(config, userKeys1);
      const result2 = cache.getOrCreate(config, userKeys2);
      const result3 = cache.getOrCreate(config, userKeys3);

      assert(result1.ok && result2.ok && result3.ok, 'All resolvers should be created');
      assert.strictEqual(cache.stats().totalEntries, 3);

      // Add one more - should trigger LRU eviction
      const userKeys4 = [new Uint8Array([4])];
      const result4 = cache.getOrCreate(config, userKeys4);
      assert(result4.ok, 'Fourth resolver should be created');

      // Should have evicted some entries (at least 1, or 25% of entries)
      const stats = cache.stats();
      assert(stats.totalEntries <= 3, 'Cache should not exceed max size');
    });

    it('should track access times correctly', () => {
      const cache = new ResolverCache(10, 60);
      const config = createTestConfig();
      const userKeys = [new Uint8Array([5, 6, 7])];

      // Create resolver
      const result1 = cache.getOrCreate(config, userKeys);
      assert(result1.ok, 'Should create resolver');

      // Wait a bit
      return new Promise<void>(resolve => {
        setTimeout(() => {
          // Access again - should update last accessed time
          const result2 = cache.getOrCreate(config, userKeys);
          assert(result2.ok, 'Should return cached resolver');
          assert.strictEqual(result1.value, result2.value, 'Should be same resolver');

          resolve();
        }, 100);
      });
    });
  });

  describe('cleanup and statistics', () => {
    it('should cleanup expired entries', () => {
      const cache = new ResolverCache(10, 1); // 1 second TTL
      const config = createTestConfig();
      const userKeys = [new Uint8Array([5, 6, 7])];

      // Create resolver
      const result = cache.getOrCreate(config, userKeys);
      assert(result.ok, 'Should create resolver');
      assert.strictEqual(cache.stats().totalEntries, 1);

      // Wait for TTL to expire
      return new Promise<void>(resolve => {
        setTimeout(() => {
          // Cleanup expired entries
          const removedCount = cache.cleanupExpired();
          assert.strictEqual(removedCount, 1, 'Should remove 1 expired entry');
          assert.strictEqual(cache.stats().totalEntries, 0, 'Cache should be empty');

          resolve();
        }, 1100);
      });
    });

    it('should clear all entries', () => {
      const cache = new ResolverCache(10, 60);
      const config = createTestConfig();
      const userKeys1 = [new Uint8Array([1])];
      const userKeys2 = [new Uint8Array([2])];

      // Add some entries
      cache.getOrCreate(config, userKeys1);
      cache.getOrCreate(config, userKeys2);

      assert.strictEqual(cache.stats().totalEntries, 2, 'Should have 2 entries');

      // Clear cache
      cache.clear();
      assert.strictEqual(cache.stats().totalEntries, 0, 'Cache should be empty');
    });

    it('should provide accurate statistics', () => {
      const maxSize = 50;
      const ttl = 120;
      const cache = new ResolverCache(maxSize, ttl);

      const stats = cache.stats();
      assert.strictEqual(stats.maxSize, maxSize);
      assert.strictEqual(stats.ttlSeconds, ttl);
      assert.strictEqual(stats.totalEntries, 0);

      // Add an entry
      const config = createTestConfig();
      const userKeys = [new Uint8Array([1, 2, 3])];
      cache.getOrCreate(config, userKeys);

      const statsAfter = cache.stats();
      assert.strictEqual(statsAfter.totalEntries, 1);
      assert.strictEqual(statsAfter.maxSize, maxSize);
      assert.strictEqual(statsAfter.ttlSeconds, ttl);
    });
  });

  describe('cache key generation', () => {
    it('should generate consistent cache keys for same user keys', () => {
      const cache = new ResolverCache(10, 60);
      const config = createTestConfig();
      const userKeys1 = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])];
      const userKeys2 = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])]; // Same keys

      // Create resolvers with same user keys
      const result1 = cache.getOrCreate(config, userKeys1);
      const result2 = cache.getOrCreate(config, userKeys2);

      assert(result1.ok && result2.ok, 'Both resolvers should be created');
      assert.strictEqual(result1.value, result2.value, 'Should return cached resolver');
      assert.strictEqual(cache.stats().totalEntries, 1, 'Should have only 1 cache entry');
    });

    it('should generate different cache keys for different user keys', () => {
      const cache = new ResolverCache(10, 60);
      const config = createTestConfig();
      const userKeys1 = [new Uint8Array([1, 2, 3])];
      const userKeys2 = [new Uint8Array([4, 5, 6])]; // Different keys

      // Create resolvers with different user keys
      const result1 = cache.getOrCreate(config, userKeys1);
      const result2 = cache.getOrCreate(config, userKeys2);

      assert(result1.ok && result2.ok, 'Both resolvers should be created');
      assert.notStrictEqual(result1.value, result2.value, 'Should be different resolvers');
      assert.strictEqual(cache.stats().totalEntries, 2, 'Should have 2 cache entries');
    });

    it('should handle empty user keys consistently', () => {
      const cache = new ResolverCache(10, 60);
      const config = createTestConfig();
      const emptyKeys1: Uint8Array[] = [];
      const emptyKeys2: Uint8Array[] = [];

      // Create resolvers with empty user keys
      const result1 = cache.getOrCreate(config, emptyKeys1);
      const result2 = cache.getOrCreate(config, emptyKeys2);

      assert(result1.ok && result2.ok, 'Both resolvers should be created');
      assert.strictEqual(result1.value, result2.value, 'Should return cached resolver');
      assert.strictEqual(cache.stats().totalEntries, 1, 'Should have only 1 cache entry');
    });
  });
});
