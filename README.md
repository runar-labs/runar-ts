## runar-ts monorepo

- Bun-first workspace containing:
  - `runar-rust/runar-nodejs-api`: NAPI module exposing encryption, keystore, transport
  - `runar-ts-common`: shared TS utilities and types
  - `runar-ts-decorators`: decorators + metadata registry
  - `runar-ts-serializer`: canonical CBOR, `ArcValue`/`AnyValue`
  - `runar-ts-node`: Node runtime wrappers (keys/transport/discovery)

Environment variables:
  (N/A for NAPI usage. Build uses standard napi-rs tooling.)


