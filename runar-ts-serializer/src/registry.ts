export type Constructor<T = any> = new (...args: any[]) => T;

export interface TypeEntry {
  ctor: Constructor;
  decoder?: (bytes: Uint8Array) => any;
}

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

// Primitive registry (wire name -> post-decode transformer)
const primitiveDecoders = new Map<string, (v: any) => any>();

export function registerPrimitive(name: string, transformer: (v: any) => any): void {
  primitiveDecoders.set(name, transformer);
}

export function resolvePrimitive(name: string): ((v: any) => any) | undefined {
  return primitiveDecoders.get(name);
}

export function initWirePrimitives(): void {
  registerPrimitive('string', v => String(v));
  registerPrimitive('bool', v => Boolean(v));
  registerPrimitive('bytes', v => (v instanceof Uint8Array ? v : new Uint8Array()));
  registerPrimitive('f64', v => Number(v));
  // Integers default to JS number; future: bigint mapping as needed (i64/u64 etc.)
  ['i8', 'i16', 'i32', 'i64', 'u8', 'u16', 'u32', 'u64'].forEach(n =>
    registerPrimitive(n, v => Number(v))
  );
  registerPrimitive('list', v => (Array.isArray(v) ? v : []));
  registerPrimitive('map', v => (v && typeof v === 'object' ? v : {}));
  registerPrimitive('json', v => v);
}
