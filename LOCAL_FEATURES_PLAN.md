## Local Node Features Parity Plan (TypeScript ⇄ Rust)

Scope: Achieve feature parity with the local (non-networked, non-crypto) behaviors of the Rust `runar-node` and `runar-common` stack. Exclude networking, discovery, transport, and envelope encryption (handled later via FFI). Focus on routing, service lifecycle, registry, retained events, decorators/metadata, serializer basics, and comprehensive tests.

### Modules and Responsibilities

- runar-ts-common
  - Routing: `TopicPath`, `PathTrie` with wildcards/templates, matching, and utilities
  - Core types and errors; logging façade matching Rust behavior (implemented)

- runar-ts-serializer
  - `ArcValue<T>` minimal wrapper; CBOR helpers: `toCbor`, `fromCbor`
  - Note: canonical CBOR alignment to be revisited when integrating with Rust serializer/FFI

- runar-ts-decorators
  - Decorators that mirror Rust/Swift macros shape: `@EncryptedClass`, `@EncryptedField`, `@PlainField`
  - For local scope: keep metadata only; actual encrypt/decrypt wired later via FFI

- runar-ts-node
  - `Node` runtime (local-only): services, actions, events
  - `AbstractService` interface + lifecycle (`init`/`start`/`stop`)
  - `ServiceRegistry` (local): action handlers, event subscriptions, local services state
  - Retained events store + wildcard index; `publish({ retain })` / `on(..., { includePast })`

- runar-ts-schemas (NEW)
  - Mirror Rust `runar-schemas` data models used locally: `NodeInfo`, `PeerInfo`, `ServiceMetadata`, `ActionMetadata`, `NodeMetadata`, etc.
  - Provide pure TS interfaces/types and helper constructors/validators

### API Parity Targets (Rust → TS)

- Routing (from `runar-common/routing`)
  - Path types: service/action/event paths in a unified `TopicPath`
  - Segments: literals, `{template}`, `*` single wildcard, `>` multi wildcard
  - Behaviors: `new`, `from_full_path`, `new_service`, `new_action_topic`, `new_event_topic`, `get_segments`, `action_path`, `service_path`, `network_id`, `starts_with`, `child`, `parent`, `extract_params`, `matches_template`, `is_pattern`, `has_multi_wildcard`
  - Trie: `setValue`, `setValues`, `addBatchValues`, `removeValues`, `findMatches`, `findWildcardMatches`

- Node runtime (from `runar-node/src/node.rs` shape; local subset)
  - `Node.addService(service: AbstractService)`
  - `Node.start()`, `Node.stop()` with lifecycle contexts
  - `Node.request(servicePath, action, payload)` local dispatch
  - `Node.publish(servicePath, event, payload, { retain? })`
  - `Node.on(servicePath, pattern, subscriber, { includePast? })` + `Node.unsubscribe(id)`
  - Retained events map with PathTrie index for wildcard replay
  - Internal `ServiceRegistry` for action handlers, event subscriptions

- Services (from `services/abstract_service.rs`)
  - `AbstractService` with metadata getters, `networkId` setter, `init/start/stop`
  - Lifecycle context permits registration of action handlers and publishing

- Decorators (macros parity shape)
  - `@EncryptedClass`, `@EncryptedField`, `@PlainField` registered in metadata registry
  - No-op for encryption until FFI integration

- Schemas (from `runar-schemas`)
  - Mirror structs used by node/local flows: `NodeInfo`, `PeerInfo`, `ServiceMetadata`, `ActionMetadata`, `NodeMetadata`
  - Ensure field names/semantics match Rust; add unit tests for shape expectations

- Serializer (from `runar-serializer` and `runar-serializer-macros`)
  - Local scope: `ArcValue` semantics and `AnyValue` union with CBOR encode/decode
  - Macros parity: decorators capture metadata equivalent to macros output (encryption annotations only; no crypto yet)

### Current Progress

- Scaffolding
  - [x] Monorepo with Bun workspaces and build scripts
  - [x] Root scripts for build/clean

- Routing (runar-ts-common)
  - [x] `TopicPath` (wildcards/templates + utilities)
  - [x] `PathTrie` (set/remove/find + wildcard matching)
  - [x] Unit tests (Bun test) for `TopicPath` and `PathTrie`

- Serializer (runar-ts-serializer)
  - [x] `ArcValue<T>` minimal
  - [x] `toCbor` / `fromCbor` using `cbor-x`

- Decorators (runar-ts-decorators)
  - [x] Basic decorators and metadata registry scaffolding

- Node (runar-ts-node)
  - [x] Local runtime `Node` with `addService`, `start`, `stop`, `request`
  - [x] `publish({ retain })`, `on(..., { includePast })`, `unsubscribe`
  - [x] Internal `ServiceRegistry` for action handlers and event subscriptions
  - [x] Retained events store + wildcard index for replay
  - [x] TS `AbstractService`, `ServiceState`, `LifecycleContext`

### Gaps and Next Steps (Local Parity)

1. Node/Registry parity refinements
   - [x] Track local services in `ServiceRegistry` (mirror Rust) instead of only in `Node`
   - [x] Service state tracking in registry maps; timestamps for registration/start
   - [ ] Expand event subscription storage to support multiple lists per topic leaf (merged list semantics already in place)
   - [x] Add one-shot wait API parity (Rust `on()` returns a future/JoinHandle). TS: `onOnce(topic, opts?)` that resolves on first event or timeout

2. Routing utilities and performance
   - [ ] Validate `findWildcardMatches` coverage equivalence vs Rust for deep wildcard scans
   - [ ] Add tests for `starts_with`, `child`, `parent`, `from_full_path`
   - [ ] Add negative tests (invalid multi-wildcard position; empty network; empty path)

3. Serializer alignment (local scope)
   - [ ] Canonical CBOR parity tests against known vectors (later, once FFI lands). For now: mark as non-canonical
   - [x] ArcValue: add `toJSON()` shape for diagnostics and logging
   - [ ] Implement `AnyValue` union aligned to Rust; add tests

4. Decorators (metadata only for now)
   - [ ] Define metadata registry accessors and types across packages
   - [ ] Add tests to verify decorator metadata capture and retrieval

5. Node tests (local E2E)
   - [ ] Sample `AbstractService` that registers an action in `init`, returns response
   - [ ] Verify `request` resolves; `publish` emits events
   - [ ] Verify `retain` + `includePast` replays in order; wildcard topic replay
   - [ ] Verify `unsubscribe` stops delivery; `stop()` calls service `stop`
   - [ ] Edge cases: unknown service/action → error; node not started → error

6. API ergonomics
   - [ ] Type-safe request/response helpers atop CBOR (typed codecs later)
   - [x] Logger façade matching Rust logging calls

7. Schemas
   - [ ] Mirror types and add schema-level tests for required fields/defaults
   - [ ] Consider versioning tags if present in Rust models

### Test Matrix (initial)

- Routing
  - `TopicPath.new` valid/invalid, wildcards/templates, `extract_params`
  - `PathTrie` exact match, single wildcard, multi wildcard, template match

- Node
  - Lifecycle: addService → start → request/publish → stop
  - Retain/includePast: publish retained events, then subscribe with includePast
  - Wildcard events: subscribe with wildcard pattern and verify delivery
  - Unsubscribe: ensure no further deliveries

### Risks / Notes

- CBOR canonical form: `cbor-x` does not guarantee canonical by default; acceptable for local parity. Will revisit when wiring Rust serializer/FFI.
- Performance: PathTrie implementation is functional; optimizations can follow once API parity is locked.
- Decorators are scaffolding-only for now; encryption is integrated via `runar-rust/runar-nodejs-api` (NAPI).

### Short-Term Execution Plan

- Add Node/Registry tests and refine registry ownership of local services
- Add `onOnce` API for one-shot waits (timeout-able)
- Add decorator tests and registry exports
- Expand routing tests (parent/child/from_full_path/invalid cases)
- Add a sample service and end-to-end tests under `runar-ts-node`
