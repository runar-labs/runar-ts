// Optional union type for schema-like loose values. Renamed to avoid confusion with the class below.
export type ValueUnion =
  | { type: 'null' }
  | { type: 'bool'; value: boolean }
  | { type: 'int'; value: number }
  | { type: 'float'; value: number }
  | { type: 'string'; value: string }
  | { type: 'bytes'; value: Uint8Array }
  | { type: 'array'; value: ValueUnion[] }
  | { type: 'map'; value: Record<string, ValueUnion> };
