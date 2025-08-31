import { Result } from './result.js';

export type Constructor<T = any> = new (...args: any[]) => T;

export interface TypeEntry {
  ctor: Constructor;
  decoder?: (bytes: Uint8Array) => any;
}

// Type definitions for registry functions
export type EncryptFn<T = any> = (value: T, keystore: any, resolver: any) => Result<Uint8Array>;
export type DecryptFn<T = any> = (bytes: Uint8Array, keystore: any) => Result<T>;
export type ToJsonFn<T = any> = (value: T) => any;

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
export function registerEncrypt<T>(rustTypeName: string, encryptFn: EncryptFn<T>): void {
  encryptRegistry.set(rustTypeName, encryptFn);
}

export function registerDecrypt<T>(rustTypeName: string, decryptFn: DecryptFn<T>): void {
  decryptRegistry.set(rustTypeName, decryptFn);
}

export function lookupEncryptorByTypeName(rustTypeName: string): EncryptFn | undefined {
  return encryptRegistry.get(rustTypeName);
}

export function lookupDecryptorByTypeName(rustTypeName: string): DecryptFn | undefined {
  return decryptRegistry.get(rustTypeName);
}

// JSON converter registration
export function registerToJson<T>(rustTypeName: string, toJsonFn: ToJsonFn<T>): void {
  jsonRegistryByRustName.set(rustTypeName, toJsonFn);

  // If a wire name exists for this type, also bind under wire name
  const wireName = lookupWireName(rustTypeName);
  if (wireName) {
    wireNameToJson.set(wireName, toJsonFn);
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
  registerToJson('list', (value: any[]) => value);
  registerToJson('map', (value: Map<string, any>) => Object.fromEntries(value));
  registerToJson('json', (value: any) => value);
}
