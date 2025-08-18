## runar-ts monorepo

- Bun-first workspace containing:
  - `runar-ts-ffi`: FFI loader/bindings for `runar_ffi`
  - `runar-ts-common`: shared TS utilities and types
  - `runar-ts-decorators`: decorators + metadata registry
  - `runar-ts-serializer`: canonical CBOR, `ArcValue`/`AnyValue`
  - `runar-ts-node`: Node runtime wrappers (keys/transport/discovery)

Environment variables:
- `RUNAR_FFI_PATH`: absolute path to `librunar_ffi` (.so/.dylib/.dll)
- `RUNAR_RUST_REPO`: path to the Rust repo (used to auto-locate target outputs)


