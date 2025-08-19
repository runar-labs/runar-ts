AnyValue (TS) – Finalized Design (mirrors Rust semantics, TS-idiomatic)

Goals
- Provide a single wrapper type AnyValue<T = unknown> that matches Rust’s ArcValue behavior while using TS naming and ergonomics.
- Ensure full cross-language interoperability (Rust/Swift/Kotlin) by reproducing the exact binary wire format used by Rust.
- Preserve lazy decode, zero-serialization for local calls, and decrypt-on-demand semantics identical to Rust.

Decisions (from review)
- Wire format: EXACT parity with Rust (header layout, categories, encrypted flag, type name tagging). Interop is mandatory.
- Type naming & mapping: Use the same embedded type identifiers as Rust. On TS, resolve to TS classes via a local registry built by decorators (no payload changes). A local registry maps cross-lang type identifiers → TS constructors/decoders. (Future: we may adopt a platform-independent type naming scheme; for now, mirror Rust to ship.)
- Decryption context: Never passed to as<T>(). When bytes are loaded (deserialize), the lazy context (SerializationContext-equivalent: label resolver, recipients/keys metadata, etc.) is embedded inside AnyValue. Local values (AnyValue.from(value)) have no lazy context; as<T>() returns directly from memory.
- API simplification vs Rust: No Ref variants in TS. We always return strong references. Methods like asListRef/asMapRef are unnecessary; as<T>() can return Array<T> or Record<string, T> directly.
- Caching: Cache per target type. Multiple as<T>() for different T on the same instance are supported with independent caches. If a requested type is not cached and the instance was created from an in-memory value (not serialized), return a Result error (do not throw). We will use Result-style APIs across the surface for error reporting instead of exceptions.
- Categories: ValueCategory: Null, Primitive, Bytes, List, Map, Struct, Json, Encrypted. Keep category(), isNull(), toJSON(). Caveat: if category proves unnecessary in TS (unlike Rust), we may remove it later. Keep it now for parity and diagnostics.
- JSON/Struct hydration: Use decorator-based registry to construct TS class instances where applicable. Decorators build metadata allowing object literals to be hydrated into their proper class instances.
- Error semantics: Mirror Rust’s precise error messages (e.g., bounds checks like “Invalid type name length”). Prefer Result-returning functions over throw/try-catch for predictable control flow.
- Performance: Zero-copy and zero-serialization for local calls; serialization occurs only at boundaries (network or before encryption). Lazy decode on demand.

Public API (TS)
- Result type
  - Define a lightweight Result<V, E> for all fallible operations (no throws):
    - { ok: true, value: V } | { ok: false, error: Error }
- Construction
  - AnyValue.from<T>(value: T)  // local in-memory; no lazy context
  - AnyValue.fromBytes(bytes: Uint8Array, ctx?: DeserializationContext)  // deserialize header, embed lazy context (encryption/label resolver, etc.)
    - Note: AnyValue.from<Uint8Array>(bytes) would treat bytes as a primitive “bytes” value (no header parse). fromBytes() is specifically the deserialization path.
- Introspection
  - category(): ValueCategory (may be deprecated later if not needed)
  - isNull(): boolean
  - toJSON(): unknown
- Extraction (Result-based)
  - as<T>(): Result<T, Error>  (if encrypted and T is plaintext type, triggers lazy decrypt via embedded context)
  - asBytes(): Result<Uint8Array, Error>  (for Bytes category)
  - asList<T>(): Result<T[], Error>
  - asMap<T>(): Result<Record<string, T>, Error>
- Serialization
  - serialize(): Result<Uint8Array, Error>  (writes exact Rust-compatible wire format)
    - Note: we may later improve Rust side to adopt platform-independent type names; for now, mirror Rust exactly and iterate later.
- Type registry
  - SerializerRegistry.register(typeName: string, ctor: Constructor, decoder?: (bytes) => any)
  - Decorators populate this registry at load time; payload type identifiers are matched to TS types.

Runtime Behavior
- Local calls (in-memory): Node/request handlers pass AnyValue created with AnyValue.from(value). No lazy context is stored; as<T>() returns the original value with { ok: true, value }.
- Network/encrypted payloads: AnyValue is constructed with fromBytes. The deserializer parses the Rust-compatible header, stores category/type metadata and an embedded lazy context containing everything needed to decrypt/deserialize later. as<T>() uses that context; no external ctx param.
- Dual extraction from the same bytes:
  - as<EncryptedFoo>() → exposes encrypted structure/bytes without decryption
  - as<Foo>() → decrypts via embedded context and returns plaintext struct instance
- Caching per target-type extraction; subsequent as<T>() returns the cached value. If the instance is in-memory (from(value)) and a different T is requested that cannot be derived, return { ok: false, error }.

Interoperability Notes
- Header format, category tags, type name encoding, and envelope layout MUST match Rust. Implement a byte-for-byte compatible reader/writer.
- Type names used by Rust remain authoritative; TS registry maps those names to TS decoders/constructors. (Future: consider cross-platform type namespaces.)

Planned Tests (guided by Rust)
- Primitive/Bytes/List/Map/Json/Struct roundtrips with lazy decode
- Bounds checks (malformed headers), precise error messages
- Dual extraction (EncryptedFoo vs Foo) from the same AnyValue
- Registry-based TS class hydration using decorators
- Zero-serialization for local calls; serialization only at boundaries

Open Items / Implementation Notes
- Exact Rust header layout: replicate from runar-serializer (categories, encrypted flag, type name length, offsets). Mirror arc_value_test cases including bounds checks and malformed payloads.
- Container shapes: default Record<string, T> for maps; Map<string, T> can be added if needed.
- Decorators/registry: decorators record typeName and field metadata to allow correct hydration and to support encryption metadata consistently.

Next Steps
- Implement ValueCategory and wire-format-compatible reader/writer in TS.
- Implement SerializerRegistry and decorator integration.
- Port test concepts from arc_value_test.rs, basic_serialization_test.rs, composite_container_test.rs, and parts of encryption_test.rs (FFI stubs for cryptography until wired).