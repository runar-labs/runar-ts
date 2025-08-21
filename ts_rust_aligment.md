## Runar TS ↔ Rust Alignment Plan (Node, AnyValue, Events)

This document captures discrepancies between the current TypeScript node implementation and the Rust API/semantics, and defines a concrete plan to reach 100% behavioral and public API parity. The TS code should remain idiomatic TypeScript, but the external/public API, dataflow, and runtime behavior must match Rust exactly.

### Scope

- Node request/response APIs (service and path-based)
- Event system (publish/subscribe, retention, include_past)
- AnyValue usage and wire boundaries
- Remote adapter boundary and wire format
- Registry service exposure as part of public API
- Service lifecycle and AbstractService interface
- Path-based routing and TopicPath semantics
- Error handling with Result types

---

## 🚫 Critical Rules - No Exceptions

### 1. NO FALLBACKS - Single Path Execution

**This is a critical rule with no exceptions.**

- **❌ FORBIDDEN**: Try one type, fallback to another
- **✅ REQUIRED**: Expect exact type, fail if mismatch

```typescript
// ❌ FORBIDDEN - Fallback pattern
const stringResult = payload.as<string>();
if (stringResult.ok) {
  return ok(AnyValue.from(stringResult.value));
} else {
  // Fallback - THIS IS A BUG
  const bytesResult = payload.as<Uint8Array>();
  if (bytesResult.ok) {
    return ok(AnyValue.from(new TextDecoder().decode(bytesResult.value)));
  }
}

// ✅ REQUIRED - Single path execution
const stringResult = payload.as<string>();
if (!stringResult.ok) {
  return err('Expected string payload');
}
return ok(AnyValue.from(stringResult.value));
```

### 2. Action Handlers - Clean API Compliance

Action handlers **MUST** follow this exact signature:

```typescript
type ActionHandler = (
  payload: AnyValue,
  context: RequestContext
) => Promise<Result<AnyValue, string>>;
```

**❌ FORBIDDEN**:

- Dealing with `requestId`
- Manual serialization (`AnyValue.fromBytes()`, `.serialize()`)
- Complex return objects
- Fallback logic
- Type `unknown`

**✅ REQUIRED**:

- Pure business logic only
- Simple `Result<AnyValue, string>` returns
- Trust framework for serialization/networking
- Exact type checking with `AnyValue.as<T>()`

### 3. Framework Trust - Don't Reimplement

**Trust the framework to handle**:

- Serialization/deserialization (CBOR at wire boundaries)
- Encryption/decryption (for remote calls)
- Network transport (local vs remote routing)
- Request ID management
- Type safety validation

---

### Comprehensive Rust API Analysis

#### Core Types (Rust)

- **TopicPath**: Hierarchical routing with `network:service/action` format
- **ArcValue**: Type-safe serialization (equivalent to TS AnyValue)
- **AbstractService**: Trait for service lifecycle (`init`, `start`, `stop`)
- **LifecycleContext**: Service context with `request()`, `publish()`, `register_action()`
- **Result<T, E>**: Error handling pattern (equivalent to TS Result)
- **ServiceState**: Enum for service lifecycle states
- **ActionHandler**: Async function type `(Option<ArcValue>, RequestContext) -> Result<ArcValue>`

#### Public Node API (Rust)

```rust
pub async fn request<P>(&self, path: &str, payload: Option<P>) -> Result<ArcValue>
pub async fn publish(&self, topic: &str, data: Option<ArcValue>) -> Result<()>
pub async fn publish_with_options(&self, topic: &str, data: Option<ArcValue>, options: PublishOptions) -> Result<()>
pub fn on(&self, topic: impl Into<String>, options: Option<OnOptions>) -> JoinHandle<Result<Option<ArcValue>>>
pub async fn subscribe(&self, topic: &str, callback: EventHandler, options: Option<EventRegistrationOptions>) -> Result<String>
pub async fn unsubscribe(&self, subscription_id: &str) -> Result<()>
```

#### LifecycleContext API (Rust)

```rust
pub async fn request<P>(&self, topic: impl AsRef<str>, payload: Option<P>) -> Result<ArcValue>
pub async fn publish(&self, topic: &str, data: Option<ArcValue>) -> Result<()>
pub async fn publish_with_options(&self, topic: impl AsRef<str>, data: Option<ArcValue>, options: PublishOptions) -> Result<()>
pub async fn on(&self, topic: impl AsRef<str>, options: Option<OnOptions>) -> Result<Option<ArcValue>>
pub async fn register_action(&self, action_name: impl Into<String>, handler: ActionHandler) -> Result<()>
pub async fn subscribe(&self, topic: &str, callback: EventHandler, options: Option<EventRegistrationOptions>) -> Result<String>
```

---

### Critical Misalignments (TS current vs Rust parity)

#### 1. AnyValue vs Bytes Throughout System

- **Rust**: All in-memory operations use `ArcValue`, serialization only at wire boundaries
- **TS Current**: Action handlers receive `ActionRequest.payload: Uint8Array`, must decode with `AnyValue.fromBytes()`
- **TS Required**: `ActionRequest.payload: AnyValue`, handlers work directly with AnyValue

#### 2. Event System Type Mismatch

- **Rust**: `EventMessage.payload: ArcValue`, subscribers receive `ArcValue`
- **TS Current**: `EventMessage.payload: Uint8Array`, subscribers call `AnyValue.fromBytes()`
- **TS Required**: `EventMessage.payload: AnyValue`, local delivery preserves AnyValue

#### 3. Action Handler Signatures (CRITICAL)

- **Rust**: `ActionHandler = (ArcValue, RequestContext) -> Result<ArcValue>`
- **TS Current**: Handlers receive `ActionRequest<Uint8Array>` and return complex objects with `requestId`
- **TS Required**: `ActionHandler = (payload: AnyValue, context: RequestContext) => Promise<Result<AnyValue, string>>`
- **Key Rule**: Handlers NEVER deal with requestId, serialization, or complex return objects

#### 4. LifecycleContext Method Signatures

- **Rust**: `publish(topic: &str, data: Option<ArcValue>)`
- **TS Current**: `publish(eventName: string, payload: Uint8Array)`
- **TS Required**: `publish(eventName: string, payload: AnyValue)`

#### 5. Node Request/Response Flow

- **Rust**: Local requests pass `ArcValue` directly to handlers
- **TS Current**: Always serializes to bytes even for local calls
- **TS Required**: Local calls preserve `AnyValue`, only remote calls use bytes

#### 6. Result Type Usage

- **Rust**: All operations return `Result<T, E>` for error handling
- **TS Current**: Mix of direct returns and custom error handling
- **TS Required**: Consistent `Result<T, E>` pattern throughout

#### 7. Service Lifecycle Interface

- **Rust**: `AbstractService` trait with `init()`, `start()`, `stop()` async methods
- **TS Current**: No equivalent interface
- **TS Required**: `AbstractService` interface matching Rust trait

#### 8. Path-based Routing Semantics

- **Rust**: Actions use `service/action_name` format (slashes allowed)
- **TS Current**: Validation incorrectly rejects slashes in action names
- **TS Required**: Allow slashes in action names, match Rust path semantics

#### 9. Remote Adapter Architecture

- **Rust**: No "LinkedNodesRemoteAdapter" concept - remote adapters work at wire level
- **TS Current**: Has non-existent `LinkedNodesRemoteAdapter` and `requestPathWire`/`publishPathWire`
- **TS Required**: Remove fabricated APIs, align with Rust's remote adapter model

#### 10. Retention and include_past Semantics

- **Rust**: Retention preserves original event names, include_past uses Duration
- **TS Current**: Retention loses event names, include_past uses count
- **TS Required**: Match Rust's retention and replay behavior exactly

---

### Required API Changes (TS) - Concrete Implementation Plan

All changes are breaking and required for 100% Rust API parity.

#### 1. Core Type Changes (runar-ts-common/src/index.ts)

- **ActionRequest.payload**: `AnyValue` (from `Uint8Array`)
- **ActionResponseOk.payload**: `AnyValue` (from `Uint8Array`)
- **EventMessage.payload**: `AnyValue` (from `Uint8Array`)
- **LifecycleContext.publish**: `(eventName: string, payload: AnyValue) => Promise<void>` (from `Uint8Array`)
- **Add AbstractService interface**: Match Rust trait with `init()`, `start()`, `stop()` methods
- **Add ServiceState enum**: Match Rust `ServiceState` exactly
- **Add Result<T, E> utility**: For consistent error handling

#### 2. Node Public API Changes (runar-ts-node/src/index.ts)

- **request<TReq, TRes>(service, action, payload)**: Local calls use AnyValue directly, remote calls serialize
- **requestPath<TReq, TRes>(path, payload)**: Same as request but with path-based routing
- **publish<T>(service, event, payload, options?)**: Local delivery uses AnyValue, remote serializes
- **publishPath<T>(path, payload, options?)**: Same as publish with path-based routing
- **on(topic, options?)**: Match Rust signature with proper async handling
- **subscribe(topic, callback, options?)**: Match Rust signature
- **unsubscribe(subscriptionId)**: Match Rust signature

#### 3. Action Handler Changes (CRITICAL)

- **Current**: `(req: ActionRequest<Uint8Array>, ctx) => Promise<{ok: boolean, requestId: string, payload?: Uint8Array, error?: string}>`
- **Required**: `(payload: AnyValue, context: RequestContext) => Promise<Result<AnyValue, string>>`
- **Key Changes**:
  - Receive `AnyValue` directly (not `ActionRequest`)
  - Receive `RequestContext` (not `LifecycleContext`)
  - Return simple `Result<AnyValue, string>` (not complex object with requestId)
  - No serialization/deserialization in handler code
  - No fallback logic - single path execution

#### 3.1 RequestContext Interface (NEW)

```typescript
interface RequestContext {
  networkId: string;
  servicePath: string;
  requestId: string; // Internal - handlers don't use this
  // Additional context fields as needed
}
```

#### 4. Event System Changes

- **EventMessage.payload**: `AnyValue` (from `Uint8Array`)
- **Subscriber callbacks**: Receive `AnyValue` directly
- **Local publish**: Deliver `AnyValue` to subscribers without serialization
- **Remote publish**: Serialize `AnyValue` to bytes for wire transport

#### 5. Service Lifecycle Changes

- **Add AbstractService interface**:
  ```typescript
  interface AbstractService {
    name(): string;
    version(): string;
    path(): string;
    description(): string;
    networkId(): Option<string>;
    setNetworkId(networkId: string): void;
    init(context: LifecycleContext): Promise<void>;
    start(context: LifecycleContext): Promise<void>;
    stop(context: LifecycleContext): Promise<void>;
  }
  ```

#### 6. Path-based Routing Changes

- **Remove colon validation** in `TopicPath.newActionTopic()` - allow slashes in action names
- **Match Rust behavior**: Action names like `"services/list"` are valid
- **Fix TopicPath error handling**: Use Result types consistently

#### 7. Remote Adapter Changes

- **REMOVE LinkedNodesRemoteAdapter**: Non-existent in Rust
- **REMOVE requestPathWire/publishPathWire**: Non-existent in Rust
- **Keep RemoteAdapter interface**: Wire-level bytes only
- **Align with Rust**: Remote adapters work at byte level only

#### 8. Registry Service Changes

- **Handler signatures**: Return `AnyValue` directly, no `serialize()`
- **Node handles serialization**: Only for remote calls
- **Match Rust behavior**: Local calls preserve AnyValue semantics

---

### Concrete Implementation Plan (Files and Key Edits)

#### Phase 1: Core Type Changes (runar-ts-common)

1. **runar-ts-common/src/index.ts**
   - Change `ActionRequest.payload: Uint8Array` → `AnyValue`
   - Change `ActionResponseOk.payload: Uint8Array` → `AnyValue`
   - Change `EventMessage.payload: Uint8Array` → `AnyValue`
   - Change `LifecycleContext.publish(eventName: string, payload: Uint8Array)` → `AnyValue`
   - Add `AbstractService` interface matching Rust trait
   - Add `ServiceState` enum matching Rust exactly
   - Add `Result<T, E>` utility functions

2. **runar-ts-common/src/routing/TopicPath.ts**
   - Remove colon validation in `newActionTopic()` - allow slashes in action names
   - Ensure all methods return proper `Result` types
   - Match Rust path semantics exactly

#### Phase 2: Node API Changes (runar-ts-node)

3. **runar-ts-node/src/index.ts (Node class)**
   - Modify `request()`/`requestPath()`: Local calls use AnyValue, remote calls serialize
   - Modify `publish()`/`publishPath()`: Local delivery preserves AnyValue, remote serializes
   - Update `on()`/`subscribe()`/`unsubscribe()` to match Rust signatures
   - Fix retention to preserve original event names and use AnyValue
   - Fix include_past to use Duration instead of count

4. **runar-ts-node/src/remote.ts**
   - **REMOVE** `LinkedNodesRemoteAdapter` completely (non-existent in Rust)
   - **REMOVE** `requestPathWire`/`publishPathWire` methods (non-existent in Rust)
   - Keep `RemoteAdapter` interface for wire-level bytes only
   - Align remote adapter behavior with Rust wire-level semantics

#### Phase 3: Service Implementation Changes

5. **runar-ts-node/src/registry_service.ts**
   - Update action handlers to return `AnyValue` directly (no `serialize()`)
   - Trust Node to handle serialization for remote calls only
   - Match Rust registry service behavior exactly

6. **runar-ts-node/src/index.ts (LifecycleContext)**
   - Update `publish()` method to use `AnyValue` instead of bytes
   - Ensure all context methods match Rust signatures exactly

#### Phase 4: Test Updates

7. **Test files under runar-ts-node/test/**
   - Update action handlers to receive `AnyValue` and return `AnyValue`
   - Update event subscribers to work with `AnyValue` payloads
   - Add tests for `AbstractService` interface
   - Add tests for proper Result type handling
   - Remove tests for deleted `LinkedNodesRemoteAdapter`

---

### Migration Strategy (Breaking Changes Required)

1. **Type System Migration**
   - Update core types in runar-ts-common (breaking change)
   - Add Result<T, E> pattern throughout
   - Implement AbstractService interface

2. **Node API Migration**
   - Change request/response flow to preserve AnyValue for local calls
   - Update publish/subscribe to use AnyValue locally
   - Fix retention and include_past semantics
   - Remove non-existent APIs

3. **Service Migration**
   - Update RegistryService to return AnyValue directly
   - Update LifecycleContext methods to match Rust
   - Implement proper error handling with Result types

4. **Test Migration**
   - Update all test handlers and subscribers
   - Add new test coverage for alignment
   - Remove tests for deleted functionality

---

### Open Questions (Resolved from Rust Code Analysis)

1. **include_past semantics**: Uses `std::time::Duration` (time window), not count
2. **Retention limits**: Need to verify default limits and configurability from Rust code
3. **Remote publish forwarding**: Need to verify exact Rust behavior for mixed local/remote
4. **Action metadata**: Need to verify if type names/categories are exposed in Rust

**Action Required**: Review runar-rust source code for these specific details.

---

### Acceptance Criteria (100% Rust Parity)

1. **AnyValue Semantics**
   - ✅ Local actions receive `AnyValue` and return `AnyValue` (no serialization)
   - ✅ Event subscribers receive `AnyValue` directly
   - ✅ Remote adapters use bytes only at wire boundary
   - ✅ AnyValue lazy decode and encryption context preserved locally

2. **Public API Alignment**
   - ✅ Node methods match Rust signatures exactly
   - ✅ LifecycleContext methods match Rust signatures exactly
   - ✅ AbstractService interface matches Rust trait exactly
   - ✅ ServiceState enum matches Rust exactly
   - ✅ Result<T, E> pattern used consistently

3. **Path-based Routing**
   - ✅ TopicPath behavior matches Rust exactly
   - ✅ Action names can contain slashes (e.g., `"services/list"`)
   - ✅ Wildcard patterns work identically to Rust
   - ✅ Template parameters work identically to Rust

4. **Event System**
   - ✅ Retention preserves original event names and AnyValue payloads
   - ✅ include_past uses Duration (time window) like Rust
   - ✅ Wildcard subscriptions receive concrete events with correct metadata
   - ✅ Local publish delivers AnyValue directly to subscribers

5. **Remote Adapter Alignment**
   - ✅ `LinkedNodesRemoteAdapter` removed (non-existent in Rust)
   - ✅ `requestPathWire`/`publishPathWire` removed (non-existent in Rust)
   - ✅ RemoteAdapter works at wire level only, matching Rust

6. **Service Lifecycle**
   - ✅ AbstractService trait implemented matching Rust
   - ✅ Service initialization, start, stop flow matches Rust
   - ✅ Registry service behavior matches Rust exactly

7. **Error Handling**
   - ✅ Result<T, E> pattern used throughout, matching Rust
   - ✅ Error messages and types match Rust behavior
   - ✅ Graceful error handling for invalid paths and operations

8. **Cross-language Compatibility**
   - ✅ Wire format matches Rust exactly (CBOR + headers)
   - ✅ Path semantics identical to Rust
   - ✅ Request/response flow identical to Rust
   - ✅ Event publish/subscribe flow identical to Rust

---

### Implementation Priority

**High Priority (Core Functionality)**

1. ✅ Remove LinkedNodesRemoteAdapter and wire methods
2. ✅ Fix AnyValue vs bytes throughout system
3. ✅ Update action handler signatures
4. ✅ Update event system to use AnyValue
5. ✅ Fix path-based routing validation

**Medium Priority (API Alignment)** 6. 🔄 Add AbstractService interface 7. 🔄 Update Node public API signatures 8. 🔄 Fix Result type usage throughout 9. 🔄 Update LifecycleContext methods

**Low Priority (Advanced Features)** 10. 🔄 Fix retention and include_past semantics 11. 🔄 Update all tests 12. 🔄 Cross-language roundtrip testing

**Status**: High priority items completed. Ready to proceed with medium priority items for complete alignment.
