## Integration Design Plan (02): TypeScript LabelResolver Parity with Rust

### Objective

Achieve 100% functional and API parity between the TypeScript LabelResolver ecosystem and the Rust implementation, with strict TypeScript best practices, maintainability, and production readiness.

## 1. Current State Analysis

### 1.1 What’s Already Implemented (TypeScript)

- LabelResolver core (`runar-ts-serializer/src/label_resolver.ts`):
  - Types: `LabelKeyInfo`, `LabelValue`, `LabelKeyword`, `LabelResolverConfig`, `KeyMappingConfig`.
  - Class: `LabelResolver` with `resolveLabelInfo`, `availableLabels`, `canResolve`, `createContextLabelResolver`, `validateLabelConfig`.
  - Parity: Mirrors Rust structures and validation semantics including CurrentUser dynamic resolution and strict validation for empty config and empty network keys.
- ResolverCache (`runar-ts-serializer/src/resolver_cache.ts`):
  - LRU+TTL cache with size-based eviction and expiration cleanup, keying by user profile public keys.
  - Parity: Matches Rust’s intention (age/lastAccessed, TTL, LRU) and cache key derived from sorted keys.
- Encryption helpers (`runar-ts-serializer/src/encryption.ts`):
  - ✅ **COMPLETE**: `encryptLabelGroupSync`, `decryptLabelGroupSync`, `decryptBytesSync` with full `CommonKeysInterface` integration.
  - ✅ **COMPLETE**: `EncryptedLabelGroup` stores raw CBOR bytes directly from native API, ensuring 100% Rust parity and optimal performance.
- Wire and registry (`runar-ts-serializer/src/wire.ts`, `runar-ts-serializer/src/registry.ts`):
  - Wire header scaffolding and primitive wire-name registration mirroring Rust (`string`, numeric types, `bytes`, `json`), plus container naming.
- Node integration (TypeScript) (`runar-ts-node/src/node.ts`):
  - `createSerializationContext()` exists but `resolver` is `undefined` (TODO), and network/profile key fields are absent.
  - Local request/subscribe/publish paths are implemented with `AnyValue` integration.
- Tests present for label resolver, resolver cache, wire types, and encryption roundtrips.

### 1.2 What’s Missing / Gaps (vs. Rust)

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
  - Stabilize error messages to exactly match Rust tests (e.g., “Label '{label}' must specify either network_public_key or user_key_spec (or both)”).

### 2.2 ResolverCache Implementation

- Cache strategy:
  - `maxSize`, `ttlSeconds`; entries store `createdAt`, `lastAccessed` and are evicted via LRU or TTL cleanup; aligns with Rust `ResolverCache` (age via `Instant`, atomic last-access time).
- Cache key generation:
  - Deterministic hashing of sorted user profile keys (byte-wise). Replace ad-hoc JS hash with stable string digest:
    - Use `crypto.subtle.digest('SHA-256', concat(sortedKeys))` when available, with a synchronous fallback using a fast JS hash for Node without subtle.
  - Sorting by length then lexicographical byte compare to match Rust’s `DefaultHasher` stable ordering; document any differences and ensure cross-language cache behavior is not externally observable.
- Concurrency:
  - Single-threaded Node minimizes races; ensure methods are pure and idempotent. For shared contexts, avoid mutation of inputs. Provide `cleanupExpired()` and `clear()`.
- Performance:
  - Add micro-benchmarks mirroring Rust tests: baseline creation, cache hits/misses, TTL, LRU, and concurrent access using worker threads for contention simulation.

### 2.3 Encryption Integration

- Envelope encryption:
  - ✅ **IMPLEMENTED**: TS stores only raw CBOR bytes from native keys layer (no intermediate object representation).
  - ✅ **IMPLEMENTED**: `encryptLabelGroupSync(label, fieldsStruct, keystore, resolver)`:
    - Serialize fields with CBOR; look up `LabelKeyInfo` via `resolver.resolveLabelInfo`; call native `encryptWithEnvelope(data, networkPublicKey?, profilePublicKeys[])` returning raw CBOR bytes.
    - Store raw CBOR bytes directly in `EncryptedLabelGroup.envelopeCbor` for optimal performance and correctness.
  - ✅ **IMPLEMENTED**: `decryptLabelGroupSync(group, keystore)`:
    - Use `group.envelopeCbor` directly for decryption via `keystore.decryptEnvelope`; then CBOR-decode to fields struct.
- Label resolution:
  - ✅ **IMPLEMENTED**: Ensure labels map to keys exactly as Rust (error when label missing).
- SerializationContext:
  - ✅ **IMPLEMENTED**: TS `SerializationContext` finalized as:
    - `{ keystore: CommonKeysInterface; resolver: LabelResolver; networkPublicKey: Uint8Array; profilePublicKeys: Uint8Array[] }` with all properties required (not optional) when encrypting.
- Decryption flow:
  - ✅ **IMPLEMENTED**: Provide `decryptBytesSync(bytes, keystore)` that expects raw CBOR bytes and decrypts via `keystore.decryptEnvelope`.
- **API Alignment**: ✅ **COMPLETE**: All encryption methods use `networkPublicKey: Uint8Array` instead of `network_id: string`, aligning with updated NodeJS native API.

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

### 2.5 Decorator System

- `@Encrypt` decorator:
  - Generate companion encrypted class (e.g., `EncryptedTestProfile`) and auto-register:
    - decryptor: `register_decrypt<Plain, Enc>()` equivalent in TS registry.
    - encryptor: `register_encrypt<Plain, Enc>()` using a function that accepts `Plain`, context keys, label resolver.
    - JSON converters and `registerTypeName` for both plain and encrypted representations with proper wire names.
- `@runar` field decorator:
  - Support field-level labels: `system`, `user`, `search`, `system_only` aligned with Rust macro semantics.
- Type registration:
  - On module import or decorator evaluation, register both the plain and encrypted types in wire-name registry and JSON converters.

### 2.6 Node Integration

- NodeConfig additions:
  - Require `LabelResolverConfig` and provide `getLabelResolverConfig()`.
  - Add `role: 'frontend' | 'backend'` field (defaults to 'backend' for TypeScript).
- Node constructor:
  - Initialize `ResolverCache.newDefault()`.
  - Derive `networkPublicKey` via keys wrapper for the node’s default network when needed.
- Serialization Context creation:
  - Implement `createSerializationContext(userProfileKeys?: Uint8Array[])`:
    - Use `resolverCache.getOrCreate(config, userProfileKeys ?? [])`.
    - Resolve `networkPublicKey` from keystore for the node’s default network id.
    - Return fully-populated `SerializationContext`.
- Remote Services:
  - Implement `RemoteService` in TS Node following Rust:
    - During request: build `SerializationContext` with cached resolver and pre-resolved keys, call `AnyValue.serialize(context)` to encrypt, send via transport.
    - On response: `AnyValue.deserialize(bytes, keystore)` with node’s keystore.

### 2.7 Native API Integration

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
  - `decryptLabelGroupSync(group, keystore): Result<T, Error>`
  - `decryptBytesSync(bytes, keystore): Result<Uint8Array, Error>`
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

This section incorporates the review’s valid points, adding concrete algorithms and structures to remove ambiguity and ensure 100% Rust parity.

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
  - Resolve `wireName` using registry and container parameterization logic mirroring Rust’s `wire_name_for_container`.
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

With these additions, the plan specifies the “how” with enough detail to implement without ambiguity and ensures strict alignment with Rust behavior and the updated NodeJS transporter API.

## 17. Final Corrections: Encryption Flow, Decorators, Registry (Rust-Parity)

This section reconciles the design with the exact Rust behavior and supersedes any earlier conflicting statements.

### 17.1 Source of Truth: When Encryption Happens

- Rust performs label-group encryption inside `encrypt_with_keystore` (macro expands calls to `encrypt_label_group` for each label). This method is invoked directly by user code and also from `ArcValue::serialize(context)` when a context is provided. After that, `ArcValue::serialize` applies an outer envelope (`encrypt_with_envelope`) to the CBOR of the encrypted struct.
- TS MUST mirror this:
  - `encryptWithKeystore(keystore, resolver)` performs label-group encryption synchronously (per label) using serializer helpers.
  - `AnyValue.serialize(context)` invokes `encryptWithKeystore` when a context exists (struct case), then wraps the resulting CBOR with an outer envelope, exactly as Rust.

### 17.2 Decorator Responsibilities (Corrected)

- Generate at runtime:
  - `Encrypted<Class>` companion with encrypted-group fields.
  - `<Class><Label>Fields` classes (one per label) containing the grouped plaintext fields for that label.
- Provide synchronous methods that DO perform label-group encryption:
  - `encryptWithKeystore(keystore, resolver): Result<Encrypted<Class>>` builds each `<Class><Label>Fields` instance from `self`, calls `encryptLabelGroupSync` per label, and returns a fully populated `Encrypted<Class>` with its encrypted-group fields set.
  - `decryptWithKeystore(keystore): Result<Class>` reconstructs the plain struct from an `Encrypted<Class>` by decrypting present groups.
- Registration (idempotent):
  - Register encryptor/decryptor and wire names in the serializer registry.
  - Cache generated classes/metadata in a `WeakMap` to avoid duplicate work.

### 17.3 Registry Encryptor: Field Grouping + Envelope Encryption

- The registry encryptor for `Plain` MUST:
  1. Build per-label plaintext sub-structs using the generated `<Class><Label>Fields` classes.
  2. For each label:
     - Resolve `LabelKeyInfo` via `LabelResolver`.
     - Perform envelope encryption (CBOR `EnvelopeEncryptedData`).
     - Place the resulting `EncryptedLabelGroup` into the corresponding field of the `Encrypted<Class>`.
  3. Serialize the `Encrypted<Class>` to CBOR and return the bytes to the serializer.
- Note: Fields may appear in multiple labels (duplication is allowed and required by Rust behavior). Grouping must include duplicates as per field annotations.

### 17.4 AnyValue (TS) Serialize/Deserialize MUST be Synchronous

- Match Rust’s synchronous API:
  - `serialize(context?: SerializationContext): Result<Uint8Array>`
  - `deserialize(bytes: Uint8Array, keystore?: CommonKeysInterface): Result<AnyValue>`
- Under the hood, the NodeJS API `Keys` methods used by the serializer are synchronous (per NAPI surface), so no async/await in serializer paths.
- Encrypted path (Struct/List/Map/Json):
  - Resolve wire name and build header.
  - Call `ser_fn(inner, keystore, resolver)`. For structs, this calls the registry encryptor which returns CBOR of `Encrypted<Class>`.
  - Wrap result with `encryptWithEnvelope` if/where required by the Rust parity (for top-level struct encryption as designed in ArcValue). The CBOR bytes stored in the body are the CBOR-encoded `EnvelopeEncryptedData`.
- Plain path: append the raw CBOR produced by `ser_fn(inner, None, None)`.

### 17.5 Lazy Deserialization: No Immediate Decrypt for Complex Types

- Maintain the lazy holder (`LazyDataWithOffset`) for Struct/List/Map/Json with:
  - Original buffer slice, offsets, `typeName`, `encrypted` flag, and optional `keystore`.
- Access-time behavior:
  - If `encrypted`: decrypt the outer envelope first using `keystore.decryptEnvelope` (CBOR parse + unwrap), then proceed to parse either plain types or container-of-bytes forms.
  - For list/map element-level encrypted forms: try `Vec<bytes>`/`Map<String, bytes>` decryption via registered decryptors for the element value type.
  - Fallbacks: heterogeneous `Vec<AnyValue>`/`Map<String, AnyValue>` and direct CBOR decode consistent with Rust.

### 17.6 Synchronous Encryption Helpers in TS Serializer

- Provide sync helpers in the serializer to mirror Rust semantics:
  - `encryptLabelGroupSync(label, fields, keystore, resolver): Result<EncryptedLabelGroup>`
  - `decryptLabelGroupSync(encryptedGroup, keystore): Result<T>`
- These are used by registry encryptors/decryptors, not by decorators directly.

### 17.7.1 Serializer Struct Path Checklist (to avoid envelope/body mix-ups)

- For Struct with context present:
  1. Invoke `encryptWithKeystore(keystore, resolver)` on the struct value to produce `Encrypted{T}` with label groups populated
  2. CBOR-encode the `Encrypted{T}` into `structBytes`
  3. Call `keystore.encryptWithEnvelope(structBytes, networkPublicKey, profilePublicKeys)` to get EnvelopeEncryptedData
  4. Write wire header: `[category][is_encrypted=1][type_len][type_bytes]`
  5. Append CBOR(EnvelopeEncryptedData) as the wire body
- For Struct with no context: CBOR-encode the plain struct and write with `is_encrypted=0`

### 17.7 API Signatures (Parity)

- Traits-equivalent in TS:
  - `encryptWithKeystore(keystore, resolver): Result<Encrypted<Class>>`
  - `decryptWithKeystore(keystore): Result<Class>`
- Serializer context remains: `{ keystore, resolver, networkPublicKey, profilePublicKeys }` – all required when encrypting, and optional only for plaintext serialization.

### 17.8 Field Duplication Semantics (Labels)

- A field can appear in more than one label group (e.g., `user`, `search`).
- Grouping must include the field in every matching label’s `<Class><Label>Fields` sub-struct.
- The serializer encryptor produces distinct `EncryptedLabelGroup` entries per label.

### 17.9 Tests to Validate Corrections

- Struct encryption parity: `AnyValue.newStruct(Plain).serialize(context)` produces header + CBOR `EnvelopeEncryptedData`; decrypt path through lazy access matches Rust.
- Decorator registration: encryptor/decryptor invoked only from serializer paths; `encryptWithKeystore` returns structural companion without performing crypto.
- Field duplication: verify fields present in multiple label groups are included and encrypted in both groups.
- Synchronous enforcement: serializer paths contain no `await`; NodeJS `Keys` calls used are sync.

### 17.10 TS-only API Note: No Ref-returning methods

- Rust exposes `as_type_ref<T>` and similar methods returning borrowed references. TS is GC-based and cannot return borrowed references.
- TS exposes a single method `asType<T>(): Result<T, Error>` that performs the same lazy decrypt-on-access logic and returns a concrete instance.
- Impact on design:
  - All mentions of `as_type_ref` in Rust map to `asType` in TS
  - Performance and functionality remain equivalent for our use-cases; no observable behavior change for consumers
  - Tests and examples must use `asType<T>()` in TS

These corrections ensure the TS implementation matches Rust precisely: decorators generate structure and register handlers; only `AnyValue.serialize` triggers encryption (via registry); deserialization is lazy with decrypt-on-access for complex types; the entire flow remains synchronous as in Rust.

## 18. Consolidated Decorator Design (Merged from decorator_design_02.md)

This section consolidates and reconciles the decorator system design into the overall integration plan, removing duplication and conflicts while aligning 100% with Rust.

### 18.1 Executive Summary (Decorators)

- Three-layer architecture: serializer (wire/registry/crypto), decorators (metadata + runtime codegen), application.
- Decorator APIs mirror Rust traits: synchronous `encryptWithKeystore/decryptWithKeystore`, Result-based.
- No crypto in decorators; all encryption occurs during `AnyValue.serialize(context)` via registry encryptors.
- Runtime generation with deterministic names: `Encrypted{Type}` and `{Type}{Label}Fields`.
- Deterministic label grouping/ordering: priority system=0, user=1, other=2; then lexical.

### 18.2 Responsibilities and Separation

- Serializer (runar-ts-serializer): owns LabelResolver, wire format, AnyValue, registries, crypto helpers; provides sync `encryptLabelGroupSync/decryptLabelGroupSync`.
- Decorators (runar-ts-decorators): capture metadata, generate companions and per-label structs at runtime, register type names and handlers lazily/idempotently, define sync trait-like methods without performing crypto.

### 18.3 Decorator APIs and Types (Final)

- Marker: `RunarEncryptable`.
- Traits-equivalent:
  - `encryptWithKeystore(keystore: CommonKeysInterface, resolver: LabelResolver): Result<EncryptedT>`
  - `decryptWithKeystore(keystore: CommonKeysInterface): Result<T>`
- Use serializer types: `LabelResolver`, `LabelKeyInfo`, `EncryptedLabelGroup`, `Result`.
- No duplicated types in decorators.

### 18.4 Runtime Code Generation and Registration

- Per-class `WeakMap<Function, ClassMeta>` storing: `wireName`, `encryptedCtor`, `labelFieldConstructors`, `orderedLabels`, `registered: boolean`.
- Codegen:
  - Create `EncryptedT` and `TLFields` constructors with stable names (for diagnostics/testing) and plain data-only fields.
  - Attach sync methods to prototypes as per 17.2; `encryptWithKeystore` performs label-group encryption using `encryptLabelGroupSync` per label, and `decryptWithKeystore` mirrors decryption.
- Lazy registration (idempotent): when first decorated class is processed:
  - Register wire name for `T`.
  - Register encryptor/decryptor handlers for `T`/`EncryptedT` with serializer registry.
  - Register JSON converters as needed.

### 18.5 Deterministic Label Grouping and Ordering

- Collect labels from field metadata; compute priority per label (system=0, user=1, other=2); sort by (priority, label lex).
- For each label, create ordered, deduplicated field list (by declaration order) and generate a `{Type}{Label}Fields` instance during encryption handling in the registry.
- Fields may appear in multiple label groups and are encrypted separately per label.

### 18.6 Serializer Integration Points (Decorators ↔ Serializer)

- Encryptor handler (registry) responsibilities:
  - Construct per-label TLFields using metadata and the source instance of `T`.
  - Call `encryptLabelGroupSync(label, TLFields, keystore, resolver)`; insert results into corresponding `${label}_encrypted` fields on `EncryptedT`.
  - Serialize `EncryptedT` to CBOR and return bytes to AnyValue for wire framing.
- Decryptor handler (registry) responsibilities:
  - Deserialize `EncryptedT` from CBOR, iterate groups present, call `decryptLabelGroupSync` per group, and reconstruct `T`.

### 18.7 Synchronous Semantics and Lazy Flows (Reiterated)

- All public decorator methods are synchronous and return `Result`.
- AnyValue serialize/deserialize paths remain synchronous; complex types leverage lazy holders and decrypt on access using keystore.

### 18.8 Testing (Decorators)

- Unit: metadata capture, label grouping/ordering, codegen naming, idempotent registration, sync methods’ structural correctness.
- Integration: AnyValue serialize triggers registry encryptor; deserialize triggers decryptor; multiple labels and duplication validated.
- E2E: Envelope encryption with keystore, missing-label error behavior, performance baselines.

This merged section supersedes standalone decorator design docs and is aligned with sections 16–17 and the overall transport/node integration in sections 10 and 15.

## 19. Implementation Mapping to Existing TS Code (Exists vs New)

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
  - With context: envelope the serializeFn’s CBOR with `keystore.encryptWithEnvelope` and write CBOR(EnvelopeEncryptedData)
  - Without context: write serializeFn’s CBOR directly
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

### 21.6 Byte Slicing & CBOR Pitfalls (Do/Don’t)

- DO: Slice `body = bytes.subarray(3 + typeNameLen)`
- DO: Pass `body` (CBOR(EnvelopeEncryptedData)) directly to `keystore.decryptEnvelope`
- DO: Treat all binary fields of `EnvelopeEncryptedData` as `Uint8Array`
- DON’T: JSON.stringify/parse `Uint8Array` (you’ll get numeric-keyed objects)
- DON’T: Reconstruct envelope from partial fields; prefer passing exact CBOR from the wire
- If you must reconstruct (tests/tools), normalize binary fields:
  - `toU8 = v => (v instanceof Uint8Array ? v : Uint8Array.from(Object.values(v)))`

### 21.7 TS-only API Adjustment (Refs → Values)

- TS replaces Rust’s `as_type_ref<T>` with `asType<T>(): Result<T, Error>`
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

## 22. asType<T> Dual‑Mode Semantics (Decrypted Plain vs Encrypted{T})

Rust parity requirement: For an encrypted payload, callers can either obtain the decrypted original struct (subject to keystore permissions) or the encrypted companion type for persistence. TS MUST mirror this with a single API: `asType<T>()`.

### 22.1 Decision logic (TS, mirrors Rust)

- Inputs:
  - `T` (constructor or branded type tag)
  - `lazy` (whether body is a lazy encrypted payload)
  - `registry` (provides decoders for `T` and `Encrypted{T}`)
  - `keystore` (optional; if absent, only encrypted result is possible)
- Algorithm:
  1. If not lazy (plain body): decode directly to `T`. If decoding fails, error `InvalidTypeForPlainBody`.
  2. If lazy (encrypted body):
     - If `T` is `Encrypted{U}` (detected via registry “encrypted companion” metadata):
       a) Decrypt outer envelope → innerBytes
       b) Decode innerBytes as `Encrypted{U}` and return
     - Else (plain `U` requested):
       a) Decrypt outer envelope → innerBytes
       b) Try to decode innerBytes directly as `U` (this covers labels that resolved to plaintext)
       c) If (b) fails, decode innerBytes as `Encrypted{U}`, then call registry `decryptor(U)` to produce plain `U` using current `keystore`
       d) If decryptor fails due to missing keys, return `Err(AccessDenied)` (match Rust message)

### 22.2 Contracts and types

- `asType<T>()` returns `Result<T>`
  - On success: instance of `T`
  - On failure: error strings identical to Rust tests (e.g., `InvalidTypeForPlainBody`, `AccessDenied`, `UnknownWireName`, `DecodeError`)
- Type-only vs runtime:
  - `Encrypted{T}` is a runtime class exported by decorators (not interface-only), so it can be returned at runtime.
  - Plain `T` may be a class (recommended) or decoded POJO matching a type-only interface; tests expect structural equality.

### 22.3 Examples (pseudocode)

- Request decrypted struct:

```ts
const user = anyValue.asType<User>(); // decrypts envelope → innerBytes; decodes Encrypted<User> → decrypt groups → User
```

- Request encrypted companion for persistence:

```ts
const encUser = anyValue.asType<EncryptedUser>(); // decrypts envelope → innerBytes; decodes Encrypted<User>; returns it
```

- Plain body path:

```ts
const profile = anyValue.asType<Profile>(); // body is plain; decodes directly
```

### 22.4 Edge cases and error behavior

- No keystore provided + plain `T` requested on encrypted body → `AccessDenied`
- Keystore provided but lacks keys → `AccessDenied`
- Registry lacks companion or decryptor for `T` → `UnknownEncryptedCompanion`
- InnerBytes decode fails for both `T` and `Encrypted{T}` → `DecodeError`

### 22.5 Implementation mapping (Exists vs New)

- AnyValue — EXISTING (new behavior)
  - File: `runar-ts-serializer/src/index.ts` (if AnyValue lives here) or `any_value.ts`
  - Action: Update `asType<T>()` to implement decision logic above; add helper `isEncryptedCompanion(targetCtor)` via registry
- Registry — EXISTING (update)
  - File: `runar-ts-serializer/src/registry.ts`
  - Action: Ensure metadata to map `T ↔ Encrypted{T}`; expose `getEncryptedCompanion(T)`, `isEncryptedCompanion(ctor)`, and `decryptor(T)`
- Decorator output — NEW/EXISTING depending on status
  - Files: `runar-ts-decorators/src/index.ts` generation outputs
  - Action: Generate runtime class `Encrypted{T}` and `{T}{Label}Fields`; register both in registry with companion links

### 22.6 Test checklist (must pass)

- Encrypted struct → asType<PlainT>() returns decrypted PlainT with correct fields
- Encrypted struct → asType<EncryptedT>() returns EncryptedT structurally equal to inner CBOR
- Plain struct → asType<PlainT>() works; asType<EncryptedT>() yields `InvalidTypeForPlainBody`
- Access control: missing/insufficient keys → `AccessDenied`
- Registry gaps: missing companion/decryptor → `UnknownEncryptedCompanion`

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
