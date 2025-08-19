# runar-ts-ffi: TypeScript FFI wrapper + Node/Common/Serializer (Bun-first)

Goal: Implement the full TS stack (FFI wrapper + Node runtime + Common + Serializer with decorators) for CI/E2E, binding to Rust (`runar_ffi`) and mirroring the Swift design and APIs. Reference: [Swift FFI design](https://github.com/runar-labs/runar-swift/blob/integrate_ffi/SWIFT_NODE_FFI_DESIGN.md).

- Rust FFI: `runar_ffi` (keys + transporter + discovery + envelope helpers)
- TS packages (monorepo; Bun-first runtime):
  - `runar-ts-ffi` – thin loader/bindings for `runar_ffi` (C ABI)
  - `runar-ts-common` – common types, logging, errors, utilities
  - `runar-ts-decorators` – decorators (Swift macros equivalent) and metadata registry
  - `runar-ts-serializer` – ArcValue/AnyValue and canonical CBOR serializer; envelope helpers via FFI
  - `runar-ts-node` – Node runtime (services, messaging, discovery integration)

## Architecture

- FFI Binding Strategy
  - Prefer Bun FFI (bun:ffi) with C ABI; fallback loader for Node (node-ffi-napi + ref-napi) if needed
  - Out buffers (`uint8_t **out, size_t *len`) are read via Bun FFI using `ptr()` on out params and `toArrayBuffer(ptr,len)`, then freed with `rn_free(ptr,len)`
  - Map pointers to `void*` handles (`FfiKeysHandle`, `FfiTransportHandle`, `FfiDiscoveryHandle`) as opaque handles (BigInt or Buffer) hidden behind typed wrappers
  - Complex payloads as canonical CBOR `Uint8Array` per `runar_ffi/DESIGN.md`
  - Memory:
    - After copying returned buffers into JS `Uint8Array`, call `rn_free(ptr,len)`; for strings call `rn_string_free`
  - Errors: pass `RnError*` to every call; non-zero return → throw typed error; fallback `rn_last_error`

- Runtime
  - Shared Tokio runtime owned by `runar_ffi` (Option C)
  - Event delivery via polling: worker thread (Bun Worker) pumps `rn_transport_poll_event`
  - Discovery events are bound into the same poll stream (PeerDiscovered/Updated/Lost)

## Node Lifecycle (runar-ts-node)
  - Keys
    - Create keys handle: `rn_keys_new`
    - State persistence: export/import state CBOR; host encrypts with OS keyring (or configurable key) and stores blob
  - Transport
    - Construct via `rn_transport_new_with_keys` with options CBOR
    - Start/Stop with `rn_transport_start/stop`
    - Connectivity: `connect_peer`, `disconnect_peer`, `is_connected`
    - Messaging: `request`, `publish`, `complete_request`
    - Local info updates: `update_local_node_info`
  - Discovery
    - Construct via `rn_discovery_new_with_multicast` + `rn_discovery_bind_events_to_transport`
    - `rn_discovery_init` + `rn_discovery_start_announcing/stop_announcing`
    - `rn_discovery_update_local_peer_info`
  - Events (poll worker):
    - `PeerConnected`, `PeerDisconnected`, `RequestReceived`, `EventReceived`, `ResponseReceived`
    - `PeerDiscovered`, `PeerUpdated`, `PeerLost`
    - All as CBOR buffers decoded in JS to typed objects

## TypeScript Serializer (Decorators) – runar-ts-decorators + runar-ts-serializer

- Requirements
  - Provide a TS equivalent to `runar-serializer-macros` (Swift macros) using decorators for encryption metadata
  - Use `experimentalDecorators` + `emitDecoratorMetadata` with `reflect-metadata`

- Decorator API (proposal)
  - `@EncryptedClass(options?: { network?: string })` – marks a class as encrypted entity
  - `@EncryptedField(options?: { label?: string; profileRecipients?: (() => Uint8Array[]) })` – encrypted field; optional label maps to label resolver
  - `@PlainField()` – explicit opt-out field
  - Metadata Registry: runtime map of class -> fields and encryption policy

- Serialization Flow
  - `serialize(entity): Uint8Array` -> canonical CBOR map with schema version, metadata and plain fields; gather encrypted fields into payload
  - `encryptEnvelope(data: Uint8Array, opts): Uint8Array` -> use `rn_keys_encrypt_with_envelope` / `rn_keys_decrypt_envelope`
  - `deserialize(buf: Uint8Array): any` -> parse envelope, call FFI decrypt, reconstruct object and assign fields

- Label Resolver & Profiles
  - TS side provides label mapping for field labels to label identifiers; recipients are profile public keys (Uint8Array[]) and optional network id to FFI envelope encrypt

## ArcValue / AnyValue (runar-ts-serializer)

- `ArcValue<T>` (TS): immutable wrapper over canonical CBOR bytes with typed projection
  - Holds backing `Uint8Array` and a lazily-decoded cache
  - Methods: `serialize() -> Uint8Array`, `toJSON()`, `as<T>()`
- `AnyValue`: tagged union for primitive/composite values (align with Swift AnyValue)
  - Tags: Null, Bool, Int, Float, String, Bytes, Array<AnyValue>, Map<string, AnyValue>, Struct<T>
  - Canonical CBOR codec with stable field ordering

## Package Layout (TS Monorepo)

Workspace managed with Bun (preferred) with Node fallback.

- `runar-ts-ffi`
  - Loads `runar_ffi` (`.so/.dylib/.dll`)
  - Typed wrappers for each C function with Uint8Array/boolean/string conversions
  - Handles pointer lifetime and frees returned buffers; exposes `RunarFfiError`

- `runar-ts-common`
  - Common types (PeerInfo/NodeInfo mirrors), logging façade, error types, CBOR helpers

- `runar-ts-decorators`
  - Decorators + metadata registry (reflect-metadata)

- `runar-ts-serializer`
  - ArcValue/AnyValue + canonical CBOR codec
  - Depends on `runar-ts-ffi` for envelope encrypt/decrypt

- `runar-ts-node`
  - Keys + Transport + Discovery lifecycle
  - Event loop worker for polling; high-level request/publish/complete APIs
  - Converts typed TS models to CBOR and back

## Build & Distribution

- Rust CI builds `librunar_ffi` for each target; publishes artifacts
- `runar-ts-ffi` resolves the correct binary (from packaged artifacts or override env)
- Use `prebuildify` or similar for per-platform packaging (Node fallback); Bun loads via path

## Testing

- Bun/Vitest tests spin up two transports, exchange requests, assert event sequencing
- State persistence test: export CBOR → host keystore AEAD → restore

## Error Handling & Safety

- All FFI calls wrap error out; when non-zero, throw `RunarFfiError { code, message }`
- Use `rn_last_error` for diagnostics when message not provided
- Ensure all returned buffers are freed with `rn_free` and strings with `rn_string_free`

## Security Defaults

- Use strict TLS/PKI via keys; never expose insecure verifiers
- Message size/timeouts come from options CBOR; defaults set in Rust

## Task Checklist

- Bootstrapping
  - [ ] Create `runar-ts-ffi` with bindings to `runar_ffi` (Bun-first, Node fallback)
  - [ ] Implement memory/error helpers; Bun FFI + optional node-ffi-napi shim
  - [ ] Provide dynamic loader with platform resolution and override env

- Transport bridge (TS wrappers)
  - [ ] Wrap: new_with_keys/free/start/stop/local_addr
  - [ ] Wrap: connect_peer/disconnect/is_connected
  - [ ] Wrap: request/publish/complete_request
  - [ ] Wrap: update_local_node_info
  - [ ] Poller loop: decode CBOR events to typed TS objects

- Keys bridge (TS wrappers)
  - [ ] Wrap: keys_new/free/node_get_public_key/node_get_node_id
  - [ ] Wrap: node_generate_csr/mobile_process_setup_token/node_install_certificate
  - [ ] Wrap: node_export/import_state, mobile_export/import_state
  - [ ] Envelope helpers: encrypt_with_envelope/decrypt_envelope

- Serializer (runar-ts-decorators + runar-ts-serializer)
  - [ ] Decorator metadata registry using `reflect-metadata`
  - [ ] Serialize/deserialize to canonical CBOR
  - [ ] Envelope encryption/decryption via `runar-ts-ffi`

- Node runtime (`runar-ts-node`)
  - [ ] Keys + Transport lifecycle
  - [ ] Event dispatcher to user callbacks or Rx stream
  - [ ] High-level request/response API in TS

- CI
  - [ ] Build `runar_ffi` binaries per OS/arch in Rust CI and publish artifacts
  - [ ] Bun/Node CI consumes artifacts, runs E2E tests

## Notes

- Keep JS glue minimal; push crypto and networking to `runar_ffi`
- Prefer Uint8Array and CBOR end-to-end; avoid JSON in hot paths
- Use Workers for event polling if main thread needs to stay responsive


