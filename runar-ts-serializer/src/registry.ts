import { Result, ok, err, isErr } from 'runar-ts-common/src/error/Result.js';
import type { CommonKeysInterface } from './keystore/device_caps.js';
import type { LabelResolver } from './label_resolver.js';

export type Constructor<T = unknown> = new (...args: unknown[]) => T;

export interface TypeEntry {
  ctor: Constructor;
  decoder?: (bytes: Uint8Array) => unknown;
}

// Type definitions for registry functions
export type EncryptFn<T = unknown> = (
  value: T,
  keystore: CommonKeysInterface,
  resolver: LabelResolver
) => Result<Uint8Array>;
export type DecryptFn<T = unknown> = (
  bytes: Uint8Array,
  keystore: CommonKeysInterface
) => Result<T>;
export type ToJsonFn<T = unknown> = (value: T) => unknown;

// Registry for type resolution (matches Rust functionality)
const typeNameToEntry = new Map<string, TypeEntry>();

// Registry for encrypt/decrypt functions
const encryptRegistry = new Map<string, EncryptFn>();
const decryptRegistry = new Map<string, DecryptFn>();

// Registry for JSON converters
const jsonRegistryByRustName = new Map<string, ToJsonFn>();
const wireNameToJson = new Map<string, ToJsonFn>();

// Wire name registry (Rust type name -> wire name)
const rustTypeToWireName = new Map<string, string>();
const wireNameToRust = new Map<string, string>();

// Encrypted companion registry (for asType<T> dual-mode semantics)
const plainTypeToEncryptedCompanion = new Map<string, Constructor>();
const encryptedCompanionToPlainType = new Map<string, Constructor>();

export function registerType(typeName: string, entry: TypeEntry): Result<void, Error> {
  if (!typeName || typeof typeName !== 'string') {
    return err(new Error('Type name must be a non-empty string'));
  }
  if (!entry || typeof entry !== 'object') {
    return err(new Error('Type entry must be a valid object'));
  }
  if (!entry.ctor || typeof entry.ctor !== 'function') {
    return err(new Error('Type entry must have a valid constructor'));
  }

  typeNameToEntry.set(typeName, entry);
  return ok(undefined);
}

export function resolveType(typeName: string): Result<TypeEntry, Error> {
  if (!typeName || typeof typeName !== 'string') {
    return err(new Error('Type name must be a non-empty string'));
  }

  const entry = typeNameToEntry.get(typeName);
  if (!entry) {
    return err(new Error(`Type '${typeName}' not found in registry`));
  }

  return ok(entry);
}

export function clearRegistry(): void {
  typeNameToEntry.clear();
  encryptRegistry.clear();
  decryptRegistry.clear();
  jsonRegistryByRustName.clear();
  wireNameToJson.clear();
  rustTypeToWireName.clear();
  wireNameToRust.clear();
  plainTypeToEncryptedCompanion.clear();
  encryptedCompanionToPlainType.clear();
}

// Wire name registration
export function registerWireName(rustTypeName: string, wireName: string): Result<void, Error> {
  if (!rustTypeName || typeof rustTypeName !== 'string') {
    return err(new Error('Rust type name must be a non-empty string'));
  }
  if (!wireName || typeof wireName !== 'string') {
    return err(new Error('Wire name must be a non-empty string'));
  }

  rustTypeToWireName.set(rustTypeName, wireName);
  wireNameToRust.set(wireName, rustTypeName);
  return ok(undefined);
}

export function lookupWireName(rustTypeName: string): Result<string, Error> {
  if (!rustTypeName || typeof rustTypeName !== 'string') {
    return err(new Error('Rust type name must be a non-empty string'));
  }

  const wireName = rustTypeToWireName.get(rustTypeName);
  if (!wireName) {
    return err(new Error(`No wire name found for Rust type '${rustTypeName}'`));
  }

  return ok(wireName);
}

export function lookupRustName(wireName: string): Result<string, Error> {
  if (!wireName || typeof wireName !== 'string') {
    return err(new Error('Wire name must be a non-empty string'));
  }

  const rustName = wireNameToRust.get(wireName);
  if (!rustName) {
    return err(new Error(`No Rust type found for wire name '${wireName}'`));
  }

  return ok(rustName);
}

// Encrypt/Decrypt registration
export function registerEncrypt<T = unknown>(
  rustTypeName: string,
  encryptFn: EncryptFn<T>
): Result<void, Error> {
  if (!rustTypeName || typeof rustTypeName !== 'string') {
    return err(new Error('Rust type name must be a non-empty string'));
  }
  if (!encryptFn || typeof encryptFn !== 'function') {
    return err(new Error('Encrypt function must be a valid function'));
  }

  encryptRegistry.set(rustTypeName, encryptFn as EncryptFn);
  return ok(undefined);
}

export function registerDecrypt<T = unknown>(
  rustTypeName: string,
  decryptFn: DecryptFn<T>
): Result<void, Error> {
  if (!rustTypeName || typeof rustTypeName !== 'string') {
    return err(new Error('Rust type name must be a non-empty string'));
  }
  if (!decryptFn || typeof decryptFn !== 'function') {
    return err(new Error('Decrypt function must be a valid function'));
  }

  decryptRegistry.set(rustTypeName, decryptFn as DecryptFn);
  return ok(undefined);
}

export function lookupEncryptorByTypeName(rustTypeName: string): Result<EncryptFn, Error> {
  if (!rustTypeName || typeof rustTypeName !== 'string') {
    return err(new Error('Rust type name must be a non-empty string'));
  }

  const encryptor = encryptRegistry.get(rustTypeName);
  if (!encryptor) {
    return err(new Error(`No encryptor found for type '${rustTypeName}'`));
  }

  return ok(encryptor);
}

export function lookupDecryptorByTypeName(rustTypeName: string): Result<DecryptFn, Error> {
  if (!rustTypeName || typeof rustTypeName !== 'string') {
    return err(new Error('Rust type name must be a non-empty string'));
  }

  const decryptor = decryptRegistry.get(rustTypeName);
  if (!decryptor) {
    return err(new Error(`No decryptor found for type '${rustTypeName}'`));
  }

  return ok(decryptor);
}

// Encrypted companion registration and lookup (for asType<T> dual-mode semantics)
export function registerEncryptedCompanion<T = unknown>(
  plainTypeName: string,
  encryptedCompanionCtor: Constructor
): Result<void, Error> {
  if (!plainTypeName || typeof plainTypeName !== 'string') {
    return err(new Error('Plain type name must be a non-empty string'));
  }
  if (!encryptedCompanionCtor || typeof encryptedCompanionCtor !== 'function') {
    return err(new Error('Encrypted companion constructor must be a valid function'));
  }

  plainTypeToEncryptedCompanion.set(plainTypeName, encryptedCompanionCtor);
  encryptedCompanionToPlainType.set(encryptedCompanionCtor.name, encryptedCompanionCtor);
  return ok(undefined);
}

export function getEncryptedCompanion<T = unknown>(
  plainTypeName: string
): Result<Constructor, Error> {
  if (!plainTypeName || typeof plainTypeName !== 'string') {
    return err(new Error('Plain type name must be a non-empty string'));
  }

  const companion = plainTypeToEncryptedCompanion.get(plainTypeName);
  if (!companion) {
    return err(new Error(`No encrypted companion found for plain type '${plainTypeName}'`));
  }

  return ok(companion);
}

export function isEncryptedCompanion(ctor: Constructor): Result<boolean, Error> {
  if (!ctor || typeof ctor !== 'function') {
    return err(new Error('Constructor must be a valid function'));
  }

  return ok(encryptedCompanionToPlainType.has(ctor.name));
}

export function getDecryptor<T>(plainTypeName: string): Result<DecryptFn, Error> {
  if (!plainTypeName || typeof plainTypeName !== 'string') {
    return err(new Error('Plain type name must be a non-empty string'));
  }

  const decryptor = decryptRegistry.get(plainTypeName);
  if (!decryptor) {
    return err(new Error(`No decryptor found for plain type '${plainTypeName}'`));
  }

  return ok(decryptor);
}

// JSON converter registration
export function registerToJson<T = unknown>(
  rustTypeName: string,
  toJsonFn: ToJsonFn<T>
): Result<void, Error> {
  if (!rustTypeName || typeof rustTypeName !== 'string') {
    return err(new Error('Rust type name must be a non-empty string'));
  }
  if (!toJsonFn || typeof toJsonFn !== 'function') {
    return err(new Error('JSON converter function must be a valid function'));
  }

  jsonRegistryByRustName.set(rustTypeName, toJsonFn as ToJsonFn);

  // If a wire name exists for this type, also bind under wire name
  const wireNameResult = lookupWireName(rustTypeName);
  if (wireNameResult.ok) {
    wireNameToJson.set(wireNameResult.value, toJsonFn as ToJsonFn);
  }

  return ok(undefined);
}

export function getJsonConverterByWireName(wireName: string): Result<ToJsonFn, Error> {
  if (!wireName || typeof wireName !== 'string') {
    return err(new Error('Wire name must be a non-empty string'));
  }

  const converter = wireNameToJson.get(wireName);
  if (!converter) {
    return err(new Error(`No JSON converter found for wire name '${wireName}'`));
  }

  return ok(converter);
}

export function getJsonConverterByRustName(rustTypeName: string): Result<ToJsonFn, Error> {
  if (!rustTypeName || typeof rustTypeName !== 'string') {
    return err(new Error('Rust type name must be a non-empty string'));
  }

  const converter = jsonRegistryByRustName.get(rustTypeName);
  if (!converter) {
    return err(new Error(`No JSON converter found for Rust type '${rustTypeName}'`));
  }

  return ok(converter);
}

// Initialize wire names to match Rust exactly
export function initWirePrimitives(): Result<void, Error> {
  try {
    // Primitive types with exact wire names from Rust
    const wireNameRegistrations = [
      ['alloc::string::String', 'string'],
      ['std::string::String', 'string'],
      ['&str', 'string'],
      ['bool', 'bool'],
      ['i8', 'i8'],
      ['i16', 'i16'],
      ['i32', 'i32'],
      ['i64', 'i64'],
      ['i128', 'i128'],
      ['u8', 'u8'],
      ['u16', 'u16'],
      ['u32', 'u32'],
      ['u64', 'u64'],
      ['u128', 'u128'],
      ['f32', 'f32'],
      ['f64', 'f64'],
      ['char', 'char'],
      // Container types
      ['alloc::vec::Vec<T>', 'list<T>'],
      ['std::collections::HashMap<K, V>', 'map<K,V>'],
      // Special types
      ['serde_json::value::Value', 'json'],
      ['alloc::vec::Vec<u8>', 'bytes'],
    ] as const;

    for (const [rustName, wireName] of wireNameRegistrations) {
      const result = registerWireName(rustName, wireName);
      if (isErr(result)) {
        return err(
          new Error(
            `Failed to register wire name '${rustName}' -> '${wireName}': ${result.error.message}`
          )
        );
      }
    }

    // Register JSON converters for basic types
    const jsonRegistrations: [string, ToJsonFn][] = [
      ['string', (value: unknown) => value as string],
      ['bool', (value: unknown) => value as boolean],
      ['i64', (value: unknown) => value as number],
      ['f64', (value: unknown) => value as number],
      ['bytes', (value: unknown) => Array.from(value as Uint8Array)],
      ['list', (value: unknown) => value as unknown[]],
      ['map', (value: unknown) => Object.fromEntries(value as Map<string, unknown>)],
      ['json', (value: unknown) => value],
    ];

    for (const [typeName, converter] of jsonRegistrations) {
      const result = registerToJson(typeName, converter);
      if (isErr(result)) {
        return err(
          new Error(`Failed to register JSON converter for '${typeName}': ${result.error.message}`)
        );
      }
    }

    return ok(undefined);
  } catch (error) {
    return err(new Error(`Failed to initialize wire primitives: ${error}`));
  }
}
