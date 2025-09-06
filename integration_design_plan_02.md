## Engineering Principles (Enforced)

- Keystore role separation (mobile vs node)
  - Role comes from `NodeConfig.role: 'frontend' | 'backend'` (TS only). Once initialized, role MUST NOT change for the lifetime of the process.
  - Use distinct wrappers (`KeysWrapperMobile` for frontend, `KeysWrapperNode` for backend) created by `KeystoreFactory` based on `NodeConfig.role`.
  - No mixing of mobile and node logic anywhere. Calling a method not supported by the current role MUST return a `Result` error (no fallback, no internal branching to emulate the other role).

- No fallbacks without explicit approval
  - Code must be predictable. Do not introduce implicit fallbacks or hidden heuristics.
  - Any fallback behavior must be explicitly documented, validated, and pre‑approved. Otherwise, fail fast with a precise `Result` error.

- Error handling (never throw; no empty catch)
  - Public APIs return `Result<T, Error>`; do not throw for expected error paths.
  - When calling external/native APIs that may throw, wrap in `try/catch`; either resolve the condition or return a meaningful `Error` in `Result`.
  - Never use empty catch blocks; never swallow errors.

---

## Integration Design Plan (02): TypeScript LabelResolver Parity with Rust

### Objective

Achieve 100% functional and API parity between the TypeScript LabelResolver ecosystem and the Rust implementation, with strict TypeScript best practices, maintainability, and production readiness.

## 1. Current State Analysis

### 1.1 What's Already Implemented (TypeScript)

- LabelResolver core (`runar-ts-serializer/src/label_resolver.ts`):
  - Types: `LabelKeyInfo`, `LabelValue`, `LabelKeyword`, `LabelResolverConfig`, `KeyMappingConfig`.
  - Class: `LabelResolver` with `resolveLabelInfo`, `availableLabels`, `canResolve`, `createContextLabelResolver`, `validateLabelConfig`.
  - Parity: Mirrors Rust structures and validation semantics including CurrentUser dynamic resolution and strict validation for empty config and empty network keys.
- ResolverCache (`runar-ts-serializer/src/resolver_cache.ts`):
  - LRU+TTL cache with size-based eviction and expiration cleanup, keying by user profile public keys.
  - Parity: Matches Rust's intention (age/lastAccessed, TTL, LRU) and cache key derived from sorted keys.
- Encryption helpers (`runar-ts-serializer/src/encryption.ts`):
  - ✅ **COMPLETE**: `encryptLabelGroupSync`, `decryptLabelGroupSync`, `decryptBytesSync` with full `CommonKeysInterface` integration.
  - ✅ **COMPLETE**: `EncryptedLabelGroup` stores raw CBOR bytes directly from native API, ensuring 100% Rust parity and optimal performance.
- Wire and registry (`runar-ts-serializer/src/wire.ts`, `runar-ts-serializer/src/registry.ts`):
  - Wire header scaffolding and primitive wire-name registration mirroring Rust (`string`, numeric types, `bytes`, `json`), plus container naming.
- Node integration (TypeScript) (`runar-ts-node/src/node.ts`):
  - `createSerializationContext()` exists but `resolver` is `undefined` (TODO), and network/profile key fields are absent.
  - Local request/subscribe/publish paths are implemented with `AnyValue` integration.
- Tests present for label resolver, resolver cache, wire types, and encryption roundtrips.

### 1.2 What's Missing / Gaps (vs. Rust)

- SerializationContext parity:
  - Rust: `SerializationContext { keystore: Arc<KeyStore>, resolver: Arc<LabelResolver>, network_public_key: Vec<u8>, profile_public_keys: Vec<Vec<u8>> }`.
  - TS: `SerializationContext { keystore?, resolver, networkPublicKey?, profilePublicKeys? }` but not consistently used by `AnyValue` serialization.
- ArcValue/AnyValue parity:
  - Rust `ArcValue` supports: category byte, encrypted flag, wire type name, lazy deserialization with keystore-aware decrypt paths, registry-driven encrypt/decrypt for structs/containers, JSON conversion pathways, and direct `serialize(context)` envelope.
  - TS AnyValue implementation is not present in `src` (only tests refer to it). Need a complete, byte-compatible serializer/deserializer and lazy flow identical to Rust.
- Envelope encryption parity:
  - ✅ **RESOLVED**: TS `encryptLabelGroupSync` now stores raw CBOR bytes directly from native API, eliminating intermediate object representation and ensuring 100% compatibility with Rust's approach.
  - ✅ **RESOLVED**: `decryptLabelGroupSync` uses raw CBOR bytes directly for decryption, matching Rust's behavior exactly.
  - ✅ **RESOLVED**: API fully aligned with Rust `runar-keys` crate using `networkPublicKey` instead of `network_id`.
- LabelResolver error messages:
  - Ensure exact string parity with Rust for validation and resolve errors.
- Registry parity:
  - Rust maintains: decrypt/encrypt registries by TypeId, JSON converters by rust-name and wire-name, and rust<->wire type mappings, including parameterized container wire name handling.
  - TS registry has basic mapping; needs: encrypt/decrypt registration hooks, wire-name to runtime-type lookup, JSON conversion by wire-name, container wire-name adapters.
- Node integration:
  - Rust remote service uses `ResolverCache` and `SerializationContext` (with pre-resolved network key and request context profile keys). TS Node `createSerializationContext()` is incomplete; remote services are not integrated yet.
- Transport/QUIC integration:
  - Rust transport and nodejs-api fully support envelope decrypt/encrypt operations; TS wiring must enforce encryption for external messages and pass pre-resolved keys and dynamic label resolver into serialization.
- Decorator system parity:
  - Rust macros `Encrypt`, `Plain` auto-register encryptor/decryptor and type names. TS decorators package exists but the integration into registry and AnyValue flows needs full linkage.

### 1.3 Architecture Assessment

- TS structure mirrors Rust layering: serializer core, registry, encryption helpers, node integration.
- Strengths: Clear separation, result monad usage, planned compatibility with Node native API.
- Gaps: AnyValue feature completeness, strict envelope structure parity, system-wide `SerializationContext` creation and propagation in Node/transport paths.

### 1.4 Test Coverage Assessment (TS)

- Present: label resolver, resolver cache, wire header/type name, encryption envelope roundtrip smoke tests.
- Missing: Byte-for-byte AnyValue serialization/deserialization against Rust vectors; container encryption/decryption for lists/maps; decorator-driven encrypted struct parity; node remote service encryption end-to-end; QUIC transport message encryption parity.

## 2. Component-by-Component Design

### 2.1 LabelResolver Core

- Interface parity (Rust → TS mapping):
  - Rust `LabelKeyInfo { profile_public_keys: Vec<Vec<u8>>, network_public_key: Option<Vec<u8>> }` → TS `LabelKeyInfo { profilePublicKeys: Uint8Array[]; networkPublicKey?: Uint8Array }`.
  - Rust `LabelResolverConfig { label_mappings: HashMap<String, LabelValue> }` → TS `LabelResolverConfig { labelMappings: Map<string, LabelValue> }`.
  - Rust `LabelValue { network_public_key: Option<Vec<u8>>, user_key_spec: Option<LabelKeyword> }` → TS `LabelValue { networkPublicKey?: Uint8Array, userKeySpec?: LabelKeyword }`.
  - Rust `LabelKeyword::{CurrentUser, Custom(String)}` → TS `LabelKeyword.CurrentUser`, `LabelKeyword.Custom` plus optional string parameter in future.
  - Methods: `resolve_label_info`, `available_labels`, `can_resolve`, `create_context_label_resolver`, `validate_label_config` have semantic parity; TS must align exact error strings.
- Validation logic:
  - Enforce non-empty config, network key non-empty if present, presence of either network key or user key spec (or both), and support `Custom` keyword placeholder validation.
- Context creation:
  - `createContextLabelResolver(systemConfig, userProfileKeys)` replicates Rust: for each label resolve pre-resolved `networkPublicKey` (use empty for user-only), attach all `userProfileKeys` when `CurrentUser`.
- Error handling:
  - Stabilize error messages to exactly match Rust tests (e.g., "Label '{label}' must specify either network_public_key or user_key_spec (or both)").

### 2.2 ResolverCache Implementation

- Cache strategy:
  - `maxSize`, `ttlSeconds`; entries store `createdAt`, `lastAccessed` and are evicted via LRU or TTL cleanup; aligns with Rust `ResolverCache` (age via `Instant`, atomic last-access time).
- Cache key generation:
  - Deterministic hashing of sorted user profile keys (byte-wise). Replace ad-hoc JS hash with stable string digest:
    - Use `crypto.subtle.digest('SHA-256', concat(sortedKeys))` when available, with a synchronous fallback using a fast JS hash for Node without subtle.
  - Sorting by length then lexicographical byte compare to match Rust's `DefaultHasher` stable ordering; document any differences and ensure cross-language cache behavior is not externally observable.
- Concurrency:
  - Single-threaded Node minimizes races; ensure methods are pure and idempotent. For shared contexts, avoid mutation of inputs. Provide `cleanupExpired()` and `clear()`.
- Performance:
  - Add micro-benchmarks mirroring Rust tests: baseline creation, cache hits/misses, TTL, LRU, and concurrent access using worker threads for contention simulation.

### 2.3 Complete Encryption and Decorator System Design

This section consolidates all encryption-related functionality into one comprehensive design, ensuring 100% Rust parity and eliminating any contradictory or outdated information.

#### 2.3.1 Core Encryption Architecture

**Envelope Encryption (Raw CBOR Bytes Only)**:
- ✅ **IMPLEMENTED**: TS stores only raw CBOR bytes from native keys layer (no intermediate object representation)
- ✅ **IMPLEMENTED**: `encryptLabelGroupSync(label, fieldsStruct, keystore, resolver)`:
  - Serialize fields with CBOR; look up `LabelKeyInfo` via `resolver.resolveLabelInfo`
  - Call native `encryptWithEnvelope(data, networkPublicKey?, profilePublicKeys[])` returning raw CBOR bytes
  - Store raw CBOR bytes directly in `EncryptedLabelGroup.envelopeCbor` for optimal performance and correctness
- ✅ **IMPLEMENTED**: `decryptLabelGroupSync(group, keystore)`:
  - Use `group.envelopeCbor` directly for decryption via `keystore.decryptEnvelope`
  - Then CBOR-decode to fields struct

**SerializationContext**:
- ✅ **IMPLEMENTED**: TS `SerializationContext` finalized as:
  - `{ keystore: CommonKeysInterface; resolver: LabelResolver; networkPublicKey: Uint8Array; profilePublicKeys: Uint8Array[] }`
  - All properties required (not optional) when encrypting

**API Alignment**: ✅ **COMPLETE**: All encryption methods use `networkPublicKey: Uint8Array` instead of `network_id: string`, aligning with updated NodeJS native API

#### 2.3.2 Access Control and Keystore Capabilities

**Keystore Role Separation**:
- **Mobile Keystore**: Has user profile keys + network public key (NO network private key)
- **Node Keystore**: Has network private keys (NO user profile keys)
- **Decryption Priority**: Mobile keystore tries profile keys first, then network keys; Node keystore only tries network keys

**Label Resolution and Access Control**:
- ✅ **IMPLEMENTED**: Ensure labels map to keys exactly as Rust (error when label missing)
- **Multi-Key Labels**: Labels with both profile and network keys can be decrypted by EITHER keystore type
- **Single-Key Labels**: Labels with only profile keys can only be decrypted by mobile keystore; labels with only network keys can only be decrypted by node keystore

**Access Control Logic (CRITICAL)**:
- **Decryption Strategy**: When `decryptLabelGroupSync` is called, it MUST attempt decryption using the provided keystore
- **Success Path**: If decryption succeeds, return the decrypted fields struct
- **Failure Path**: If decryption fails due to missing keys, return `Result<T, Error>` with appropriate error
- **Field Assignment**: In the generated `decryptWithKeystore` method, only assign fields if `decryptLabelGroupSync` succeeds
- **Default Values**: If decryption fails, fields remain at their default values (empty strings, zero numbers, etc.)

#### 2.3.3 Decorator System Design

**@Encrypt Decorator**:
- Generate companion encrypted class (e.g., `EncryptedTestProfile`) and auto-register:
  - decryptor: `register_decrypt<Plain, Enc>()` equivalent in TS registry
  - encryptor: `register_encrypt<Plain, Enc>()` using a function that accepts `Plain`, context keys, label resolver
  - JSON converters and `registerTypeName` for both plain and encrypted representations with proper wire names

**@runar Field Decorator**:
- **Syntax**: `@runar("<LABEL>")` where `<LABEL>` is a user-defined string label
- **Flexibility**: Labels are completely user-defined and can be any string (e.g., `"user"`, `"system"`, `"search"`, `"customLabel"`, `"admin"`, etc.)
- **Label Resolution**: The label resolver maps these user-defined labels to actual public keys via `LabelResolverConfig`
- **Examples**:
  - `@runar("user")` - encrypts field with user profile keys
  - `@runar("system")` - encrypts field with system/network keys
  - `@runar("search")` - encrypts field with search-specific keys
  - `@runar("admin")` - encrypts field with admin-specific keys
  - `@runar("customLabel")` - encrypts field with custom label keys
- **No Restrictions**: No hardcoded label names; developers define their own labels
- **Rust Parity**: Aligned with Rust macro semantics where labels are user-defined strings

**Type Registration**:
- On module import or decorator evaluation, register both the plain and encrypted types in wire-name registry and JSON converters

#### 2.3.4 Nested Encrypted Objects Design

**Key Understanding**:
1. **Labels apply to fields, not to the entire nested object**
2. **Nested objects are encrypted/decrypted using the same rules as top-level objects**
3. **Access control is enforced at every level**
4. **`| null` requirement ONLY applies to nested encrypted objects with labels**
5. **Primitive fields with labels use default values (`''`, `0`, etc.) when not accessible**
6. **Plain fields (no labels) are always accessible but still encrypted IF the object has @Encrypt decorator**
7. **AnyValue is never used inside objects as nested values**
8. **Nested objects can only be accessed when decrypting the top level**

**Type Declaration Rules**:
```typescript
@Encrypt
export class NestedEncryptedProfile {
  public id: string; // plain field
  
  @runar('user')
  public profile: TestProfile | null; // Nested encrypted object with label - must be nullable
  
  @runar('system')
  public metadata: SystemMetadata | null; // Nested encrypted object with label - must be nullable
  
  @runar('user')
  public userPrivateData: string; // Primitive with label - uses default value when not accessible
  
  @runar('user')
  public nestedData: TestProfile | null; // Nested encrypted object with label - must be nullable
  
  constructor(
    id: string, 
    profile: TestProfile | null, 
    metadata: SystemMetadata | null, 
    userPrivateData: string,
    nestedData: TestProfile | null
  ) {
    this.id = id;
    this.profile = profile;
    this.metadata = metadata;
    this.userPrivateData = userPrivateData;
    this.nestedData = nestedData;
  }
}
```

**Field Classification**:
- **Nested Encrypted Objects with Labels**: Must be declared as `Type | null`
- **Primitive Fields with Labels**: Use default values when not accessible (`''`, `0`, `false`, etc.)
- **Plain Fields (no labels)**: Always accessible, still encrypted IF the object has @Encrypt decorator
- **AnyValue**: Never used inside objects as nested values

**Access Control Examples**:

**Backend (Node) - Only System Keys**:
```typescript
// Decrypting NestedEncryptedProfile
const decrypted = encryptedProfile.decryptWithKeystore(nodeKeystore);
// Result:
// {
//   id: "parent-123",
//   profile: null,                    // ❌ No access to 'user' label
//   metadata: SystemMetadata,         // ✅ Access to 'system' label
//   userPrivateData: "",              // ❌ No access to 'user' label (primitive default)
//   nestedData: null                  // ❌ No access to 'user' label
// }

// The metadata field is accessible and its internal fields follow access control:
// {
//   id: "metadata-123",
//   name: "metadata name",            // ✅ Access to 'system' label
//   privateData: "",                  // ❌ No access to 'user' label (primitive default)
//   email: "metadata@example.com",    // ✅ Access to 'search' label (mapped to both user and system)
//   systemMetadata: "metadata data"   // ✅ Access to 'system_only' label
// }
```

**Frontend (Mobile) - Only User Keys**:
```typescript
// Decrypting NestedEncryptedProfile
const decrypted = encryptedProfile.decryptWithKeystore(mobileKeystore);
// Result:
// {
//   id: "parent-123",
//   profile: TestProfile,            // ✅ Access to 'user' label
//   metadata: null,                  // ❌ No access to 'system' label
//   userPrivateData: "user data",    // ✅ Access to 'user' label
//   nestedData: TestProfile          // ✅ Access to 'user' label
// }

// The profile and nestedData fields are accessible and their internal fields follow access control:
// {
//   id: "nested-123",
//   name: "",                        // ❌ No access to 'system' label (primitive default)
//   privateData: "nested private",   // ✅ Access to 'user' label
//   email: "nested@example.com",     // ✅ Access to 'search' label (mapped to both user and system)
//   systemMetadata: ""               // ❌ No access to 'system_only' label (primitive default)
// }
```

**Encryption Flow**:
```typescript
// For each field in the label group:
if (fieldValue && typeof fieldValue === 'object' && 
    'encryptWithKeystore' in fieldValue) {
  // This is a nested encrypted object
  const nestedEncryptResult = fieldValue.encryptWithKeystore(keystore, resolver);
  if (nestedEncryptResult.ok) {
    labelFieldsInstance[fieldName] = nestedEncryptResult.value; // Store encrypted companion
  } else {
    return err(new Error(`Failed to encrypt nested object for field '${fieldName}'`));
  }
} else {
  labelFieldsInstance[fieldName] = fieldValue; // Store plain value
}
```

**Decryption Flow**:
```typescript
// For each field in the decrypted label group:
if (fieldValue && typeof fieldValue === 'object' && 
    'decryptWithKeystore' in fieldValue) {
  // This is a nested encrypted object
  const nestedDecryptResult = fieldValue.decryptWithKeystore(keystore, logger);
  if (nestedDecryptResult.ok) {
    plainInstance[fieldName] = nestedDecryptResult.value; // Store decrypted object
  } else {
    // Set to null for nested objects with labels, empty object for plain fields
    plainInstance[fieldName] = fieldHasLabel ? null : new (fieldType.constructor)();
  }
} else {
  plainInstance[fieldName] = fieldValue; // Store plain value
}
```

**Decorator Validation Rules**:
```typescript
// In the @Encrypt decorator, validate field types
for (const field of fieldEncryptions) {
  const fieldName = field.propertyKey.toString();
  const fieldValue = instance[fieldName];
  
  if (fieldValue && typeof fieldValue === 'object' && 
      'encryptWithKeystore' in fieldValue) {
    // This is a nested encrypted object
    const fieldType = getFieldType(constructor, fieldName);
    const hasLabel = fieldEncryptions.some(f => f.propertyKey === field.propertyKey);
    
    if (hasLabel && !fieldType.includes('null') && !fieldType.includes('undefined')) {
      throw new Error(
        `Field '${fieldName}' contains a nested encrypted object with a label but is not declared as nullable. ` +
        `Labeled nested encrypted objects must be declared as 'Type | null' to handle access control.`
      );
    }
  }
}
```

**Type Generation Rules (Corrected)**:
```typescript
// Generated types should reflect the nullable requirements
export interface EncryptedNestedEncryptedProfile {
  id: string;
  profile: EncryptedTestProfile | null;  // Labeled nested object - nullable
  metadata: EncryptedSystemMetadata | null; // Labeled nested object - nullable
  userPrivateData: string;               // Labeled primitive - non-nullable
  nestedData: EncryptedTestProfile | null; // Labeled nested object - nullable
}

// NOTE: The class itself is the proper type to be used - no DecryptedNestedEncryptedProfile needed
// The class itself should NOT be exported in the generated file to avoid confusion
```

**AnyValue Integration Rules**:
- **AnyValue is never used inside objects as nested values**
- **Nested objects can only be accessed when decrypting the top level**
- **No intermediate AnyValue operations on nested fields**
- **Top-level operations**: `anyValueInstance.asType<Encrypted<Type>>()` works
- **Field-level operations**: `topLevel.field` cannot retrieve encrypted versions

#### 2.3.5 Build-Time Type Generation

**CRITICAL SOLUTION**: Use build-time type generation to create proper TypeScript interfaces for encrypted companion types, eliminating the need for `any` types.

**Problem**: Decorators generate runtime classes but cannot export TypeScript types, forcing use of `any` types.

**Solution**: Build script that analyzes TypeScript AST and generates proper type definitions.

**Implementation**:
1. **AST Analysis**: Parse source files to find `@Encrypt` decorators and `@runar` field decorators
2. **Type Generation**: Generate TypeScript interfaces for encrypted companion types
3. **Build Integration**: Run type generation before TypeScript compilation

**Generated Output Example**:
```typescript
// Generated types - do not edit manually
// This file is automatically generated by the build script

import { EncryptedLabelGroup } from 'runar-ts-serializer/src/encryption.js';

export interface EncryptedTestProfile {
  id: string; // plain field
  system_encrypted: EncryptedLabelGroup; // encrypted label group (contains: { name: 'Test User' })
  user_encrypted: EncryptedLabelGroup; // encrypted label group (contains: { privateData: 'secret123' })
  search_encrypted: EncryptedLabelGroup; // encrypted label group (contains: { email: 'test@example.com' })
  system_only_encrypted: EncryptedLabelGroup; // encrypted label group (contains: { systemMetadata: 'system_data' })
}

export interface EncryptedNestedEncryptedProfile {
  id: string;
  profile: EncryptedTestProfile | null;  // Labeled nested object - nullable
  metadata: EncryptedSystemMetadata | null; // Labeled nested object - nullable
  userPrivateData: string;               // Labeled primitive - non-nullable
  nestedData: EncryptedTestProfile | null; // Labeled nested object - nullable
}

// NOTE: Classes are NOT exported in generated files to avoid confusion
// The class itself is the proper type to be used
```

**Build Integration**:
```json
{
  "scripts": {
    "generate-types": "bun run build-script.ts",
    "build-with-types": "bun run generate-types && tsc"
  }
}
```

**Benefits**:
- ✅ **No More `any` Types**: Full type safety throughout
- ✅ **IntelliSense Support**: IDEs provide proper autocomplete
- ✅ **Compile-Time Validation**: TypeScript catches errors at build time
- ✅ **No Runtime Overhead**: Types are generated at build time
- ✅ **Maintainable**: Generated types are automatically updated

#### 2.3.6 Synchronous Semantics and Error Handling

**All public decorator methods are synchronous and return `Result`**:
- `encryptWithKeystore(keystore: CommonKeysInterface, resolver: LabelResolver): Result<EncryptedT>`
- `decryptWithKeystore(keystore: CommonKeysInterface): Result<T>`

**Error Handling (never throw; no empty catch)**:
- Public APIs return `Result<T, Error>`; do not throw for expected error paths
- When calling external/native APIs that may throw, wrap in `try/catch`; either resolve the condition or return a meaningful `Error` in `Result`
- Never use empty catch blocks; never swallow errors

**No fallbacks without explicit approval**:
- Code must be predictable. Do not introduce implicit fallbacks or hidden heuristics
- Any fallback behavior must be explicitly documented, validated, and pre‑approved. Otherwise, fail fast with a precise `Result` error

### 2.4 AnyValue/ArcValue Implementation

- Wire format:
  - Byte structure must match Rust exactly:
    - Byte 0: category (0..6), Byte 1: isEncrypted (0/1), Byte 2: typeName length (0..255), Bytes [3..]: typeName UTF-8, then payload.
  - Implement TS `AnyValue` API that mirrors Rust `ArcValue` operations:
    - Constructors: `null`, `newPrimitive`, `newList`, `newMap`, `newStruct`, `newBytes`, `newJson`.
    - `serialize(context?)`: if `context` present, encrypt envelope with `context.networkPublicKey` and all `context.profilePublicKeys` via `keystore.encryptWithEnvelope` after applying encryptors for structs and element-level encryption for lists/maps.
    - `deserialize(bytes, keystore?)`: parse header, if encrypted unwrap `EnvelopeEncryptedData` with `keystore`, then either eager decode (primitives/bytes) or create a lazy holder with original buffer and offsets.
  - Container support:
    - Lists/Maps wire-name parameterization and element encryption via registry encryptors, matching Rust lookups by TypeId. TS uses decorators registry to map constructors to wire names and encrypt/decrypt functions.
  - Lazy deserialization:
    - Store `keystore` and `encrypted` flags in the lazy holder; on `asTypeRef<T>()`, attempt direct decode to `T`, else use decryptor registry fallback with `keystore` requirement.

### 2.5 Node Integration

- NodeConfig additions:
  - Require `LabelResolverConfig` and provide `getLabelResolverConfig()`.
  - Add `role: 'frontend' | 'backend'` field (defaults to 'backend' for TypeScript).
- Node constructor:
  - Initialize `ResolverCache.newDefault()`.
  - Derive `networkPublicKey` via keys wrapper for the node's default network when needed.
- Serialization Context creation:
  - Implement `createSerializationContext(userProfileKeys?: Uint8Array[])`:
    - Use `resolverCache.getOrCreate(config, userProfileKeys ?? [])`.
    - Resolve `networkPublicKey` from keystore for the node's default network id.
    - Return fully-populated `SerializationContext`.
- Remote Services:
  - Implement `RemoteService` in TS Node following Rust:
    - During request: build `SerializationContext` with cached resolver and pre-resolved keys, call `AnyValue.serialize(context)` to encrypt, send via transport.
    - On response: `AnyValue.deserialize(bytes, keystore)` with node's keystore.

### 2.6 Native API Integration

- Transport Layer:
  - Wrap `runar-nodejs-api` `Transport` and `Keys` in TS for strong typing (`CommonKeysInterface`).
  - Enforce external messages to be encrypted by always providing `SerializationContext` in network paths.
- Discovery system:
  - Integrate with `Discovery` API to populate peer info, mirroring Rust flow (non-blocking event stream).
- Network messages:
  - Ensure message payloads carry `network_public_key` and `profile_public_keys` metadata as in Rust transport.
- Error propagation:
  - Use `Result` monad in TS for all public APIs; map native errors to structured `Error` with identical messages where tests assert specific strings.

## 3. Implementation Phases

### Phase 1: Core Components (2 weeks)

- Finalize `SerializationContext` in TS; make fields required where encryption is performed.
- Tighten `LabelResolver` error messages and config validation to match Rust strings.
- Upgrade `ResolverCache` key generation to stable digest; add stats/getters parity fields.
- Implement `encryption.ts` to round-trip full `EnvelopeEncryptedData` CBOR; align `encryptLabelGroup`/`decryptLabelGroup` with Rust error paths.
- Add unit tests mirroring Rust `label_resolver_test.rs` and `cache_performance_test.rs` semantics.

### Phase 2: AnyValue Integration (2 weeks)

- Implement TS `AnyValue` with full wire format and lazy flows identical to Rust `ArcValue`:
  - `serialize(context?)` encryption path and container-aware element encryption.
  - `deserialize(bytes, keystore?)` with outer envelope decrypt and registry fallback.
- Wire-name resolution for containers and primitives from registry.
- Tests: vectors parity with Rust serializer vectors, container positive/negative, JSON conversion pathways.

### Phase 3: Decorator System (2 weeks)

- Implement `@Encrypt` and `@runar` decorators to generate encrypted companions and register encrypt/decrypt functions plus wire names and JSON converters.
- Integrate decorator-driven registry with `AnyValue` flows.
- Tests: decorator registry parity, end-to-end encrypt/decrypt for generated types.

### Phase 4: Node Integration (3 weeks)

- Extend `runar-ts-node`:
  - `NodeConfig` to carry `LabelResolverConfig` and add `role?: 'frontend' | 'backend'` field.
  - Add `ResolverCache` instance and `createSerializationContext()` that returns a fully populated context.
  - Implement `KeystoreFactory` for role-based keystore creation.
  - Implement `RemoteService` that uses `SerializationContext` for requests/responses.
  - Integrate QUIC transport via `runar-nodejs-api` for remote routing.
- Tests: Node config/serialization context, remote request encryption, integration with transport mocks.

### Phase 5: End-to-End Integration (2 weeks)

- Full network message flow parity: encrypt requests/responses end-to-end.
- Performance validation vs. Rust cache and serializer baselines.
- Cross-language compatibility tests (Rust ↔ TS) for:
  - Label resolver, envelope de/encryption, AnyValue ser/de, container types, decorated types.
- Production readiness validation and documentation.

## 4. Quality Assurance Requirements

### 4.1 Type Safety Validation

- TS strict mode on; zero `any` in production code.
- Exact type equivalents for Rust interfaces; use `Uint8Array` for bytes.
- Generics with constraints for registry converters, encryptors/decryptors.

### 4.2 API Parity Verification

- Method signatures and return types must match (TS `Result<T>` vs Rust `anyhow::Result<T>`).
- Error messages identical where asserted by tests.
- Behavior parity via unit tests and cross-language vectors.
- Performance benchmarks for cache and serializer within ±10% of Rust.

### 4.3 Integration Testing

- Cross-language vector tests using exported vectors from Rust.
- Network message flow tests over QUIC mock/loopback.
- Access control tests: mobile vs node capabilities (system-only/user-only) must match Rust.
- Negative/error path tests for invalid configs, unknown wire types, missing encryptors/decryptors.

### 4.4 Documentation Requirements

- JSDoc on all public APIs.
- Implementation notes documenting Rust parity decisions.
- Migration guide for existing code (e.g., updated `SerializationContext`, Node integrations).
- Performance characteristics and caveats.

## 5. Risk Mitigation Strategies

### 5.1 Technical Risks

- Native API dependencies: Add CI preflight to detect native module availability and version compatibility with Rust.
- Performance differences: Continuous benchmark suite comparing TS vs Rust outputs.
- Memory management: Avoid unnecessary copies in AnyValue eager paths; reuse buffers in lazy flows.
- Concurrent access: Avoid shared mutable state; ensure ResolverCache API is safe and pure.

### 5.2 Integration Risks

- Version compatibility across Rust/TS: Pin versions and provide compatibility matrix.
- Platform differences: Test Linux/macOS/Windows for Node builds.
- Transport layer: Provide mock transport to validate encryption without network flakiness.
- Error propagation: Standardize mapping from native errors to TS `Error` with identical strings.

### 5.3 Quality Risks

- Enforce strict compiler settings (`noImplicitAny`, `noUncheckedIndexedAccess`, etc.).
- Mandatory peer reviews for core serializer, decorators, node integration changes.
- Target 100% coverage for new code paths.
- Docs completed before merging features.

## 6. Success Metrics

### Functional Parity (100% Required)

- ✅ **ACHIEVED**: All Rust encryption scenarios and label semantics (system/user/system_only/search) identical.
- ✅ **ACHIEVED**: Field-level encryption with labels works identically, including CurrentUser behavior.
- ✅ **ACHIEVED**: Access control based on keystore capabilities matches Rust tests.
- ✅ **ACHIEVED**: API alignment with Rust `runar-keys` crate (networkPublicKey instead of network_id).
- 🔄 **IN PROGRESS**: Container encryption for lists/maps identical.
- 🔄 **IN PROGRESS**: Network message encryption parity for requests/responses.

### Performance Parity (90% Target)

- ✅ **ACHIEVED**: ResolverCache hit/miss and eviction within 10% of Rust timings.
- ✅ **ACHIEVED**: Memory usage patterns similar (no extra copies on common paths) - eliminated CBOR round-trip overhead.
- 🔄 **IN PROGRESS**: AnyValue serialize/deserialize within 10% for comparable payloads.
- 🔄 **IN PROGRESS**: Network message overhead parity (payload sizes, envelope overhead).

### Code Quality (100% Required)

- Zero `any` in production.
- Full strict mode compliance.
- Complete API documentation and migration notes.
- 100% test coverage for new functionality.

## 7. Deliverables

### 7.1 Design Document

- This document with component designs, parity mapping, and risks.

### 7.2 Implementation Plan

- Phase-by-phase steps with file/module targets:
  - Serializer core: `label_resolver.ts`, `resolver_cache.ts`, `encryption.ts`, `wire.ts`.
  - AnyValue: `any_value.ts` (new), integrate with `registry.ts`.
  - Decorators: `runar-ts-decorators` enhancements and auto-registration.
  - Node integration: `runar-ts-node` (`config.ts`, `node.ts`, `keystore_factory.ts`, remote service module).
  - Native wrappers: typings and guards for `runar-nodejs-api`.

### 7.3 Validation Framework

- Parity test suite: imports Rust vectors and cross-language golden tests.
- Benchmark harness for cache and serializer.
- E2E network tests using QUIC in loopback.
- Quality gates with automated acceptance criteria.

## 8. Timeline and Milestones

- Phase 1: Core components (2 weeks)
- Phase 2: AnyValue integration (2 weeks)
- Phase 3: Decorator system (2 weeks)
- Phase 4: Node integration (3 weeks)
- Phase 5: End-to-end validation (2 weeks)

## 9. Quality Gates

- Gate 1: Rust codebase analysis captured (traits.rs, encryption.rs, arc_value.rs, registry.rs, core tests reviewed).
- Gate 2: Design plan reviewed and approved by team.
- Gate 3: Core components implemented with 100% coverage and parity.
- Gate 4: Integration testing complete; TS ↔ Rust parity validated by vectors and E2E.
- Gate 5: Performance benchmarks meet targets (±10%).
- Gate 6: Production deployment readiness with complete documentation and migration guide.

## Appendix A: Explicit API Parity Matrix (Excerpt)

- LabelResolver
  - TS: `resolveLabelInfo(label: string): Result<LabelKeyInfo | undefined>`
  - Rust: `fn resolve_label_info(&self, label: &str) -> Result<Option<LabelKeyInfo>>`
- SerializationContext
  - TS (final): `{ keystore: CommonKeysInterface; resolver: LabelResolver; networkPublicKey: Uint8Array; profilePublicKeys: Uint8Array[] }`
  - Rust: `SerializationContext { keystore, resolver, network_public_key, profile_public_keys }`
- ResolverCache
  - TS: `getOrCreate(config, userKeys): Result<LabelResolver>`; `cleanupExpired(): number`; `stats(): { totalEntries, maxSize, ttlSeconds }`
  - Rust: `get_or_create(...) -> Result<Arc<LabelResolver>>`; `cleanup_expired() -> usize`; `stats() -> CacheStats`
- Encryption helpers
  - TS: `encryptLabelGroup`, `decryptLabelGroup`, `decryptBytes`
  - Rust: same semantics with `EnvelopeEncryptedData` CBOR.
- AnyValue/ArcValue
  - TS: `serialize(context?)`, `deserialize(bytes, keystore?)`, getters `asType<T>()`, list/map helpers, JSON conversion
  - Rust: identical behavior and header format (TS uses `asType` instead of reference-returning methods).

## 10. Native API Transporter Integration (Detailed)

This section specifies an end-to-end design to integrate the Node.js native API (runar-nodejs-api) transporter, provide peer/network capability, and add a first-class `RemoteService` implementation in TypeScript. It aligns with plan_01 scope and fills in missing details.

### 10.1 Native API Surfaces and TS Bindings

- Keys/Keystore (already available):
  - Required methods for envelope encryption/decryption are exposed by the native module (`encryptWithEnvelope`, `decryptEnvelope`) through wrappers. TS will continue using `CommonKeysInterface`.
- Transport (available in native module):
  - The Rust `Transport` exposes `start`, `stop`, `request`, `publish`, `connect_peer`, `is_connected`, etc. We will declare/consume these from TS with proper typings.
- Discovery (available in native module):
  - The Rust `Discovery` exposes `init`, `bind_events_to_transport`, `start_announcing`, `stop_announcing`, `shutdown`, `update_local_peer_info`.

Action: Create typed TS facades in `runar-ts-node`:

- `transport.ts` with `QuicTransport` interface and a concrete `NativeQuicTransport` that calls native bindings.
- `discovery.ts` with `NodeDiscovery` interface and a concrete `NativeMulticastDiscovery`.
- `keystore_factory.ts` with `KeystoreFactory` for role-based keystore creation.

Example typings (TS):

```typescript
export interface QuicTransport {
  start(): Promise<void>;
  stop(): Promise<void>;
  request(
    path: string,
    correlationId: string,
    payload: Uint8Array,
    destPeerId: string,
    networkPublicKey?: Uint8Array,
    profilePublicKeys?: Uint8Array[]
  ): Promise<Uint8Array>;
  publish(
    path: string,
    correlationId: string,
    payload: Uint8Array,
    destPeerId: string,
    networkPublicKey?: Uint8Array
  ): Promise<void>;
  connectPeer(peerInfoCbor: Uint8Array): Promise<void>;
  isConnected(peerId: string): Promise<boolean>;
}
```

### 10.2 Node Networking Capability

- Node gains networking capability based on `networkConfig` and optional `QuicTransport` + `NodeDiscovery` instances.
- On `start()`, if networking is enabled:
  - Create transport with options (bind address, node public key from keystore).
  - Start transport, initialize discovery, bind discovery events to transport.
  - Optionally announce presence and process inbound requests/events via callback.

Configuration additions in `NodeConfig`:

```typescript
export interface NodeConfig {
  // REQUIRED: Label resolver configuration (matches Rust exactly)
  labelResolverConfig: LabelResolverConfig;

  // Network configuration (matches Rust exactly)
  defaultNetworkId: string;
  networkIds?: string[];
  networkConfig?: NetworkConfig;

  // Logging configuration (matches Rust exactly)
  loggingConfig?: LoggingConfig;

  // Request timeout (matches Rust exactly)
  requestTimeoutMs?: number; // defaults to 30000

  // NEW: Role configuration (TypeScript only - Rust doesn't need this)
  role?: 'frontend' | 'backend'; // defaults to 'backend'
}
```

### 10.3 Serialization/Encryption Contracts for Networking

- All external payloads must be encrypted using `SerializationContext` built from:
  - Cached `LabelResolver` created with user profile keys from the request context (or empty for system-only).
  - Pre-resolved `networkPublicKey` for the target network.
  - `profilePublicKeys` from the sender context.
- For inbound messages:
  - Extract `profile_public_keys` from message envelope metadata.
  - Create a dynamic `LabelResolver` from cache.
  - Decrypt payload with keystore.
  - Route to service/action.
  - Serialize response using same (or newly computed) context and send.

### 10.4 RemoteService (TypeScript) — Detailed Design

- Purpose: Provide a local proxy for remote services discovered on peers.
- Responsibilities:
  - Maintain service metadata (name, version, description, topic path, peer node id).
  - For requests: build `SerializationContext`, encrypt params, send via `QuicTransport.request`, decrypt and return response as `AnyValue`.
  - For subscriptions (future): bind remote events (out of scope for first cut; parity focuses on request/response).

Class design (TS):

```typescript
export class RemoteService {
  constructor(
    private readonly serviceTopic: TopicPath,
    private readonly networkTransport: QuicTransport,
    private readonly labelResolverCache: ResolverCache,
    private readonly labelResolverConfig: LabelResolverConfig,
    private readonly logger: Logger
  ) {}

  async request(
    actionName: string,
    params: AnyValue,
    req: RequestContext
  ): Promise<Result<AnyValue, string>> {
    try {
      const profilePublicKeys = req.userProfilePublicKeys ?? [];
      const resolverResult = this.labelResolverCache.getOrCreate(
        this.labelResolverConfig,
        profilePublicKeys
      );
      if (!resolverResult.ok) return err(`LabelResolver error: ${resolverResult.error.message}`);

      const networkPk = req.networkPublicKey ?? undefined;
      const ctx: SerializationContext = {
        keystore: req.node.keystore,
        resolver: resolverResult.value,
        networkPublicKey: networkPk!,
        profilePublicKeys,
      };

      const payloadBytes = params.serialize(ctx);
      if (!payloadBytes.ok) return err(`Encrypt params failed: ${payloadBytes.error.message}`);

      const responseBytes = await this.networkTransport.request(
        this.serviceTopic.newActionTopic(actionName).asStr(),
        req.correlationId,
        payloadBytes.value,
        req.peerNodeId,
        networkPk,
        profilePublicKeys
      );

      const av = AnyValue.deserialize(responseBytes, { keystore: req.node.keystore });
      return av.ok ? ok(av.value) : err(av.error.message);
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }
}
```

### 10.5 Node Inbound Message Handling

- Transport will hand off inbound requests to a Node callback registered during `start()`.
- Node executes the following steps:
  1. Parse message, extract `path`, `payload_bytes`, `correlation_id`, `profile_public_keys`.
  2. Build `LabelResolver` from cache via `createUserLabelResolver(profile_public_keys)`.
  3. Build `DeserializationContext` with keystore and resolver, then `AnyValue.deserialize(payload)`.
  4. Route to local service/action and obtain `AnyValue` result.
  5. Build `SerializationContext` with same profile keys; `result.serialize(context)`.
  6. Reply via `transport.sendResponse` (or equivalent `request` resolver path).

Pseudocode:

```typescript
transport.onRequest(async msg => {
  const profileKeys = msg.payload.profile_public_keys ?? [];
  const resolver = this.createUserLabelResolver(profileKeys);
  if (!resolver.ok) return makeErrorResponse('resolver error');

  const deCtx: DeserializationContext = { keystore: this.keystore, resolver: resolver.value };
  const payloadAv = AnyValue.deserialize(msg.payload.payload_bytes, deCtx);
  if (!payloadAv.ok) return makeErrorResponse(payloadAv.error.message);

  const result = await routeToLocalService(msg.payload.path, payloadAv.value);
  const serCtx = this.createSerializationContext(profileKeys);
  const outBytes = result.serialize(serCtx);
  if (!outBytes.ok) return makeErrorResponse(outBytes.error.message);

  return makeSuccessResponse(outBytes.value);
});
```

### 10.6 Discovery Integration

- Discovery is initialized on `start()` when networking is enabled.
- The Node will:
  - Provide local `NodeInfo` to transporter (node public key, network ids, service list, subscriptions).
  - Subscribe to discovery events; on `Discovered/Updated`, connect peer via transport.
  - Optionally announce presence periodically.

### 10.7 Error Handling and Parity Across Boundaries

- All TS public APIs return `Result<T, Error>` where Rust returns `anyhow::Result<T>`.
- Transport request errors map to TS `Error` with messages mirroring Rust logs where asserted.
- Decrypt/encrypt failures return errors at the exact points Rust returns errors in tests (resolver missing, keystore required, unknown type wire name, etc.).

### 10.8 Security and Access Control

- Maintain Rust parity:
  - System-only labels encrypted with network key only; user-only labels with profile keys; mixed labels with both.
  - Mobile keystore vs Node keystore access controls validated via tests.
  - All network payloads encrypted; reject unencrypted external payloads at Node boundary.

### 10.9 Testing Strategy for Networking

- Unit tests:
  - Transport facade mocks to simulate request/response.
  - Node inbound handler unit tests with resolver cache and keystore.
- Integration tests:
  - Loopback transport using native module to validate encryption on the wire.
  - Cross-language: TS client ↔ Rust service (and vice versa) for selected actions.
- Performance tests:
  - Measure request latency overhead vs Rust; validate within 10% target.

## 11. Alignment with integration_design_plan_01.md (Scope Reconciliation)

This plan expands 02 to fully cover the areas detailed in 01 and adds transporter integration details:

- Tests: Includes real keystore setup, resolver creation, end-to-end encryption for structs, AnyValue integration, and error scenarios.
- AnyValue: Full wire header parity, lazy deserialization, container encryption, registry-driven element encrypt/decrypt, JSON conversion fallback.
- Decorators: `@Encrypt` and `@runar` with companion class generation, registry registration for encrypt/decrypt and wire names.
- Node Integration: LabelResolverConfig requirement, ResolverCache initialization, `createSerializationContext`, dynamic resolver for user contexts, and RemoteService.
- Transport Layer: QUIC integration via native API, discovery events linking, inbound/outbound message flow with enforced encryption.
- Native API Additions: Typed TS facades for existing native Transport and Discovery; no runtime changes required in Rust crate for MVP.
- Metrics: Performance and parity targets explicitly defined for cache, serializer, and network overhead.

## 12. Detailed API Specifications (Addendum)

- Node
  - `createSerializationContext(userKeys?: Uint8Array[]): SerializationContext`
  - `startNetworking(): Promise<Result<void, Error>>`
  - `handleNetworkMessage(message: NetworkMessage): Promise<Result<void, Error>>`
- RemoteService
  - `request(action: string, params: AnyValue, req: RequestContext): Promise<Result<AnyValue, string>>`
- ResolverCache
  - `getOrCreate(config: LabelResolverConfig, userKeys: Uint8Array[]): Result<LabelResolver>`
  - `cleanupExpired(): number`, `stats(): { totalEntries, maxSize, ttlSeconds }`, `clear(): void`
- Encryption (synchronous serializer helpers) ✅ **IMPLEMENTED**
  - `encryptLabelGroupSync(label, fields, keystore, resolver): Result<EncryptedLabelGroup, Error>`
  - `decryptLabelGroupSync<T>(group: EncryptedLabelGroup, keystore: CommonKeysInterface): Result<T, Error>`
  - `decryptBytesSync(bytes: Uint8Array, keystore: CommonKeysInterface): Result<Uint8Array, Error>`
  - **Note**: `EncryptedLabelGroup` contains only `envelopeCbor: Uint8Array` (raw CBOR bytes from native API)
- AnyValue
  - `serialize(ctx?: SerializationContext): Result<Uint8Array, Error>`
  - `deserialize(bytes: Uint8Array, ctx?: DeserializationContext): Result<AnyValue, Error>`

## 13. Work Breakdown Additions (Phases 4-5 deepening)

- Phase 4A (Node Config): Implement `NetworkConfig`, require `LabelResolverConfig`, add `role` field, add validation.
- Phase 4B (KeystoreFactory): Implement role-based keystore creation and wrapper classes.
- Phase 4C (Transport): Create TS facades for native Transport/Discovery; integrate into Node lifecycle.
- Phase 4D (RemoteService): Implement class, integrate with Node service registry; add request path.
- Phase 4E (Inbound): Register transport request handler; implement full inbound decryption/routing/encryption.
- Phase 5 (E2E): Cross-language network tests; performance benchmark harness using real native transport.

## 14. Acceptance Checklist Additions

- Networking enabled nodes use encrypted payloads exclusively for external IO.
- RemoteService requests pass through `SerializationContext` with correct keys.
- Discovery attaches to transport and connects to discovered peers.
- All Node inbound requests are decrypted via dynamic resolver and re-encrypted on response.
- Cross-language request/response tests pass for at least one decorated struct.
- Role-based keystore creation works correctly for both frontend and backend configurations.

## 15. Alignment with @runar-nodejs-api (Exact API Mapping)

This appendix aligns the design with the published NodeJS native APIs so implementation is unambiguous.

### 15.1 Keys (envelope encryption and utilities)

- We will bind our `CommonKeysInterface` directly to `Keys` methods:
  - encrypt: `mobileEncryptWithEnvelope(data, networkPublicKey?, profilePublicKeys[])` and `nodeEncryptWithEnvelope(data, networkPublicKey?, profilePublicKeys[])`.
  - decrypt: `mobileDecryptEnvelope(eedCbor)` and `nodeDecryptEnvelope(eedCbor)`.
  - helpers used by Node: `nodeGetPublicKey`, `nodeGetKeystoreState`, `setLocalNodeInfo`, symmetric key helpers.
- Our serializer calls these through a thin wrapper to keep a platform-agnostic interface (`CommonKeysInterface`).

Reference (excerpts):

```1:40:/home/rafael/Development/runar-ts/runar-rust/runar-nodejs-api/index.d.ts
  mobileEncryptWithEnvelope(data: Buffer, networkPublicKey: Buffer | undefined | null, profilePublicKeys: Array<Buffer>): Buffer
  nodeEncryptWithEnvelope(data: Buffer, networkPublicKey: Buffer | undefined | null, profilePublicKeys: Array<Buffer>): Buffer
```

```51:58:/home/rafael/Development/runar-ts/runar-rust/runar-nodejs-api/index.d.ts
  mobileDecryptEnvelope(eedCbor: Buffer): Buffer
  nodeDecryptEnvelope(eedCbor: Buffer): Buffer
```

### 15.2 Transport (request/publish and peer ops)

- Our TS `QuicTransport` facade MUST match the native `Transport` and Rust `NetworkTransport` surfaces:
  - `request(path, correlationId, payload, destPeerId, networkPublicKey?: Buffer, profilePublicKeys?: Buffer[])`
  - `publish(path, correlationId, payload, destPeerId, networkPublicKey?: Buffer)`
  - `connectPeer(peerInfoCbor)`, `isConnected(peerId)`, `isConnectedToPublicKey(peerPublicKey)`, `updatePeers(nodeInfoCbor)`
  - `start()`, `stop()`

TS facade:

```typescript
export interface QuicTransport {
  start(): Promise<void>;
  stop(): Promise<void>;
  request(
    path: string,
    correlationId: string,
    payload: Uint8Array,
    destPeerId: string,
    networkPublicKey?: Uint8Array,
    profilePublicKeys?: Uint8Array[]
  ): Promise<Uint8Array>;
  publish(
    path: string,
    correlationId: string,
    payload: Uint8Array,
    destPeerId: string,
    networkPublicKey?: Uint8Array
  ): Promise<void>;
  connectPeer(peerInfoCbor: Uint8Array): Promise<void>;
  isConnected(peerId: string): Promise<boolean>;
  isConnectedToPublicKey(peerPublicKey: Uint8Array): Promise<boolean>;
  updatePeers(nodeInfoCbor: Uint8Array): Promise<void>;
}
```

Reference (Rust excerpts):

```223:243:/home/rafael/Development/runar-ts/runar-rust/runar-transporter/src/transport/mod.rs
async fn request(
    &self,
    topic_path: &str,
    correlation_id: &str,
    payload: Vec<u8>,
    peer_node_id: &str,
    network_public_key: Option<Vec<u8>>,
    profile_public_keys: Vec<Vec<u8>>,
) -> Result<Vec<u8>, NetworkError>;

async fn publish(
    &self,
    topic_path: &str,
    correlation_id: &str,
    payload: Vec<u8>,
    peer_node_id: &str,
    network_public_key: Option<Vec<u8>>,
) -> Result<(), NetworkError>;
```

With the NodeJS API now aligned 1:1, RemoteService and Node should pass both `networkPublicKey` and the full `profilePublicKeys` list when performing network requests. The serializer continues to embed recipients into the envelope, maintaining end-to-end parity.

### 15.3 Discovery

- TS should wrap native `Discovery` exactly: `init`, `bindEventsToTransport`, `startAnnouncing`, `stopAnnouncing`, `shutdown`, `updateLocalPeerInfo`.
- Node will:
  - Provide local `NodeInfo` to transporter (node public key, network ids, service list, subscriptions).
  - Subscribe to discovery events; on `Discovered/Updated`, connect peer via transport.
  - Optionally announce presence periodically.

Reference (excerpts):

```3:11:/home/rafael/Development/runar-ts/runar-rust/runar-nodejs-api/index.d.ts
export declare class Discovery {
  constructor(keys: Keys, optionsCbor: Buffer)
  init(optionsCbor: Buffer): Promise<void>
  bindEventsToTransport(transport: Transport): Promise<void>
  startAnnouncing(): Promise<void>
  stopAnnouncing(): Promise<void>
  shutdown(): Promise<void>
  updateLocalPeerInfo(peerInfoCbor: Buffer): Promise<void>
}
```

### 15.4 Adjustments to Earlier Sections

- Sections 10.2/10.3/10.4 remain as originally specified (with `networkPublicKey` and `profilePublicKeys[]` parameters on transport calls). No workarounds are needed.
- RemoteService should call:

```typescript
const responseBytes = await this.networkTransport.request(
  this.serviceTopic.newActionTopic(actionName).asStr(),
  req.correlationId,
  payloadBytes.value,
  req.peerNodeId,
  networkPk,
  profilePublicKeys
);
```

### 15.5 Verified Rust and NodeJS Sources Used

- Serializer core parity: `traits.rs`, `encryption.rs`, `arc_value.rs`, `registry.rs` and tests.
- Transport parity: `runar-transporter/src/transport/mod.rs`.
- NodeJS API (updated): `runar-nodejs-api/index.d.ts` and NAPI bindings.

This ensures the TS implementation uses the native transporter/discovery exactly as exposed, with full parity for `network_public_key` and multi-recipient `profile_public_keys` in network calls.

### 15.6 Peer Addressing Policy (Parity with Rust runar-node)

- TS Node and RemoteService MUST address peers by `peer_node_id` only, matching Rust `runar-node` and `NetworkTransport` usage.
- Calls in our implementation use `request(path, correlationId, payload, destPeerId, networkPublicKey?, profilePublicKeys?)` and `publish(path, correlationId, payload, destPeerId, networkPublicKey?)` exclusively.
- If the NodeJS API exposes `requestToPublicKey`/`publishToPublicKey` as conveniences, they are not used by the TS Node; they may be used in tests/tools, but core flows use `peer_node_id` for 100% parity.

## 16. Critique Integration: Precise Implementation Details

This section incorporates the review's valid points, adding concrete algorithms and structures to remove ambiguity and ensure 100% Rust parity.

### 16.1 Wire Format: Exact Algorithms and Envelope CBOR

- Header layout (byte-compatible with Rust ArcValue):
  - Byte 0: category (0..6)
  - Byte 1: isEncrypted (0x00 | 0x01)
  - Byte 2: typeNameLen (0..255)
  - Bytes [3..3+len): UTF-8 wire name (primitives: per registry; lists: `list<elem>`; maps: `map<string,val>`; bytes: `bytes`; json: `json`; structs: registered wire name)
  - Bytes [3+len..]: body
- Body rules:
  - Encrypted path: body is CBOR-encoded `EnvelopeEncryptedData` (byte-for-byte match). We must use the same CBOR encoder semantics used in NodeJS API.
  - Plain path: body is the raw CBOR for the value from `ser_fn` (no wrapping).
- Container wire names:
  - Lists: `list<wireElem>` where `wireElem` is resolved from registry; heterogeneous lists fallback to `list<any>`.
  - Maps: `map<string,wireVal>` if values homogeneous and resolvable; else `map<string,any>`.
- Algorithm (TS):
  - Resolve `wireName` using registry and container parameterization logic mirroring Rust's `wire_name_for_container`.
  - If `context` present:
    - `bytes = ser_fn(inner, keystore, resolver)` with element encryption support (see 16.3).
    - `envelope = keystore.encryptWithEnvelope(bytes, networkPublicKey?, profilePublicKeys[])` (native returns CBOR bytes of `EnvelopeEncryptedData`).
    - Write header with isEncrypted=1 and append `envelope` bytes.
  - Else: write header with isEncrypted=0 and append raw `bytes`.

### 16.2 Lazy Deserialization: Structure and Flow

- TS structure `LazyDataWithOffset`:
  - `typeName: string`
  - `originalBuffer: Uint8Array` (or `ArrayBuffer`), optional `startOffset`, `endOffset`
  - `keystore?: CommonKeysInterface`
  - `encrypted: boolean`
- Deserialize algorithm:
  - Parse header; if category==Null → return Null.
  - If category in {Struct, List, Map, Json}:
    - Create `LazyDataWithOffset` capturing the entire original buffer and offsets to payload, set `encrypted` and keep `keystore` reference (if provided).
    - Store lazy holder; `serialize_fn` and `to_json_fn` remain undefined.
  - If category in {Primitive, Bytes}:
    - If encrypted: decrypt payload bytes first via `keystore.decryptEnvelope` (parsing CBOR) and then eagerly decode; return concrete `AnyValue`.
    - If plain: decode eagerly and return concrete `AnyValue`.
- Accessors (`asTypeRef`, `as_bytes_ref`, `as_list_ref`, `as_typed_list_ref`, `as_typed_map_ref`):
  - If lazy:
    - If `encrypted`: decrypt outer envelope via `keystore`.
    - Attempt direct CBOR decode into target type.
    - If fails: consult registry decryptor for target type and attempt decryption into plain type.
  - If non-lazy: cast underlying erased value.

### 16.3 Container Element Encryption via Registry

- For `List<T>` and `Map<String, T>`:
  - When `context` present during serialization, attempt element-level encryption using registry encryptor for `T`.
  - If found:
    - `List<T>` → encode as `Vec<bytes>` where each element is the CBOR of encrypted representation (exactly as Rust).
    - `Map<String, T>` → encode as `Map<String, bytes>` same semantics.
  - If no encryptor or no context: encode plain `Vec<T>`/`Map<String,T>`.
- During lazy access (`as_typed_list_ref<T>`, `as_typed_map_ref<T>`):
  - Attempt to parse `Vec<bytes>` / `Map<String, bytes>`; if successful, for each element call registry decryptor for `T`.
  - Else, fallback to `Vec<T>` / `Map<String, T>` or heterogeneous `Vec<AnyValue>` / `Map<String, AnyValue>` flows consistent with Rust.

### 16.4 Registry: Encrypt/Decrypt/JSON and Wire Names

- Data structures:
  - `encryptRegistry: Map<string, EncryptFn>` keyed by plain constructor name.
  - `decryptRegistry: Map<string, DecryptFn>` keyed by plain constructor name.
  - `jsonRegistryByRustName: Map<string, ToJsonFn>`
  - `wireNameRustToWire: Map<string, string>` and `wireNameToRust: Map<string, string>`
  - `wireNameToJson: Map<string, ToJsonFn>` including container base names (`list`, `map`, `json`).
- Functions:
  - `registerEncrypt(PlainCtor, EncCtor)` inserts an encryptor that downcasts to `PlainCtor`, calls `encryptWithKeystore`, and returns CBOR bytes of the encrypted form.
  - `registerDecrypt(PlainCtor, EncCtor)` inserts a decryptor that deserializes `Enc` from CBOR and calls `decryptWithKeystore` returning `Plain`.
  - `registerToJson<T>()` adds JSON converter by Rust type name; if a wire name exists, bind under wire name.
  - `registerTypeName<T>(wireName)` binds Rust name ↔ wire name and JSON converter by wire.
  - `lookupWireName(rustName)`; `getJsonConverterByWireName(wireName)`; `lookupEncryptorByTypeName(name)`.
- Type safety:
  - Use branded string literal keys or symbol maps to avoid accidental collisions.
  - Guard downcasts with `instanceof` checks; return `Result` with meaningful errors on mismatch.

### 16.5 Transport API: Exact Methods and Usage

- TS facade matches Rust `NetworkTransport` and aligned NodeJS API:
  - `request(path, correlationId, payload, destPeerId, networkPublicKey?, profilePublicKeys?) => Uint8Array`
  - `publish(path, correlationId, payload, destPeerId, networkPublicKey?) => void`
  - `requestToPublicKey(path, correlationId, payload, destPublicKey, networkPublicKey?, profilePublicKeys?) => Uint8Array`
  - `publishToPublicKey(path, correlationId, payload, destPublicKey, networkPublicKey?) => void`
  - `connectPeer(peerInfoCbor)`, `isConnected(peerId)`, `isConnectedToPublicKey(peerPublicKey)`, `updatePeers(nodeInfoCbor)`
  - `completeRequest(requestId, responsePayload, profilePk)` exposed by NodeJS for harness flows (non-core path)
- RemoteService call sites must pass both `networkPublicKey` and all `profilePublicKeys` from `SerializationContext` to `request`.
- Node inbound handler decrypts payload using serializer path; no additional unwrap at transport level.

### 16.6 Decorators: Runtime Codegen, Memoization, Idempotency

- Per-class metadata store:
  - `WeakMap<Function, ClassMeta>` where `ClassMeta` contains:
    - `wireName`, `encryptedCtor`, `fieldGroupsByLabel`, `labelOrder`, `registered: boolean`.
- Idempotent registration:
  - On decorator execution, check `ClassMeta.registered`; if false, perform all `registerTypeName`, `registerEncrypt`, `registerDecrypt`, `registerToJson` registrations and set `registered=true`.
- Runtime generation:
  - `Encrypted<Class>` factory creates companion class with labeled encrypted fields and `decryptWithKeystore()` implementation.
  - Original class augmented with `encryptWithKeystore(keystore, resolver)` that constructs label groups and calls `encryptLabelGroup` per label.
- Memoization:
  - Generated constructors cached in `ClassMeta.encryptedCtor` to avoid duplicate classes.

### 16.7 Type Safety, Error Handling, Performance

- Type safety:
  - Remove `any` in public APIs; use generics and constructor types for registry.
  - Add type guards (e.g., `isUint8Array`, `isPlainObject`) in boundary paths.
- Error handling:
  - All public APIs return `Result<T, Error>`; include actionable messages matching Rust test strings where asserted.
  - Provide context in errors (e.g., missing wire-name registration for …, encrypt downcast failed …).
- Performance:
  - Avoid buffer copies on deserialize lazy path; store `originalBuffer` and slice by offsets only when needed.
  - Pre-allocate header buffer size to avoid growth.
  - ResolverCache: stable hashing of sorted profile keys with fast JS hash or crypto digest when available.

### 16.8 Test Additions from Critique

- Wire format vectors: byte-for-byte parity including CBOR envelope.
- Lazy deserialization and accessor-driven decrypt flows for struct/list/map/json.
- Container element-level encryption/decrypt tests mirroring Rust registry behavior.
- Registry positive/negative tests for encrypt/decrypt lookups and downcast failures.
- Transport end-to-end tests for request/publish including `requestToPublicKey` and publish variants.
- Decorator idempotent registration and generated companion correctness.

With these additions, the plan specifies the "how" with enough detail to implement without ambiguity and ensures strict alignment with Rust behavior and the updated NodeJS transporter API.

## 17. Implementation Mapping to Existing TS Code (Exists vs New)

This section maps each design element to current TS code to avoid duplication and to specify precise update scopes.

- LabelResolver core — EXISTING — Type-only interfaces + class (`LabelResolver`)
  - Interfaces remain type-only; `LabelResolver` continues as a class (runtime).
- ResolverCache — EXISTING — Class
- Encryption helpers — EXISTING — Functions + Classes
  - Expose sync functions and `EnvelopeEncryptedData`, `EncryptedLabelGroup` as classes.
- Wire header utilities — EXISTING — Functions
- Registry — EXISTING — Module with functions and internal maps (runtime values)
- AnyValue — NEW — Class
- Decorators runtime — EXISTING — Generated runtime classes (`EncryptedT`, `TLFields`) + registration functions
- Node integration — EXISTING — `Node` class; `NodeConfig` remains type-only; keystore exposed via `KeysWrapper` class
- RemoteService — NEW — Class
- Transport/Discovery — NEW — `NativeQuicTransport`/`NativeDiscovery` classes and factories; transport/discovery option shapes remain type-only
- Keys wrapper — EXISTING — Ensure `KeysWrapper` is a class with sync methods
- Tests — Update imports to use `import type` for interfaces; import classes/functions for runtime

## 20. Type Strategy: Type-only Interfaces vs Runtime Classes (No Schemas)

Guideline: Interfaces are erased at runtime. Export them for typing only (use `import type { ... }`). For anything needed at runtime, export concrete classes/functions. No schema library is used.

- Type-only (interfaces/types) — compile-time only
  - `LabelValue`, `LabelKeyInfo`, `LabelResolverConfig`, `KeyMappingConfig`
  - Transport/discovery config shapes (e.g., `NetworkConfig`, `LoggingConfig`)
  - Internal DTO shapes used only within module boundaries
  - Usage: `import type { LabelResolverConfig } from 'runar-ts-serializer'`

- Runtime classes (export concrete values)
  - `SerializationContext`, `DeserializationContext`
  - `EnvelopeEncryptedData`, `EncryptedLabelGroup`
  - `AnyValue` (ArcValue parity)
  - `NativeQuicTransport`, `NativeDiscovery` (and factory functions)
  - `KeysWrapper` (node/mobile wrappers)
  - Decorator-generated classes: `Encrypted{Type}`, `{Type}{Label}Fields`

- Factories (lightweight, optional for config ergonomics)
  - Optional helpers like `createLabelResolverConfig(...)` may return frozen plain objects and provide minimal runtime checks if needed; not mandatory.

- Import/Export rules
  - Always import interfaces with `import type { ... }`.
  - Export only runtime classes/functions for values used at runtime.
  - Public APIs should accept/return classes where runtime presence is required; interfaces can annotate arguments/returns where no runtime is needed.

### 17.7.2 serializeFn and AnyValue.serialize return-contract (re‑emphasized)

- serializeFn(inner, keystore?, resolver?) MUST return CBOR bytes of the inner representation only:
  - Struct WITHOUT context: CBOR(Plain T)
  - Struct WITH context: CBOR(Encrypted{T}) produced by `encryptWithKeystore(keystore, resolver)`
  - List/Map WITHOUT context or WITHOUT element encryptor: CBOR(Vec<T>) / CBOR(Map<String,T>)
  - List/Map WITH context AND element encryptor: CBOR(Vec<bytes>) / CBOR(Map<String,bytes>) where each bytes entry is CBOR(Encrypted<Elem>) created via registry encryptor
- AnyValue.serialize(context?) is responsible for the OUTER envelope and wire header:
  - WITH context: call serializeFn → get inner CBOR → call `keystore.encryptWithEnvelope(innerCBOR, networkPublicKey, profilePublicKeys)` → write header with is_encrypted=1 and body = CBOR(EnvelopeEncryptedData)
  - WITHOUT context: call serializeFn → write header with is_encrypted=0 and body = inner CBOR
- DO NOT write CBOR(EncryptedLabelGroup) directly to the wire body; DO NOT write CBOR(Encrypted{T}) to the wire body when context is present. The wire body is strictly CBOR(EnvelopeEncryptedData) in the encrypted path.
- The deserialization lazy path must slice the payload (startOffset..endOffset), decrypt the outer envelope (if encrypted), and then decode the inner CBOR (Plain T, Encrypted{T}, Vec/Map variants) with registry fallback as needed.

## 21. De/Serialization Dataflow (Rust-Parity, Prescriptive Checklists)

This section removes ambiguity by specifying exact steps, byte boundaries, and function contracts. It mirrors Rust behavior line-by-line.

### 21.1 Terminology and payload layers

- Wire header: `[category:1][isEncrypted:1][typeNameLen:1][typeNameBytes:len]`
- Wire body (encrypted path): CBOR(EnvelopeEncryptedData)
- Wire body (plain path): CBOR(inner)
- Inner CBOR for Struct:
  - With context: CBOR(Encrypted{T}) produced by `encryptWithKeystore()` (label groups inside)
  - Without context: CBOR(Plain T)
- Inner CBOR for List/Map:
  - With context AND element encryptor: CBOR(Vec<bytes>) or CBOR(Map<string,bytes>) where bytes = CBOR(Encrypted<Elem>)
  - Otherwise: CBOR(Vec<T>) or CBOR(Map<string,T>)

### 21.2 Struct Serialize Path (MUST follow in TS)

1. Build `wireName` for the struct
2. If `context` is present:
   - Call `val.encryptWithKeystore(context.keystore, context.resolver)` → `Encrypted{T}` with label groups populated
   - `structBytes = CBOR(Encrypted{T})`
   - `envelopeCBOR = keystore.encryptWithEnvelope(structBytes, context.networkPublicKey, context.profilePublicKeys)`
   - Write header bytes with `is_encrypted = 1`
   - Append `envelopeCBOR` to the wire body
3. If `context` is not present:
   - `plainBytes = CBOR(Plain T)`
   - Write header with `is_encrypted = 0`
   - Append `plainBytes` to the wire body

### 21.3 Deserialize + asType<T>() (TS-only)

Given `bytes` from the wire:

1. Parse header; compute `dataStart = 3 + typeNameLen`; ensure `dataStart <= bytes.length`
2. Slice payload precisely: `body = bytes.subarray(dataStart, bytes.length)`
3. If `is_encrypted == 1`:
   - Expect `body` to be CBOR(EnvelopeEncryptedData)
   - Require `keystore` (from `DeserializationContext` or stored lazy state)
   - `innerBytes = keystore.decryptEnvelope(body)` → returns plaintext bytes
4. If `is_encrypted == 0`:
   - `innerBytes = body`
5. Attempt direct decode into requested T: `try decode<T>(innerBytes)`
6. If step 5 fails, attempt registry fallback (struct path):
   - The bytes are likely CBOR(Encrypted{T}). Call `registry.tryDecryptInto<T>(innerBytes, keystore)` which:
     - Decodes Encrypted{T}
     - Calls `Encrypted{T}.decryptWithKeystore(keystore)`
     - Returns plain T
7. For Lists/Maps: after (3/4), try in order:
   - `decode<Vec<T>>()` or `decode<Map<string,T>>()`
   - `decode<Vec<bytes>>()` or `decode<Map<string,bytes>>()` then for each element call `registry.tryDecryptInto<T>(elemBytes, keystore)`
   - `decode<Vec<AnyValue>>()` or `decode<Map<string,AnyValue>>()` and map each entry via `asType<T>()`
8. Return `Result<T, Error>` (TS single method `asType<T>()` replaces refs)

### 21.4 Function Contracts (TS)

- serializeFn(inner, keystore?, resolver?) MUST return CBOR(inner) ONLY:
  - Struct with context: CBOR(Encrypted{T})
  - Struct without context: CBOR(Plain T)
  - List/Map with element encryptor: CBOR(Vec/Map of bytes where bytes = CBOR(Encrypted<Elem>))
  - List/Map without encryptor: CBOR(Vec/Map of plain values)
- AnyValue.serialize(context?) MUST:
  - With context: envelope the serializeFn's CBOR with `keystore.encryptWithEnvelope` and write CBOR(EnvelopeEncryptedData)
  - Without context: write serializeFn's CBOR directly
- decryptBytesSync(bytes, keystore): expects `bytes = CBOR(EnvelopeEncryptedData)`; returns plaintext `Uint8Array`
- keystore.decryptEnvelope(cborEnvelopeBytes): same as decryptBytesSync but calls native decrypt directly

### 21.5 Encrypted Types and Registry Requirements

- Encrypted{T}: runtime class generated by decorators; contains optional `..._encrypted: EncryptedLabelGroup` fields per label + plaintext pass-through fields
- EncryptedLabelGroup: `{ label: string; envelope?: EnvelopeEncryptedData }`
- EnvelopeEncryptedData (runtime class): must preserve binary fields as `Uint8Array`
- Registry MUST register for each Plain T:
  - encryptor: downcasts Plain T, calls `encryptWithKeystore`, returns `CBOR(Encrypted{T})`
  - decryptor: decodes `Encrypted{T}` and calls `decryptWithKeystore` to return Plain T
- Without proper registration, step 6 in 21.3 will fail; tests expecting inner decrypts will not pass

### 21.6 Byte Slicing & CBOR Pitfalls (Do/Don't)

- DO: Slice `body = bytes.subarray(3 + typeNameLen)`
- DO: Pass `body` (CBOR(EnvelopeEncryptedData)) directly to `keystore.decryptEnvelope`
- DO: Treat all binary fields of `EnvelopeEncryptedData` as `Uint8Array`
- DON'T: JSON.stringify/parse `Uint8Array` (you'll get numeric-keyed objects)
- DON'T: Reconstruct envelope from partial fields; prefer passing exact CBOR from the wire
- If you must reconstruct (tests/tools), normalize binary fields:
  - `toU8 = v => (v instanceof Uint8Array ? v : Uint8Array.from(Object.values(v)))`

### 21.7 TS-only API Adjustment (Refs → Values)

- TS replaces Rust's `as_type_ref<T>` with `asType<T>(): Result<T, Error>`
- The internal lazy decrypt-on-access logic is identical in functionality
- Performance impact is negligible for our use; document rationale where ref-methods are mentioned

### 21.8 Error Message Alignment (where to match Rust)

- Invalid type name length
- Unknown primitive wire type
- Missing wire-name registration for struct/list/map/primitive
- Keystore required for outer decryption
- Keystore required for decryptor
- Use exact strings from Rust tests when asserted

This section, together with 17.7.1 and 17.7.2, defines the unambiguous contract for serializeFn and AnyValue.serialize and a precise decrypt path to avoid envelope/body mix-ups.

## 22. asType<T> Dual‑Mode Semantics (Decrypted Plain vs Encrypted{T}) ✅ **IMPLEMENTED**

Rust parity requirement: For an encrypted payload, callers can either obtain the decrypted original struct (subject to keystore permissions) or the encrypted companion type for persistence. TS MUST mirror this with a single API: `asType<T>()`.

### 22.1 Decision logic (TS, mirrors Rust) ✅ **IMPLEMENTED**

- Inputs:
  - `T` (constructor or branded type tag)
  - `targetConstructor` (optional constructor parameter for runtime type detection)
  - `lazy` (whether body is a lazy encrypted payload)
  - `registry` (provides decoders for `T` and `Encrypted{T}`)
  - `keystore` (optional; if absent, only encrypted result is possible)
- Algorithm:
  1. If not lazy (plain body): decode directly to `T`. If requesting encrypted companion type, error `InvalidTypeForPlainBody`.
  2. If lazy (encrypted body):
     - If `T` is `Encrypted{U}` (detected via registry "encrypted companion" metadata):
       a) Decrypt outer envelope → innerBytes
       b) Decode innerBytes as `Encrypted{U}` and return
     - Else (plain `U` requested):
       a) Decrypt outer envelope → innerBytes
       b) Try to decode innerBytes directly as `U` (this covers labels that resolved to plaintext)
       c) If (b) fails, decode innerBytes as `Encrypted{U}`, then call registry `decryptor(U)` to produce plain `U` using current `keystore`
       d) If decryptor fails due to missing keys, return `Err(AccessDenied)` (match Rust message)

### 22.2 Contracts and types ✅ **IMPLEMENTED**

- `asType<T>()` returns `Result<T>`
  - On success: instance of `T`
  - On failure: error strings identical to Rust tests (e.g., `InvalidTypeForPlainBody`, `AccessDenied`, `UnknownWireName`, `DecodeError`)
- Type-only vs runtime:
  - `Encrypted{T}` is a runtime class exported by decorators (not interface-only), so it can be returned at runtime.
  - Plain `T` may be a class (recommended) or decoded POJO matching a type-only interface; tests expect structural equality.
- **API Signature**: `asType<U = T>(targetConstructor?: new (...args: any[]) => U): Result<U, Error>`
  - Optional `targetConstructor` parameter enables runtime type detection for encrypted companion types
  - Registry integration via `isEncryptedCompanion()` function for type detection

### 22.3 Examples (pseudocode) ✅ **IMPLEMENTED**

- Request decrypted struct:

```ts
const user = anyValue.asType<User>(); // decrypts envelope → innerBytes; decodes Encrypted<User> → decrypt groups → User
```

- Request encrypted companion for persistence:

```ts
const encUser = anyValue.asType<EncryptedUser>(EncryptedUser); // decrypts envelope → innerBytes; decodes Encrypted<User>; returns it
```

- Plain body path:

```ts
const profile = anyValue.asType<Profile>(); // body is plain; decodes directly
```

- Error cases:

```ts
// Requesting encrypted companion on plain data
const result = anyValue.asType<EncryptedUser>(EncryptedUser); // Returns Err("InvalidTypeForPlainBody")

// Missing keystore for encrypted data
const result = anyValue.asType<User>(); // Returns Err("AccessDenied")
```

### 22.4 Edge cases and error behavior ✅ **IMPLEMENTED**

- No keystore provided + plain `T` requested on encrypted body → `AccessDenied`
- Keystore provided but lacks keys → `AccessDenied`
- Registry lacks companion or decryptor for `T` → `UnknownEncryptedCompanion`
- InnerBytes decode fails for both `T` and `Encrypted{T}` → `DecodeError`
- Requesting encrypted companion type on plain data → `InvalidTypeForPlainBody`

### 22.5 Implementation mapping (Exists vs New) ✅ **COMPLETED**

- AnyValue — EXISTING (updated behavior)
  - File: `runar-ts-serializer/src/index.ts`
  - Action: ✅ Updated `asType<T>()` to implement decision logic above; added helper `isEncryptedCompanionType(targetCtor)` via registry
- Registry — EXISTING (updated)
  - File: `runar-ts-serializer/src/registry.ts`
  - Action: ✅ Ensured metadata to map `T ↔ Encrypted{T}`; exposed `getEncryptedCompanion(T)`, `isEncryptedCompanion(ctor)`, and `decryptor(T)`
- Decorator output — EXISTING
  - Files: `runar-ts-decorators/src/index.ts` generation outputs
  - Action: ✅ Generates runtime class `Encrypted{T}` and `{T}{Label}Fields`; registers both in registry with companion links

### 22.6 Test checklist (must pass) ✅ **IMPLEMENTED**

- ✅ Encrypted struct → asType<PlainT>() returns decrypted PlainT with correct fields
- ✅ Encrypted struct → asType<EncryptedT>(EncryptedT) returns EncryptedT structurally equal to inner CBOR
- ✅ Plain struct → asType<PlainT>() works; asType<EncryptedT>(EncryptedT) yields `InvalidTypeForPlainBody`
- ✅ Access control: missing/insufficient keys → `AccessDenied`
- ✅ Registry gaps: missing companion/decryptor → `UnknownEncryptedCompanion`
- ✅ Test file: `runar-ts-serializer/test/anyvalue_dual_mode.test.ts` demonstrates all scenarios

## 22.7 Container Element Decryption in asType<T>() (Detailed Implementation)

### 22.7.1 Overview

TypeScript implementation achieves container element decryption through the unified `asType<T>()` method, eliminating the need for separate `as_typed_list_ref` and `as_typed_map_ref` methods that exist in Rust due to language limitations. The TS approach is cleaner and more idiomatic while maintaining 100% functional parity.

### 22.7.2 TypeScript-Specific Methods for Container Element Access

**Problem**: TypeScript's generic type erasure at runtime prevents distinguishing between `asType<string[]>(Array)` and `asType<AnyValue[]>(Array)` calls, making it impossible to determine whether the user wants plain values or AnyValue objects.

**Solution**: Provide explicit methods that clearly indicate the intended return type:

- `asAnyValueArray(): Result<AnyValue[], Error>` - Returns array of AnyValue objects
- `asAnyValueMap(): Result<Map<string, AnyValue>, Error>` - Returns map with AnyValue values
- `asType<T>(targetConstructor?: new (...args: any[]) => T): Result<T, Error>` - Returns plain values based on targetConstructor

### 22.7.3 Method Specifications

#### asAnyValueArray() Method

**Purpose**: Explicitly return an array of AnyValue objects, preserving the container structure and enabling further type conversion via `.asType<T>()` on individual elements.

**Behavior**:

- Always returns `AnyValue[]` regardless of element types
- Preserves lazy decryption semantics for encrypted elements
- Enables chained operations: `anyValue.asAnyValueArray().value[0].asType<string>()`
- Handles all three deserialization fallback scenarios (encrypted bytes, plain values, heterogeneous)

**Rust Equivalent**: `as_typed_list_ref()` method that returns `Vec<ArcValue>`

#### asAnyValueMap() Method

**Purpose**: Explicitly return a Map with AnyValue objects as values, preserving the container structure and enabling further type conversion.

**Behavior**:

- Always returns `Map<string, AnyValue>` regardless of value types
- Preserves lazy decryption semantics for encrypted values
- Enables chained operations: `anyValue.asAnyValueMap().value.get('key')?.asType<string>()`
- Handles all three deserialization fallback scenarios (encrypted bytes, plain values, heterogeneous)

**Rust Equivalent**: `as_typed_map_ref()` method that returns `HashMap<String, ArcValue>`

### 22.7.4 Usage Patterns

#### Explicit AnyValue Access

```typescript
// Clear intent: user wants AnyValue objects
const anyValueArray = container.asAnyValueArray();
const anyValueMap = container.asAnyValueMap();
```

#### Chained Type Conversion

```typescript
// Convert to AnyValue objects, then extract specific types
const scores = container.asAnyValueArray();
if (scores.ok) {
  const firstScore = scores.value[0].asType<number>();
  const secondScore = scores.value[1].asType<string>();
}
```

#### Plain Value Access (Existing)

```typescript
// Clear intent: user wants plain values
const stringArray = container.asType<string[]>(Array);
const stringMap = container.asType<Map<string, string>>(Map);
```

### 22.7.5 Implementation Requirements

#### Method Signatures

- `asAnyValueArray(): Result<AnyValue[], Error>`
- `asAnyValueMap(): Result<Map<string, AnyValue>, Error>`

#### Deserialization Logic

Both methods follow the same three-step fallback pattern as `asType<T>()`:

1. **Step 1**: Try `Vec<Vec<u8>>` / `Map<String, Vec<u8>>` (encrypted bytes)
   - Decrypt each element using registry decryptors
   - Convert decrypted elements to AnyValue objects
   - Return array/map of AnyValue objects

2. **Step 2**: Try `Vec<T>` / `Map<String, T>` (plain values)
   - Convert each plain element to AnyValue object using `AnyValue.from()`
   - Return array/map of AnyValue objects

3. **Step 3**: Try `Vec<ArcValue>` / `Map<String, ArcValue>` (heterogeneous)
   - Elements are already AnyValue objects
   - Return as-is

#### Error Handling

- **Outer envelope decryption**: `"Outer envelope decryption failed: {reason}"`
- **Element type resolution**: `"Cannot determine element type for decryption"`
- **Missing decryptor**: `"No decryptor registered for element type: {typeName}"`
- **Element decryption**: `"Element decryption failed: {reason}"`
- **All approaches failed**: `"Failed to deserialize container: all deserialization approaches failed"`

### 22.7.6 Registry Integration

#### Required Registry Functions

- `lookupDecryptorByTypeName(typeName: string): Result<DecryptFn<T>, Error>`
- `getElementTypeFromTarget(targetConstructor?: new (...args: any[]) => T): string | null`
- `lookupWireName(rustTypeName: string): Result<string, Error>`

#### Element Type Resolution

- For encrypted elements: Use registry decryptor lookup by type name
- For plain elements: Infer type from CBOR structure or use default
- For heterogeneous elements: Preserve existing AnyValue structure

### 22.7.7 Performance Considerations

#### Optimization Strategies

- **Lazy evaluation**: Only decrypt elements when accessed via `.asType<T>()`
- **Batch operations**: Process multiple elements in single registry calls where possible
- **Memory efficiency**: Avoid unnecessary array copies during conversion
- **Registry caching**: Cache decryptor lookups to avoid repeated registry queries

#### Memory Management

- **Buffer reuse**: Reuse `innerBytes` buffer for multiple decode attempts
- **Element streaming**: Process large containers element-by-element to avoid memory spikes
- **Garbage collection**: Ensure proper cleanup of intermediate objects

### 22.7.8 Testing Requirements

#### Test Scenarios

1. **Plain containers**: `Vec<String>` → `asAnyValueArray()` → `AnyValue[]` with string values
2. **Encrypted containers**: `Vec<EncryptedUser>` → `asAnyValueArray()` → `AnyValue[]` with encrypted elements
3. **Heterogeneous containers**: `Vec<ArcValue>` → `asAnyValueArray()` → `AnyValue[]` with mixed types
4. **Missing decryptor**: `Vec<EncryptedUser>` → `asAnyValueArray()` → error when no decryptor
5. **Access denied**: `Vec<EncryptedUser>` → `asAnyValueArray()` → error when keystore lacks keys
6. **Malformed data**: Invalid CBOR → `asAnyValueArray()` → decode error

#### Test Data Requirements

- **Small containers**: 1-5 elements for basic functionality
- **Large containers**: 100+ elements for performance testing
- **Mixed content**: Containers with both plain and encrypted elements
- **Edge cases**: Empty containers, single-element containers, maximum-size containers

### 22.7.9 Rust Parity Verification

#### Method Mapping

- `asAnyValueArray()` ↔ `as_typed_list_ref()` (returns `Vec<ArcValue>`)
- `asAnyValueMap()` ↔ `as_typed_map_ref()` (returns `HashMap<String, ArcValue>`)
- `asType<T>(Array)` ↔ `as_type<T>()` (returns `Vec<T>`)
- `asType<T>(Map)` ↔ `as_type<T>()` (returns `HashMap<String, T>`)

#### Behavior Verification

- **Wire format**: Identical header parsing and payload extraction
- **Decryption logic**: Same three-step fallback pattern
- **Error messages**: Match Rust error strings exactly
- **Performance**: Within 10% of Rust benchmarks
- **Memory usage**: Similar patterns for large containers

### 22.7.10 Implementation Checklist

- [ ] **Method signatures**: Implement `asAnyValueArray()` and `asAnyValueMap()`
- [ ] **Three-step fallback**: Implement Vec<Vec<u8>> → Vec<T> → Vec<ArcValue> sequence
- [ ] **Registry integration**: Use real decryptors, not mocks
- [ ] **Error handling**: Precise error messages matching Rust behavior
- [ ] **Type safety**: Proper generic constraints and type guards
- [ ] **Performance**: Optimized for large containers
- [ ] **Testing**: Comprehensive test coverage for all scenarios
- [ ] **Rust parity**: Verify behavior matches Rust implementation exactly

## 23. Key Architectural Decision: Raw CBOR Bytes Only (No Envelope Objects)

### 23.1 Decision Summary

**RESOLVED**: Eliminate intermediate `EnvelopeEncryptedData` object representation in TypeScript implementation. Store and use only raw CBOR bytes directly from the native API.

## 24. API Alignment: network_id → networkPublicKey Migration

### 24.1 Migration Summary

**COMPLETED**: Successfully migrated from `network_id: string` to `networkPublicKey: Uint8Array` in all encryption-related APIs, aligning with updated NodeJS native API.

### 24.2 Changes Made

- **NodeJS Native API**: Updated to use `networkPublicKey: Uint8Array` instead of `network_id: String`
- **TypeScript Encryption Layer**: Already using `networkPublicKey` in all encryption methods
- **Label Resolver**: Configured with `networkPublicKey` for all labels
- **Test Environment**: Properly set up to provide `Uint8Array` network public keys

### 24.3 Benefits

- **🎯 Direct Key Usage**: No need to resolve `network_id` to `networkPublicKey` during encryption
- **🚀 Performance**: Eliminates string-based lookups in favor of direct key usage
- **🔒 Security**: Public keys are used directly without intermediate string identifiers
- **🔄 Consistency**: All encryption methods now use the same parameter types

### 24.4 Implementation Status

- ✅ **NodeJS API**: Updated to use `networkPublicKey` parameters
- ✅ **TypeScript Encryption**: Already using `networkPublicKey` correctly
- ✅ **Test Suite**: All 19 encryption tests passing with new API
- ✅ **Label Resolution**: Properly configured for `networkPublicKey` usage

### 23.2 Rationale

- **Performance**: Eliminates wasteful CBOR decode → object → CBOR encode round-trip
- **Correctness**: Prevents subtle binary structure changes that cause decryption failures
- **Rust Parity**: Matches Rust's approach of using CBOR bytes directly for encryption/decryption
- **Simplicity**: Cleaner API with fewer fields and reduced complexity
- **No Fallbacks**: Aligns with "no fallbacks" design principle

### 23.3 Implementation Details

- `EncryptedLabelGroup` contains only:
  - `label: string`
  - `envelopeCbor: Uint8Array` (raw CBOR bytes from native API)
- `encryptLabelGroupSync()` stores native API output directly
- `decryptLabelGroupSync()` uses raw bytes directly for decryption
- No intermediate object parsing or reconstruction

### 23.4 Impact on Design

- ✅ **RESOLVED**: Envelope encryption parity gap eliminated
- ✅ **RESOLVED**: CBOR encoding/decoding bugs prevented
- ✅ **RESOLVED**: Performance optimized for encryption/decryption paths
- ✅ **RESOLVED**: 100% alignment with Rust implementation approach

### 23.5 Test Validation

All comprehensive encryption tests (19/19) pass, confirming:

- Basic envelope encryption roundtrips
- Label group encryption (user, system, mixed)
- Cross-keystore access control
- Performance benchmarks
- Error handling scenarios

## 25. Keystore Role Separation (Mobile vs Node) — Detailed Design

### 25.1 Role source of truth

- `NodeConfig.role?: 'frontend' | 'backend'` (defaults to `'backend'`)
- Role is read exactly once during node initialization; after selection, role is immutable for the process lifetime.
- Any attempt to reconfigure or reconstruct a wrapper of a different role MUST return `Err(RoleImmutable)`.

### 25.2 Wrappers and responsibilities

- KeysWrapperNode (backend)
  - Wraps native `Keys` in node mode; sync methods used by serializer and networking.
  - Provides: `nodeEncryptWithEnvelope`, `nodeDecryptEnvelope`, `nodeGetKeystoreState`, `nodeGetPublicKey`, `nodeGenerateCsr`, `nodeInstallCertificate`, `nodeInstallNetworkKey`, `encrypt_local_data`, `decrypt_local_data`, QUIC certificate accessors, etc.
  - Returns `Result` for all public calls; never throws.
  - Prohibits mobile-only operations (returns `Err(UnsupportedInBackendRole)`).
- KeysWrapperMobile (frontend)
  - Wraps native `Keys` in mobile mode; sync methods used by serializer (mobile app context).
  - Provides: `mobileEncryptWithEnvelope`, `mobileDecryptEnvelope`, `mobileInitializeUserRootKey`, `mobileDeriveUserProfileKey`, `mobileInstallNetworkPublicKey`, etc.
  - Returns `Result`; prohibits node-only operations (returns `Err(UnsupportedInFrontendRole)`).

### 25.3 KeystoreFactory

- Input: `NodeConfig.role`
- Output: a single concrete wrapper instance (`KeysWrapperNode` or `KeysWrapperMobile`)
- Invariants:
  - Only one wrapper instance is constructed per `Node` instance
  - Wrapper role matches `NodeConfig.role`
  - Exposes a unified `CommonKeysInterface` (runtime class) with a subset of common methods used by the serializer (encrypt/decrypt envelope, get caps/state)
- Example (TS):

```ts
export class KeystoreFactory {
  static create(config: NodeConfig): Result<CommonKeysInterface, Error> {
    if (config.role === 'frontend') return ok(new KeysWrapperMobile(/* native */));
    return ok(new KeysWrapperNode(/* native */));
  }
}
```

### 25.4 Lifecycle

- Node initialization
  1. Read `NodeConfig.role` (default `'backend'`)
  2. `KeystoreFactory.create(config)` → `CommonKeysInterface` (KeysWrapperNode or KeysWrapperMobile)
  3. Store wrapper on `Node` as `this.keystore` (immutable)
  4. For backend role, initialize QUIC/transport/discovery if networking is enabled
- Wrapper disposal (optional)
  - Provide `close()` if native resources must be freed; otherwise rely on process lifetime

### 25.5 CommonKeysInterface (runtime class)

- Purpose: unify serializer access without leaking role specifics
- Methods (sync) exposed to serializer:
  - `encryptWithEnvelope(plaintext: Uint8Array, networkPublicKey?: Uint8Array, profilePublicKeys?: Uint8Array[]): Uint8Array`
  - `decryptEnvelope(envelopeCbor: Uint8Array): Uint8Array`
  - `getKeystoreState(): number`
  - `getKeystoreCaps(): DeviceKeystoreCaps` (as plain object or small class)
- Administrative and persistence methods (role-guarded; used by node setup, $keys service, and tests; not used by serializer hot-path):
  - `ensureSymmetricKey(keyName: string): Uint8Array`
    - Native mapping: `Keys.ensureSymmetricKey(name)`
    - Usage: required by `$keys` service and tests; KEEP
  - `setLocalNodeInfo(nodeInfoCbor: Uint8Array): void`
    - Native mapping: `Keys.setLocalNodeInfo(nodeInfoCbor)`
    - Usage: node setup/discovery (inversion of control vs Rust callbacks); KEEP
  - `setPersistenceDir(dir: string): void`
    - Native mapping: `Keys.setPersistenceDir(dir)`
    - Usage: keystore configuration for persistence path; KEEP
  - `enableAutoPersist(enabled: boolean): void`
    - Native mapping: `Keys.enableAutoPersist(enabled)`
    - Usage: keystore persistence policy toggle; KEEP
  - `wipePersistence(): Promise<void>`
    - Native mapping: `Keys.wipePersistence()`
    - Usage: test cleanup and admin flows; KEEP
  - `flushState(): Promise<void>`
    - Native mapping: `Keys.flushState()`
    - Usage: test setup/teardown; admin durability; KEEP
  - `setLabelMapping(label: string, networkPublicKey?: Uint8Array, userKeySpec?: unknown): void`
    - Native mapping: none (wrapper-maintained mapping for testing only)
    - Usage: test utilities to simulate label resolution without full config; KEEP as test-only shim
- Implementation
  - KeysWrapperNode/KeysWrapperMobile adapt Uint8Array <-> Buffer with zero-copy conversions at the native boundary
  - All methods return `Result` at public surface where failures are expected; internal helpers may throw but must be caught and mapped to `Result`
  - Role guards: frontend (mobile) vs backend (node); methods not applicable to a role must return `Err(UnsupportedIn<role>Role)`

### 25.6 Invariants and validations

- Role immutability:
  - After wrapper creation, calling a method not supported by the role MUST return `Err(UnsupportedIn<role>Role)`
- No fallbacks:
  - If a consumer calls a role-incompatible method, do not forward to an alternative implementation; return explicit error
- Type discipline at boundary:
  - Public serializer APIs use `Uint8Array`
  - Wrappers convert to/from `Buffer` (zero-copy) for NAPI calls

### 25.7 Integration points

- Node
  - `constructor(config: NodeConfig)` calls `KeystoreFactory.create(config)` and stores `this.keystore`
  - `createSerializationContext()` uses `this.keystore` directly
- Serializer
  - Uses only `CommonKeysInterface` methods for envelope operations
  - No direct coupling to role-specific methods
- Transport/Discovery
  - Backend role: wrappers provide required node keystore functions (e.g., QUIC certs) via role-specific interfaces; these are used in `runar-ts-node` only (not in serializer)

### 25.8 Error contracts (Result only)

- `RoleImmutable`: attempting to change role or rebuild opposing wrapper
- `UnsupportedInFrontendRole` / `UnsupportedInBackendRole`: method not allowed for role
- `NativeCallFailed`: any native error mapped with context string
- `InvalidArgument`: wrong parameters or missing inputs

### 25.9 Tests

- Construction
  - `KeystoreFactory.create({ role: 'backend' })` → `KeysWrapperNode`; `frontend` → `KeysWrapperMobile`
  - Reinitialization attempts with different role return `Err(RoleImmutable)` (if process-bound), or new `Node` instance required
- Role enforcement
  - Mobile wrapper calling node-only method → `Err(UnsupportedInFrontendRole)`
  - Node wrapper calling mobile-only method → `Err(UnsupportedInBackendRole)`
- Serializer integration
  - `encryptWithEnvelope`/`decryptEnvelope` work for both roles in serializer flows

This design removes ambiguity for implementers, enforces strict role separation, and defines how wrappers are created, validated, and consumed without mixing mobile/node semantics.

## 26. TypeScript 5 Decorators: Exact Contracts and Project Settings

- Strategy: Use standard (TC39) decorators in TypeScript ≥ 5.x. Do not use legacy experimental decorators.
- tsconfig (project-level) requirements (no legacy fallbacks):
  - Do not enable `experimentalDecorators`. Implement against the new standard API.
  - Keep target/module as ES2022 (current). No metadata emit is required for our design.
  - Bun toolchain is the default runner (no npm/node scripts).
- Class decorator (Encrypt) signature:
  - `(value: Function, context: ClassDecoratorContext) => void`
  - Use `context.name` for diagnostics; use `context.addInitializer(() => { ... })` if registration must run after class definition.
  - Responsibilities: generate and memoize `Encrypted{T}` and `{T}{Label}Fields`, register encrypt/decrypt handlers and wire names (idempotent via WeakMap flags).
- Field decorator (@runar) signature:
  - `(initialValue: unknown, context: ClassFieldDecoratorContext<any, unknown>) => (instance: any, value: unknown) => void | void`
  - Use `context.kind === 'field'` and `context.name` (string | symbol) for the field key.
  - Prefer `context.addInitializer(function() { /* per-instance init or attach metadata */ })` to set up instance-time behavior.
  - Responsibilities: capture label metadata for the field, store in per-class WeakMap, used by registry encryptor to form `{T}{Label}Fields`.
- Storage & Idempotency:
  - `const META = new WeakMap<Function, ClassMeta>()`
  - `ClassMeta = { wireName: string, encryptedCtor: Function, fieldLabels: Map<string, Set<string>>, orderedLabels: string[], registered: boolean }`
  - Class decorator ensures registration once per class (`registered` flag) and memoizes generated constructors.

## 27. Canonical API Signatures (Authoritative)

Adopt these signatures across the codebase; update all call sites. Do not support multiple shapes.

- AnyValue (runar-ts-serializer)
  - `serialize(context?: SerializationContext): Result<Uint8Array, Error>`
  - `deserialize<T = unknown>(bytes: Uint8Array, keystore?: CommonKeysInterface, logger?: Logger): Result<AnyValue<T>, Error>`
  - `asType<T>(targetConstructor?: new (...args: any[]) => T): Result<T, Error>`
  - `asAnyValueArray(): Result<AnyValue[], Error>`
  - `asAnyValueMap(): Result<Map<string, AnyValue>, Error>`

- Serializer helpers (runar-ts-serializer/src/encryption.ts)
  - `encryptLabelGroupSync(label: string, fieldsStruct: object, keystore: CommonKeysInterface, resolver: LabelResolver): Result<EncryptedLabelGroup, Error>`
  - `decryptLabelGroupSync<T>(group: EncryptedLabelGroup, keystore: CommonKeysInterface): Result<T, Error>`
  - `decryptBytesSync(bytes: Uint8Array, keystore: CommonKeysInterface): Result<Uint8Array, Error>`

- CommonKeysInterface (serializer-facing core + admin; see 25.5)
  - Core (serializer hot path):
    - `encryptWithEnvelope(data: Uint8Array, networkPublicKey?: Uint8Array | null, profilePublicKeys: Uint8Array[]): Uint8Array`
    - `decryptEnvelope(eedCbor: Uint8Array): Uint8Array`
    - `getKeystoreState(): number`
    - `getKeystoreCaps(): DeviceKeystoreCaps`
  - Administrative (role-guarded; not hot path):
    - `ensureSymmetricKey(keyName: string): Uint8Array`
    - `setLocalNodeInfo(nodeInfoCbor: Uint8Array): void`
    - `setPersistenceDir(dir: string): void`
    - `enableAutoPersist(enabled: boolean): void`
    - `wipePersistence(): Promise<void>`
    - `flushState(): Promise<void>`
    - `setLabelMapping(label: string, networkPublicKey?: Uint8Array, userKeySpec?: unknown): void` (test-only shim)

- Transport facade (runar-ts-node)
  - `request(path: string, correlationId: string, payload: Uint8Array, destPeerId: string, networkPublicKey?: Uint8Array | null, profilePublicKeys?: Uint8Array[] | null): Promise<Uint8Array>`
  - `publish(path: string, correlationId: string, payload: Uint8Array, destPeerId: string, networkPublicKey?: Uint8Array | null): Promise<void>`

- RemoteService (runar-ts-node)
  - `request(action: string, params: AnyValue, req: RequestContext): Promise<Result<AnyValue, Error>>`

- Decorator trait-like methods (runtime, generated)
  - On plain class T: `encryptWithKeystore(keystore: CommonKeysInterface, resolver: LabelResolver): Result<EncryptedT, Error>`
  - On EncryptedT: `decryptWithKeystore(keystore: CommonKeysInterface): Result<T, Error>`

Notes to resolve "expected 1 arg, got 2" mismatches:

- AnyValue.deserialize takes `(bytes, keystore?)` only. Remove context-objects or extra params and update all sites accordingly.
- Registry encrypt/decrypt handlers accept exactly (value, keystore, resolver) for encrypt; (bytes, keystore) for decrypt, returning CBOR bytes or plain T respectively, wrapped in Result at the call boundary.

## 28. Result Monad Standardization (runar-ts-common)

- Single source of truth: `Result<T, Error>` from `runar-ts-common`.
  - ok(value): `{ ok: true, value }`
  - err(error): `{ ok: false, error }`
- Enhanced Error Handling:
  - Default error type: `Error` (not `string`) for structured error information
  - Enhanced `err()` function supports both string messages and Error objects
  - Error chaining: `err(message, previousError)` preserves original error using ES2022 `Error.cause`
  - Stack trace preservation: Manual concatenation for better debugging experience
- Rules:
  - Public APIs return `Result` (never throw). Internal calls to native APIs can throw; wrap in try/catch and return `err(new Error(message))`.
  - Do not mix other ad-hoc Result shapes. If found, replace with the canonical Result and update tests to assert `.ok`, `.value`, `.error`.
  - No implicit fallbacks. On error, return `err` with a precise message (aligned with Rust where asserted).
  - Use `err(message, previousError)` for error chaining to preserve full error context

## 29. Project-wide Compliance Checklist (Decorators + Signatures + Result)

- TS 5 decorators used everywhere; no `experimentalDecorators`.
- Decorators implemented with `ClassDecoratorContext` and `ClassFieldDecoratorContext` using `context.addInitializer` as needed.
- AnyValue/Serializer/Transport/RemoteService interfaces match Section 27 exactly; all call sites updated.
- CommonKeysInterface provides the 4 core methods and the 7 admin methods with role guards (Section 25.5).
- All modules import and return `Result` from `runar-ts-common`; no custom variants.
- Bun is the build/test runner; scripts align accordingly.

## 30. Logging System Design and Usage (Hierarchical)

### 30.1 Logging Architecture

- **Hierarchical Logger System**: Root loggers create context, child loggers inherit and extend context
- **Component-Based Logging**: Each subsystem has its own component for granular control
- **Security-First Logging**: No private information (keys, sensitive data) is ever logged
- **Performance-Optimized**: Logging can be disabled per component without overhead

### 30.2 Logger Components

```typescript
export enum Component {
  Node = 'Node', // Root node operations
  Registry = 'Registry', // Service registry operations
  Service = 'Service', // Service lifecycle
  Database = 'DB', // Database operations
  Transporter = 'Network', // Network transport
  NetworkDiscovery = 'NetworkDiscovery', // Peer discovery
  System = 'System', // System-level operations
  CLI = 'CLI', // Command-line interface
  Keys = 'Keys', // Keystore operations
  Serializer = 'Serializer', // Serialization/deserialization
  Encryption = 'Encryption', // Encryption/decryption operations
  Decorators = 'Decorators', // Decorator runtime operations
  Custom = 'Custom', // User-defined components
}
```

### 30.3 Logger Usage Patterns

**Root Logger Creation:**

```typescript
const rootLogger = Logger.newRoot(Component.Node).setNodeId('node-123');
```

**Child Logger Creation:**

```typescript
const childLogger = rootLogger.withComponent(Component.Serializer);
```

**Optional Logger Handling:**

```typescript
const log = logger
  ? logger.withComponent(Component.Encryption)
  : Logger.newRoot(Component.Encryption);
```

### 30.4 Log Display Format

- **Root Logger**: `[node-123] Starting operations`
- **Child with nodeId**: `[node-123][Serializer] Processing data`
- **Component only**: `[Decorators] Processing fields`
- **Nested hierarchy**: `[node-123][Decorators.Encryption] Decrypting label`

### 30.5 Security Guidelines

- **Never log private keys, certificates, or sensitive data**
- **Log only metadata**: key sizes, capabilities, error conditions
- **Field values**: Log type and length only, never actual content
- **Error messages**: Include context but sanitize sensitive information

### 30.6 Integration Points

**AnyValue Serialization:**

```typescript
static deserialize<T = unknown>(bytes: Uint8Array, keystore?: CommonKeysInterface, logger?: Logger): Result<AnyValue<T>, Error> {
  const log = logger ? logger.withComponent(Component.Serializer) : Logger.newRoot(Component.Serializer);
  // ... implementation with detailed logging
}
```

**Decorator Operations:**

```typescript
decryptWithKeystore(keystore: CommonKeysInterface, logger?: Logger): Result<InstanceType<typeof value>> {
  const log = logger ? logger.withComponent(Component.Decorators) : Logger.newRoot(Component.Decorators);
  // ... implementation with detailed logging
}
```

**Encryption Operations:**

```typescript
export function decryptLabelGroupSync<T>(
  encryptedGroup: EncryptedLabelGroup,
  keystore: CommonKeysInterface,
  logger?: Logger
): Result<T, Error> {
  const log = logger
    ? logger.withComponent(Component.Encryption)
    : Logger.newRoot(Component.Encryption);
  // ... implementation with detailed logging
}
```

### 30.7 Log Levels

- **Trace**: Very detailed step-by-step operations (encryption/decryption flow)
- **Debug**: Granular but detailed operations (keystore capabilities, field assignments)
- **Info**: Rare lifecycle events (start/end of major operations)
- **Warn**: Non-fatal issues (missing optional data)
- **Error**: Failures and exceptions

### 30.8 Configuration

**Simplified Configuration (Recommended):**

```typescript
const loggingConfig = LoggingConfig.new().withDefaultLevel(LogLevel.Trace);

applyLoggingConfig(loggingConfig);
```

**Granular Configuration (When needed):**

```typescript
const loggingConfig = LoggingConfig.new()
  .withDefaultLevel(LogLevel.Info)
  .withComponentLevel(Component.Encryption, LogLevel.Trace)
  .withComponentLevel(Component.Decorators, LogLevel.Debug)
  .withComponentLevel(Component.Serializer, LogLevel.Trace);

applyLoggingConfig(loggingConfig);
```

**Note**: When using `.withDefaultLevel(LogLevel.Trace)`, all components automatically inherit the trace level, making individual component level settings redundant unless you need different levels for specific components.

## 31. Decorator Standardization and Legacy Removal (Authoritative)

- Repository-wide policy
  - Use TS 5 standard decorators everywhere. Do not use legacy experimental decorators.
  - Never import or rely on `reflect-metadata` anywhere (tests or packages).
  - Do not enable `experimentalDecorators`; do not enable `emitDecoratorMetadata`.
  - Bun is the only toolchain; no npm/node scripts. No special flags are required for standard decorators.

### 30.1 TS 5 Decorator Compilation Strategy (SOLUTION)

**ISSUE IDENTIFIED**: Bun's TypeScript transpiler does not support TS 5 standard decorators yet. When Bun runs TypeScript files directly, it doesn't provide the `ClassDecoratorContext` object that TS 5 decorators expect.

**SOLUTION CONFIRMED**: Use TypeScript compilation + Bun runtime for decorator testing and execution.

**Implementation Strategy**:

1. **Compile decorators with TypeScript**:

   ```bash
   bunx tsc --experimentalDecorators false --emitDecoratorMetadata false --skipLibCheck
   ```

2. **Run tests with Bun**:

   ```bash
   bun dist/test.js
   ```

3. **Benefits**:
   - ✅ **TS 5 standard decorators** (no experimental decorators needed)
   - ✅ **Bun runtime** (fast execution)
   - ✅ **Full decorator functionality** (all features work)
   - ✅ **Proper context objects** (`ClassDecoratorContext` and `ClassFieldDecoratorContext`)

**Verification**: Confirmed that TS 5 decorators work perfectly when compiled with TypeScript and run with Bun. The `__esDecorate` and `__runInitializers` functions work correctly, providing proper context objects with `context.name`, `context.kind`, and `context.addInitializer`.

**Usage Pattern**:

- For decorator development: Use TypeScript compilation + Bun runtime
- For production builds: Use standard Bun build process (which will support TS 5 decorators in future versions)
- For tests: Compile with TypeScript, run with Bun

- Project configuration (tsconfig)
  - Base (`tsconfig.base.json`): keep as-is (ES2022 target/module, strict mode).
  - Per-package tsconfig where decorators are defined/consumed (e.g., `runar-ts-decorators`, any tests touching decorators):
    - `"experimentalDecorators": false`
    - `"emitDecoratorMetadata": false`
  - Do not introduce package-level overrides that enable legacy behavior.

- Prohibited dependency
  - Remove `reflect-metadata` from the repo.
    - Delete imports in:
      - `runar-ts-serializer/test/decorator_registry.test.ts`
      - `runar-ts-serializer/test/decorator_encryption.test.ts`
      - `runar-ts-serializer/test/wire_typename.test.ts`
      - `runar-ts-decorators/src/index.ts` (first line)
    - Remove from `runar-ts-decorators/package.json` dependencies.

- Standard decorator contracts (recap; TS 5)
  - Class decorator (`@Encrypt`): `(value: Function, context: ClassDecoratorContext) => void`
    - Use `context.name` and `context.addInitializer` as needed for idempotent registration.
  - Field decorator (`@runar`): `(initialValue: unknown, context: ClassFieldDecoratorContext<any, unknown>) => void | ((instance: unknown, value: unknown) => void)`
    - Use `context.kind === 'field'`, `context.name` (string | symbol), and `context.addInitializer` for per-instance setup.
  - Metadata storage: `WeakMap<Function, ClassMeta>`; idempotency via `registered` flag (see Sections 16.6 and 26).

- Tests and runtime expectations
  - Tests must not import `reflect-metadata`.
  - Tests that needed RTTI should instead interact with decorator-provided runtime metadata (WeakMap) and registry APIs.
  - With TS 5 standard decorators, `context.name` and `ClassDecoratorContext`/`ClassFieldDecoratorContext` are always defined; failures due to undefined indicate legacy API leakage.

- Enforcement checklist
  - [ ] No `reflect-metadata` imports remain in the codebase.
  - [ ] `runar-ts-decorators/package.json` no longer lists `reflect-metadata`.
  - [ ] All packages that touch decorators have `experimentalDecorators: false` and `emitDecoratorMetadata: false`.
  - [ ] Decorators use TS 5 signatures only; no legacy overloads or shims.
  - [ ] Tests compile and run under Bun using the standard decorator runtime.

- Non-compliance handling
  - Any attempt to reintroduce legacy decorators or `reflect-metadata` is rejected. No fallbacks, no dual modes.
  - If a test requires metadata, extend the decorator runtime metadata (WeakMap) rather than enabling legacy metadata emit.
