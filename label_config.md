# LabelResolver Design Document for TypeScript Implementation

## Overview

This document outlines the complete design for implementing the LabelResolver system in TypeScript (`runar-ts-serializer`) that provides 100% functional parity with the Rust implementation (`runar-rust/runar-serializer`). The LabelResolver is a critical component for envelope encryption, responsible for mapping labels to the appropriate encryption keys used in the envelope encryption process.

## Current State Analysis

### Rust Implementation (Reference)
The Rust implementation in `runar-rust/runar-serializer/src/traits.rs` provides:

1. **Core Types**:
   - `LabelKeyInfo`: Contains profile public keys and network public key
   - `LabelResolverConfig`: System configuration for label mappings
   - `LabelValue`: Individual label configuration with network key and user key specs
   - `LabelKeyword`: Dynamic resolution keywords (CurrentUser, Custom)
   - `LabelResolver`: Main resolver implementation with concurrent DashMap
   - `ResolverCache`: Performance optimization with TTL and LRU eviction

2. **Key Features**:
   - Concurrent label resolution using DashMap
   - Dynamic user key resolution from request context
   - Network key pre-resolution
   - Comprehensive validation
   - Performance caching with TTL and LRU eviction

### TypeScript Implementation (Current)
The current TypeScript implementation in `runar-ts-serializer` has:

1. **Partial Implementation**:
   - Basic `LabelKeyInfo` interface in decorators (incomplete)
   - `SerializationContext` with placeholder resolver
   - Basic envelope encryption through `CommonKeysInterface`
   - No label resolution logic
   - No caching mechanism

2. **Missing Components**:
   - Complete LabelResolver implementation
   - ResolverCache with TTL and LRU
   - Dynamic user key resolution
   - Label validation system
   - Integration with envelope encryption

## Complete Design Specification

### 1. Core Type Definitions

#### 1.1 LabelKeyInfo
```typescript
export interface LabelKeyInfo {
  /** Profile public keys for user-specific encryption */
  profilePublicKeys: Uint8Array[];
  /** Pre-resolved network public key (optional for user-only labels) */
  networkPublicKey?: Uint8Array;
}
```

#### 1.2 LabelValue
```typescript
export interface LabelValue {
  /** Optional network public key for this label */
  networkPublicKey?: Uint8Array;
  /** Optional user key specification for dynamic resolution */
  userKeySpec?: LabelKeyword;
}
```

#### 1.3 LabelKeyword
```typescript
export enum LabelKeyword {
  /** Maps to current user's profile public keys from request context */
  CurrentUser = 'CurrentUser',
  /** Reserved for future custom resolution functions */
  Custom = 'Custom'
}

export interface LabelKeywordCustom {
  type: LabelKeyword.Custom;
  resolverName: string;
}
```

#### 1.4 LabelResolverConfig
```typescript
export interface LabelResolverConfig {
  /** Static label mappings for system labels */
  labelMappings: Map<string, LabelValue>;
}
```

#### 1.5 KeyMappingConfig
```typescript
export interface KeyMappingConfig {
  /** Maps labels to resolved key information */
  labelMappings: Map<string, LabelKeyInfo>;
}
```

### 2. LabelResolver Implementation

#### 2.1 Core Class
```typescript
export class LabelResolver {
  private mapping: Map<string, LabelKeyInfo>;

  constructor(config: KeyMappingConfig) {
    this.mapping = new Map(config.labelMappings);
  }

  /**
   * Resolve a label to key-info (public key + scope)
   */
  resolveLabelInfo(label: string): Result<LabelKeyInfo | undefined> {
    const info = this.mapping.get(label);
    return ok(info);
  }

  /**
   * Get available labels in current context
   */
  availableLabels(): string[] {
    return Array.from(this.mapping.keys());
  }

  /**
   * Check if a label can be resolved
   */
  canResolve(label: string): boolean {
    return this.mapping.has(label);
  }

  /**
   * Creates a label resolver for a specific context
   * REQUIRES: Every label must have either network key OR user keys OR both
   */
  static createContextLabelResolver(
    systemConfig: LabelResolverConfig,
    userProfileKeys: Uint8Array[] // From request context - empty array means no profile keys
  ): Result<LabelResolver> {
    const mappings = new Map<string, LabelKeyInfo>();

    // Process system label mappings
    for (const [label, labelValue] of systemConfig.labelMappings) {
      let profilePublicKeys: Uint8Array[] = [];

      // Get network key if specified, or use empty for user-only labels
      const networkPublicKey = labelValue.networkPublicKey ?? new Uint8Array();

      // Process user key specification
      if (labelValue.userKeySpec) {
        switch (labelValue.userKeySpec) {
          case LabelKeyword.CurrentUser:
            // Always extend with user profile keys (empty array is fine)
            profilePublicKeys = [...userProfileKeys];
            break;
          case LabelKeyword.Custom:
            // Future: Call custom resolution function
            // For now, profilePublicKeys remains empty
            break;
        }
      }

      // Validation: Label must have either network key OR user keys OR both
      // Empty network key + empty profile keys = invalid label
      if (networkPublicKey.length === 0 && profilePublicKeys.length === 0) {
        return err(new Error(
          `Label '${label}' must specify either network_public_key or user_key_spec (or both)`
        ));
      }

      mappings.set(label, {
        networkPublicKey: networkPublicKey.length > 0 ? networkPublicKey : undefined,
        profilePublicKeys,
      });
    }

    return ok(new LabelResolver({ labelMappings: mappings }));
  }

  /**
   * Validate label resolver configuration
   */
  static validateLabelConfig(config: LabelResolverConfig): Result<void> {
    // Ensure config has required label mappings
    if (config.labelMappings.size === 0) {
      return err(new Error('LabelResolverConfig must contain at least one label mapping'));
    }

    // Validate each label mapping
    for (const [label, labelValue] of config.labelMappings) {
      // Check that label has either network key OR user key spec OR both
      const hasNetworkKey = labelValue.networkPublicKey !== undefined;
      const hasUserSpec = labelValue.userKeySpec !== undefined;

      if (!hasNetworkKey && !hasUserSpec) {
        return err(new Error(
          `Label '${label}' must specify either network_public_key or user_key_spec (or both)`
        ));
      }

      // If network key is provided, validate it's not empty
      if (labelValue.networkPublicKey && labelValue.networkPublicKey.length === 0) {
        return err(new Error(
          `Label '${label}' has empty network_public_key - use undefined for user-only labels`
        ));
      }

      // Validate user key spec if provided
      if (labelValue.userKeySpec) {
        if (labelValue.userKeySpec === LabelKeyword.Custom) {
          // Future: Could validate that custom resolver exists
          // For now, just ensure it's not empty
        }
      }
    }

    return ok(undefined);
  }
}
```

### 3. ResolverCache Implementation

#### 3.1 Cache Entry
```typescript
interface CacheEntry {
  resolver: LabelResolver;
  createdAt: number; // Unix timestamp
  lastAccessed: number; // Unix timestamp
}

class CacheEntryImpl implements CacheEntry {
  constructor(
    public resolver: LabelResolver,
    public createdAt: number = Date.now() / 1000,
    public lastAccessed: number = Date.now() / 1000
  ) {}

  access(): void {
    this.lastAccessed = Date.now() / 1000;
  }

  get age(): number {
    return (Date.now() / 1000) - this.createdAt;
  }
}
```

#### 3.2 Cache Implementation
```typescript
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
  getOrCreate(
    config: LabelResolverConfig,
    userProfileKeys: Uint8Array[]
  ): Result<LabelResolver> {
    const cacheKey = this.generateCacheKey(userProfileKeys);

    // Try to get from cache first
    const entry = this.cache.get(cacheKey);
    if (entry) {
      // Check if entry is still valid
      if (entry.age < this.ttl) {
        entry.access();
        return ok(entry.resolver);
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
    const entry = new CacheEntryImpl(resolver);

    // Insert into cache, handling size limits
    this.insertWithSizeLimit(cacheKey, entry);

    return ok(resolver);
  }

  /**
   * Generate a cache key for user profile keys only
   * Simplified approach: config changes are rare, so only hash user keys
   */
  private generateCacheKey(userProfileKeys: Uint8Array[]): string {
    // Create a deterministic hash of the user profile keys
    const sortedKeys = [...userProfileKeys].sort((a, b) => {
      if (a.length !== b.length) return a.length - b.length;
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return a[i] - b[i];
      }
      return 0;
    });

    // Simple hash function (can be improved with crypto.subtle.digest if available)
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
    const entries: Array<[string, number]> = Array.from(this.cache.entries()).map(([key, entry]) => [
      key,
      entry.lastAccessed
    ]);

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

export interface CacheStats {
  totalEntries: number;
  maxSize: number;
  ttlSeconds: number;
}
```

### 4. Integration with Serialization Context

#### 4.1 Updated SerializationContext
```typescript
export interface SerializationContext {
  keystore?: CommonKeysInterface;
  resolver: LabelResolver; // Now required and properly typed
  networkPublicKey?: Uint8Array; // Pre-resolved network public key
  profilePublicKeys?: Uint8Array[]; // Multiple profile keys
}
```

#### 4.2 Updated DeserializationContext
```typescript
export interface DeserializationContext {
  keystore?: CommonKeysInterface;
  resolver?: LabelResolver; // Now properly typed
  decryptEnvelope?: (eed: Uint8Array) => Result<Uint8Array>;
}
```

### 5. Envelope Encryption Integration

#### 5.1 Encryption Functions
```typescript
/**
 * Container for label-grouped encryption (one per label)
 */
export interface EncryptedLabelGroup {
  /** The label this group was encrypted with */
  label: string;
  /** Envelope-encrypted payload produced by runar-keys */
  envelope?: EnvelopeEncryptedData;
}

/**
 * Encrypt a group of fields that share the same label
 */
export async function encryptLabelGroup<T>(
  label: string,
  fieldsStruct: T,
  keystore: CommonKeysInterface,
  resolver: LabelResolver
): Promise<Result<EncryptedLabelGroup>> {
  try {
    // Serialize the fields within this label group using CBOR
    const { encode } = await import('cbor-x');
    const plainBytes = encode(fieldsStruct);

    // Resolve the label to key info (public key + scope)
    const infoResult = resolver.resolveLabelInfo(label);
    if (!infoResult.ok) {
      return err(new Error(`Failed to resolve label info for '${label}': ${infoResult.error.message}`));
    }

    const info = infoResult.value;
    if (!info) {
      return err(new Error(`Label '${label}' not available in current context`));
    }

    // Convert to Buffer for CommonKeysInterface compatibility
    const dataBuffer = Buffer.from(plainBytes);
    const networkId = info.networkPublicKey ? 'network' : null; // Simplified for now
    const profileKeys = info.profilePublicKeys.map(pk => Buffer.from(pk));

    // Encrypt using envelope encryption
    const encrypted = keystore.encryptWithEnvelope(dataBuffer, networkId, profileKeys);

    return ok({
      label,
      envelope: {
        encryptedData: encrypted,
        networkId: networkId || undefined,
        networkEncryptedKey: new Uint8Array(), // Will be populated by runar-keys
        profileEncryptedKeys: new Map(), // Will be populated by runar-keys
      },
    });
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Attempt to decrypt a label group back into its original struct
 */
export async function decryptLabelGroup<T>(
  encryptedGroup: EncryptedLabelGroup,
  keystore: CommonKeysInterface
): Promise<Result<T>> {
  try {
    if (!encryptedGroup.envelope) {
      return err(new Error('Empty encrypted group'));
    }

    // Attempt decryption using the provided key manager
    const plaintext = keystore.decryptEnvelope(Buffer.from(encryptedGroup.envelope.encryptedData));

    // Deserialize the fields struct from plaintext using CBOR
    const { decode } = await import('cbor-x');
    const fieldsStruct: T = decode(plaintext);

    return ok(fieldsStruct);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}
```

### 6. TypeScript-Specific Optimizations

#### 6.1 Async/Await Support
- All encryption/decryption operations are async to support the native API
- Cache operations remain synchronous for performance
- Error handling uses Result pattern consistently

#### 6.2 Memory Management
- Use Map instead of DashMap for simpler TypeScript implementation
- Automatic garbage collection for expired cache entries
- Efficient Uint8Array handling for binary data

#### 6.3 Type Safety
- Strict TypeScript interfaces matching Rust structs
- Generic type support for encryption/decryption
- Comprehensive error types and Result handling

### 7. Integration Points

#### 7.1 With runar-ts-decorators
- Decorators will use the LabelResolver to determine encryption keys
- Field-level encryption metadata will be resolved through the resolver
- Support for both static and dynamic key resolution

#### 7.2 With runar-ts-serializer
- AnyValue serialization will use the resolver for encryption context
- Wire format will include encryption metadata
- Lazy decryption will use the embedded resolver context

#### 7.3 With runar-nodejs-api
- Native envelope encryption through CommonKeysInterface
- Profile key management through the native API
- Network key resolution through the native API

### 8. Migration Strategy

#### 8.1 Phase 1: Core Implementation
1. Implement LabelResolver and ResolverCache classes
2. Add comprehensive unit tests matching Rust behavior
3. Update type definitions and interfaces

#### 8.2 Phase 2: Integration
1. Update SerializationContext to use LabelResolver
2. Integrate with envelope encryption functions
3. Update AnyValue serialization to use resolver

#### 8.3 Phase 3: Decorator Integration
1. Update decorators to use new LabelResolver
2. Implement field-level encryption resolution
3. Add comprehensive integration tests

### 9. Testing Strategy

#### 9.1 Unit Tests
- LabelResolver creation and validation
- ResolverCache TTL and LRU behavior
- Error handling and edge cases
- Type safety and interface compliance

#### 9.2 Integration Tests
- End-to-end encryption/decryption flows
- Cache performance and eviction
- Cross-language compatibility
- Real keystore integration

#### 9.3 Performance Tests
- Cache hit/miss performance
- Concurrent access patterns
- Memory usage and cleanup
- TTL expiration behavior

### 10. Success Criteria

1. **100% Functional Parity**: All Rust LabelResolver functionality replicated in TypeScript
2. **Performance**: Cache performance within 10% of Rust implementation
3. **Type Safety**: Full TypeScript type coverage with no any types
4. **Error Handling**: Consistent Result pattern matching Rust behavior
5. **Integration**: Seamless integration with existing TypeScript serializer
6. **Testing**: Comprehensive test coverage matching Rust test suite

### 11. Open Questions and Considerations

1. **Custom Resolvers**: Future implementation of LabelKeyword.Custom
2. **Performance**: Whether to implement a more sophisticated caching strategy
3. **Memory**: Whether to implement manual memory management for large caches
4. **Async**: Whether to make cache operations async for better performance
5. **Monitoring**: Whether to add metrics and observability hooks

This design ensures that the TypeScript LabelResolver implementation provides exactly the same functionality, performance characteristics, and error handling as the Rust version, while leveraging TypeScript's strengths in type safety and developer experience.
