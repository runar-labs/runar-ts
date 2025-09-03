import { Result } from 'runar-ts-common/src/error/Result.js';
import type { CommonKeysInterface } from './wire.js';
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

export function registerType(typeName: string, entry: TypeEntry): void {
  typeNameToEntry.set(typeName, entry);
}

export function resolveType(typeName: string): TypeEntry | undefined {
  return typeNameToEntry.get(typeName);
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
export function registerWireName(rustTypeName: string, wireName: string): void {
  rustTypeToWireName.set(rustTypeName, wireName);
  wireNameToRust.set(wireName, rustTypeName);
}

export function lookupWireName(rustTypeName: string): string | undefined {
  return rustTypeToWireName.get(rustTypeName);
}

export function lookupRustName(wireName: string): string | undefined {
  return wireNameToRust.get(wireName);
}

// Encrypt/Decrypt registration
export function registerEncrypt<T = unknown>(rustTypeName: string, encryptFn: EncryptFn<T>): void {
  encryptRegistry.set(rustTypeName, encryptFn as EncryptFn);
}

export function registerDecrypt<T = unknown>(rustTypeName: string, decryptFn: DecryptFn<T>): void {
  decryptRegistry.set(rustTypeName, decryptFn as DecryptFn);
}

export function lookupEncryptorByTypeName(rustTypeName: string): EncryptFn | undefined {
  return encryptRegistry.get(rustTypeName);
}

export function lookupDecryptorByTypeName(rustTypeName: string): DecryptFn | undefined {
  return decryptRegistry.get(rustTypeName);
}

// Encrypted companion registration and lookup (for asType<T> dual-mode semantics)
export function registerEncryptedCompanion<T = unknown>(
  plainTypeName: string,
  encryptedCompanionCtor: Constructor
): void {
  plainTypeToEncryptedCompanion.set(plainTypeName, encryptedCompanionCtor);
  encryptedCompanionToPlainType.set(encryptedCompanionCtor.name, encryptedCompanionCtor);
}

export function getEncryptedCompanion<T = unknown>(plainTypeName: string): Constructor | undefined {
  return plainTypeToEncryptedCompanion.get(plainTypeName);
}

export function isEncryptedCompanion(ctor: Constructor): boolean {
  return encryptedCompanionToPlainType.has(ctor.name);
}

export function getDecryptor<T>(plainTypeName: string): DecryptFn | undefined {
  return decryptRegistry.get(plainTypeName);
}

// JSON converter registration
export function registerToJson<T = unknown>(rustTypeName: string, toJsonFn: ToJsonFn<T>): void {
  jsonRegistryByRustName.set(rustTypeName, toJsonFn as ToJsonFn);

  // If a wire name exists for this type, also bind under wire name
  const wireName = lookupWireName(rustTypeName);
  if (wireName) {
    wireNameToJson.set(wireName, toJsonFn as ToJsonFn);
  }
}

export function getJsonConverterByWireName(wireName: string): ToJsonFn | undefined {
  return wireNameToJson.get(wireName);
}

export function getJsonConverterByRustName(rustTypeName: string): ToJsonFn | undefined {
  return jsonRegistryByRustName.get(rustTypeName);
}

// Initialize wire names to match Rust exactly
export function initWirePrimitives(): void {
  // Primitive types with exact wire names from Rust
  registerWireName('alloc::string::String', 'string');
  registerWireName('std::string::String', 'string');
  registerWireName('&str', 'string');
  registerWireName('bool', 'bool');
  registerWireName('i8', 'i8');
  registerWireName('i16', 'i16');
  registerWireName('i32', 'i32');
  registerWireName('i64', 'i64');
  registerWireName('i128', 'i128');
  registerWireName('u8', 'u8');
  registerWireName('u16', 'u16');
  registerWireName('u32', 'u32');
  registerWireName('u64', 'u64');
  registerWireName('u128', 'u128');
  registerWireName('f32', 'f32');
  registerWireName('f64', 'f64');
  registerWireName('char', 'char');

  // Container types
  registerWireName('alloc::vec::Vec<T>', 'list<T>');
  registerWireName('std::collections::HashMap<K, V>', 'map<K,V>');

  // Special types
  registerWireName('serde_json::value::Value', 'json');
  registerWireName('alloc::vec::Vec<u8>', 'bytes');

  // Register JSON converters for basic types
  registerToJson('string', (value: string) => value);
  registerToJson('bool', (value: boolean) => value);
  registerToJson('i64', (value: number) => value);
  registerToJson('f64', (value: number) => value);
  registerToJson('bytes', (value: Uint8Array) => Array.from(value));
  registerToJson('list', (value: unknown[]) => value);
  registerToJson('map', (value: Map<string, unknown>) => Object.fromEntries(value));
  registerToJson('json', (value: unknown) => value);
}
