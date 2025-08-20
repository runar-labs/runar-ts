# runar-ts-bun-ffi (parked)

This package contains Bun-specific FFI bindings. Development is paused due to reproducible bun:ffi issues on Linux:

- cstring return values sometimes arrive as non-strings
- cstring out-parameters and even minimal mock functions segfault at call-time
- Bytes-out variants for newly added symbols also segfaulted before entering Rust

We followed Bun’s documented rules for pointers and strings, including:
- Using TypedArray/DataView for out parameters and `ptr()` only on those
- Passing null-terminated Uint8Array for cstring inputs
- Reading returned buffers via `toArrayBuffer(ptr, 0, len)` and freeing with `rn_free`/`rn_string_free`

References:
- Bun FFI docs: https://bun.com/docs/api/ffi

We’ve prepared a minimal, vendor-agnostic repro for Bun’s issue tracker using a tiny Rust `cdylib` with only two test exports: cstring return and cstring out.

Lessons learned:
- Prefer byte buffers (`uint8_t**`, `size_t*`) over cstring in FFI, unless the runtime’s FFI is known-stable
- Always allocate pointer-sized out params (`BigUint64Array` in Bun) for alignment
- Minimize symbol maps when diagnosing wrapper generation bugs
- Keep a single, stable dispatcher signature to reduce wrapper variability

We will revisit Bun after upstream fixes land. Meanwhile, Node.js FFI support will live in `runar-ts-node-ffi`.
