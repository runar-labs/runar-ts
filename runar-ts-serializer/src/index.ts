// Import initialization
import './utils/initialization.js';

// Export AnyValue
export { AnyValue } from './core/any_value.js';

// Export type definitions
export type {
  DeserializationContext,
  SerializationContext,
  LazyDataWithOffset,
} from './context/serialization_context.js';
export type { CommonKeysInterface, DeviceKeystoreCaps } from './keystore/device_caps.js';
export type { WireHeader } from './wire/wire_header.js';

// Export LabelResolver types and functions
export type {
  LabelKeyInfo,
  LabelValue,
  LabelResolverConfig,
  KeyMappingConfig,
} from './label_resolver.js';
export { LabelResolver, createContextLabelResolver, LabelKeyword } from './label_resolver.js';

// Export ResolverCache
export type { CacheStats } from './resolver_cache.js';
export { ResolverCache } from './resolver_cache.js';

// Export encryption functions
export type { EncryptedLabelGroup } from './encryption.js';
export { encryptLabelGroupSync, decryptLabelGroupSync, decryptBytesSync } from './encryption.js';

// Re-export registry functions
export {
  registerType,
  clearRegistry,
  resolveType,
  registerEncrypt,
  registerDecrypt,
  registerToJson,
  lookupEncryptorByTypeName,
  lookupDecryptorByTypeName,
  getJsonConverterByWireName,
  getJsonConverterByRustName,
  registerWireName,
  lookupWireName,
  lookupRustName,
} from './registry.js';

// Export ValueUnion type
export type { ValueUnion } from './types/value_union.js';

// Export result types
export { ok, err } from 'runar-ts-common/src/error/Result.js';
export type { Result } from 'runar-ts-common/src/error/Result.js';

// Export wire types
export { ValueCategory, readHeader, writeHeader, bodyOffset } from './wire.js';

// Export serialization utilities
export { serializeEntity, deserializeEntity } from './utils/serialization_utils.js';
