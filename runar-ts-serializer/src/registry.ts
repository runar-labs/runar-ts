export type Constructor<T = any> = new (...args: any[]) => T;

export interface TypeEntry {
  ctor: Constructor;
  decoder?: (bytes: Uint8Array) => any;
}

// Registry for type resolution (matches Rust functionality)
const typeNameToEntry = new Map<string, TypeEntry>();

export function registerType(typeName: string, entry: TypeEntry): void {
  typeNameToEntry.set(typeName, entry);
}

export function resolveType(typeName: string): TypeEntry | undefined {
  return typeNameToEntry.get(typeName);
}

export function clearRegistry(): void {
  typeNameToEntry.clear();
}

// Wire name registry (Rust type name -> wire name)
const rustTypeToWireName = new Map<string, string>();

export function registerWireName(rustTypeName: string, wireName: string): void {
  rustTypeToWireName.set(rustTypeName, wireName);
}

export function lookupWireName(rustTypeName: string): string | undefined {
  return rustTypeToWireName.get(rustTypeName);
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
}
