// Re-export all wire-related types and functions from organized modules
export { ValueCategory } from './wire/value_category';
export {
  SerializationContext,
  DeserializationContext,
  LazyDataWithOffset,
} from './context/serialization_context';
export { readHeader, bodyOffset, writeHeader } from './wire/wire_header';
