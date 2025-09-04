// Re-export all wire-related types and functions from organized modules
export { ValueCategory } from './wire/value_category.js';
export { SerializationContext, DeserializationContext, LazyDataWithOffset } from './context/serialization_context.js';
export { readHeader, bodyOffset, writeHeader } from './wire/wire_header.js';
