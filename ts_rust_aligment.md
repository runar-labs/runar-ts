## Runar TS ↔ Rust Alignment Plan (Node, AnyValue, Events)

This document captures discrepancies between the current TypeScript node implementation and the Rust API/semantics, and defines a concrete plan to reach 100% behavioral and public API parity. The TS code should remain idiomatic TypeScript, but the external/public API, dataflow, and runtime behavior must match Rust exactly.

### Scope

- Node request/response APIs (service and path-based)
- Event system (publish/subscribe, retention, include_past)
- AnyValue usage and wire boundaries
- Remote adapter boundary and wire format
- Registry service exposure as part of public API

---

### Findings (TS current vs expected Rust parity)

- AnyValue in actions
  - Current (TS): Action handlers receive `ActionRequest` whose `payload` is `Uint8Array` CBOR bytes. Handlers call `AnyValue.fromBytes(...)` and return bytes via `AnyValue.from(...).serialize()`.
  - Expected (Rust parity): Actions receive `AnyValue` and return `AnyValue`. No serialization for local calls. Serialization only at network boundaries. The AnyValue instance must preserve lazy decode and decryption context.

- Node.request / Node.requestPath local path
  - Current: Always serializes `payload` into bytes even for local handlers, constructs `ActionRequest` with bytes, and expects handler to return bytes.
  - Expected: For local handlers, pass `AnyValue` directly to the handler, and receive `AnyValue` back. Only when calling the remote adapter should bytes be produced/consumed.

- EventMessage payload and subscriber signature
  - Current: `EventMessage.payload: Uint8Array`; subscribers decode with `AnyValue.fromBytes(...)`. `publish` and `publishPath` serialize input before local delivery.
  - Expected: `EventMessage.payload` must be `AnyValue`. Local publish should deliver `AnyValue` directly to subscribers; only remote bridging performs serialization.

- include_past semantics and retention
  - Current: `includePast` is supported as a count. Retention is per-topic (`networkId:service/event`) with a list of `{ ts, data }`. However, retained replay constructs events using the subscriber pattern literal as the `event` field, not the actual retained event name. The retained store also drops the event name, so it cannot reconstruct it precisely.
  - Expected: Retention must preserve the original event name (and ordering). Retained replay should deliver the actual event names and `AnyValue` payloads. Wildcard subscriptions should receive the concrete retained events with correct metadata.

- Wire boundary vs in-memory types
  - Current: Remote adapters accept/return `Uint8Array` (correct), but the in-memory Node APIs and handlers are also byte-oriented.
  - Expected: Only the wire boundary uses bytes. All in-memory action and event flows use `AnyValue`.

- Remote bridging path
  - Current: `LinkedNodesRemoteAdapter` decodes bytes to a JS value (`AnyValue.fromBytes(...).as<any>()`), calls `destNode.requestPath(path, value)`, waits for a value, re-serializes to bytes. This loses AnyValue’s lazy/decrypt context across the hop.
  - Expected: Introduce dedicated wire entrypoints on `Node` that accept/return bytes so a remote adapter can pass bytes through while preserving AnyValue semantics to the destination handler.

- LifecycleContext.publish signature
  - Current: `publish(eventName: string, payload: Uint8Array)` uses bytes.
  - Expected: `publish(eventName: string, payload: AnyValue)` for in-memory flows.

- RegistryService handlers
  - Current: Use `serialize()` and return bytes.
  - Expected: Return `AnyValue` directly for local flows.

---

### Required API changes (TS)

All changes are breaking across `runar-ts-common` and `runar-ts-node`. They are required for parity.

1. runar-ts-common public types
   - Change payload types from wire bytes to `AnyValue` for in-memory runtime primitives:
     - `ActionRequest.payload: AnyValue`
     - `ActionResponseOk.payload: AnyValue`
     - `EventMessage.payload: AnyValue`
     - `LifecycleContext.publish(eventName: string, payload: AnyValue): Promise<void>`
   - Keep `CborBytes` for wire-only context. Do not use it in action/event in-memory APIs.
   - Add an explicit comment that these are in-memory runtime types; bytes are handled at network boundary.

2. runar-ts-node Node public API
   - `request<TReq, TRes>(service, action, payload: TReq): Promise<TRes>`
     - Local: wrap `payload` with `AnyValue.from(payload)` and pass to handler (no serialization). Expect `ActionResponseOk.payload` to be `AnyValue` and `.as<TRes>()` to return result.
     - Remote fallback: serialize `AnyValue` to bytes to call remote adapter; decode response bytes into `AnyValue` then `.as<TRes>()`.
   - `requestPath<TReq, TRes>(path, payload: TReq): Promise<TRes>`
     - Same as above, but using the path API.
   - `publish<T>(service, event, payload: T, options?: { retain?: boolean }): Promise<void>`
     - Local: deliver `AnyValue` directly to subscribers.
     - Remote: serialize to bytes and forward only if there are no local subscribers (retain TS behavior unless Rust specifies otherwise).
   - `publishPath<T>(path, payload: T, options?: { retain?: boolean }): Promise<void>`
     - Same as above with path-based routing.

3. New wire entrypoints on Node
   - `requestPathWire(path: string, payloadBytes: Uint8Array): Promise<Uint8Array>`
     - Construct `AnyValue.fromBytes(payloadBytes)`, call local action handler (which receives `AnyValue`), take `AnyValue` response, and serialize to bytes.
   - `publishPathWire(path: string, payloadBytes: Uint8Array): Promise<void>`
     - Construct `AnyValue.fromBytes(payloadBytes)` and publish locally to subscribers with `AnyValue` payload; apply retention as `AnyValue`.
   - These allow remote adapters to preserve AnyValue semantics across hops without lossy decode/encode to raw JS values.

4. Event retention and include_past
   - Retention store should keep `{ ts, event: string, payload: AnyValue }` so we can replay the real event name and payload (not the subscription pattern).
   - `includePast` delivery must build `EventMessage` with the original `event` name and `AnyValue` payload.
   - Confirm ordering policy: TS currently sorts by timestamp ascending and delivers the last N. Keep if Rust does the same; otherwise match Rust’s specified ordering precisely.
   - Ensure multi-wildcard/topic patterns return all matching retained events with correct service/event metadata.

5. RemoteAdapter remains wire-level
   - Keep `RemoteAdapter.request(path: string, payload: Uint8Array): Promise<Uint8Array>` and `publish(path: string, payload: Uint8Array): Promise<void>`.
   - Update `LinkedNodesRemoteAdapter` to use the new `node.requestPathWire` and `node.publishPathWire` to avoid lossy conversions.

6. RegistryService
   - Update action handlers to return `AnyValue` directly (no `serialize()`), relying on Node to convert to bytes only for remote calls.

7. Tests
   - Update all tests registering action handlers to accept `request.payload` as `AnyValue` and return `AnyValue` in the `ActionResponseOk`.
   - Update event tests to read `evt.payload` as `AnyValue` directly (no `fromBytes`).
   - Add tests for `requestPathWire` and `publishPathWire` to ensure preservation of AnyValue semantics across remote adapters.
   - Add tests verifying retained replay preserves real event names and ordering with wildcard patterns.

---

### Concrete edit plan (files and key edits)

- runar-ts-common/src/index.ts
  - Change:
    - `type CborBytes = Uint8Array` stays.
    - `ActionRequest.payload: AnyValue` (import from `runar-ts-serializer`).
    - `ActionResponseOk.payload: AnyValue`.
    - `EventMessage.payload: AnyValue`.
    - `LifecycleContext.publish(_: string, payload: AnyValue): Promise<void>`.
  - Ensure package depends on `runar-ts-serializer` for the `AnyValue` type.

- runar-ts-node/src/index.ts (`Node`)
  - `request`/`requestPath`: do not serialize for local; pass/receive `AnyValue`.
  - `publish`/`publishPath`: deliver `AnyValue` locally; only serialize when forwarding to remote.
  - Add: `requestPathWire` and `publishPathWire` as described.
  - Retention changes:
    - Store `{ ts, event, payload: AnyValue }` per topic key.
    - For replay, deliver actual `event` and `AnyValue` payload; preserve ordering.

- runar-ts-node/src/remote.ts
  - `LinkedNodesRemoteAdapter` should call `destNode.requestPathWire` / `publishPathWire` with bytes to preserve AnyValue semantics end-to-end.
  - No changes to `NapiRemoteAdapter` wire contracts.

- runar-ts-node/src/registry_service.ts
  - Return `AnyValue` in responses without calling `.serialize()`; rely on Node to serialize for remote calls.

- Tests under runar-ts-node/test
  - Replace `AnyValue.fromBytes(req.payload)` with direct `req.payload.as<...>()` because `payload` becomes `AnyValue`.
  - Build responses using `AnyValue.from(...)` directly in `ActionResponseOk.payload`.
  - Event assertions: read `evt.payload.as<...>()` and verify replay with `includePast` preserves the concrete `event` names when needed.
  - Add tests covering wire entrypoints and wildcard retained replay ordering.

---

### Open questions to confirm against Rust (non-guessing items)

- Exact `include_past` semantics
  - Is it a count (usize) of events, time window, or a boolean with a default limit? TS currently uses number-of-events; confirm parity.
- Retention limits
  - TS uses `maxRetainedPerTopic = 100`. Confirm Rust’s default and whether it is configurable per topic or global.
- Remote publish forwarding rule
  - TS forwards to remote only if there are no local subscribers. Confirm Rust behavior for mixed local/remote topologies.
- Action request/response metadata
  - Confirm if additional metadata (type names, categories) needs to be exposed alongside `AnyValue` in requests in Rust.

Please provide links to the authoritative Rust definitions if these differ so we can adjust TS to exact parity.

---

### Migration strategy

1. Type changes in `runar-ts-common` (introduce `AnyValue` payloads) and bump versions of dependent packages.
2. Refactor `Node` methods to in-memory `AnyValue` flows; add wire entrypoints.
3. Update `LinkedNodesRemoteAdapter` to call wire entrypoints.
4. Update `RegistryService` to return `AnyValue`.
5. Update tests and add new coverage for wire entrypoints and retained replay correctness.
6. Verify all transports still pass bytes and interoperate with Rust wire format.

---

### Acceptance criteria

- Local actions receive `AnyValue` and return `AnyValue`; zero serialization for local calls.
- Event subscribers receive `AnyValue`; retention and `include_past` replay real event names and correct ordering.
- Remote adapters continue to use bytes; wire entrypoints preserve AnyValue semantics over the network.
- All existing tests updated; add tests for wire entrypoints and retained replay; all green.
- Cross-language roundtrips verified with Rust using the same wire format.
