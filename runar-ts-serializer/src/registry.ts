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


