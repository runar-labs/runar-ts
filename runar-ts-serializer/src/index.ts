// Import initialization
import './utils/initialization';

// Export AnyValue
export { AnyValue } from './core/any_value';

// Export AnyValue static methods for cross-language compatibility
export { AnyValue as AnyValueClass } from './core/any_value';

// Re-export specific AnyValue methods for easier access
export { AnyValue as AnyValueFrom } from './core/any_value';

// Export type definitions
export type {
  DeserializationContext,
  SerializationContext,
  LazyDataWithOffset,
} from './context/serialization_context';
export type { CommonKeysInterface, DeviceKeystoreCaps } from './keystore/device_caps';
export type { WireHeader } from './wire/wire_header';

// Export LabelResolver types and functions
export type {
  LabelKeyInfo,
  LabelValue,
  LabelResolverConfig,
  KeyMappingConfig,
} from './label_resolver';
export { LabelResolver, createContextLabelResolver, LabelKeyword } from './label_resolver';

// Export ResolverCache
export type { CacheStats } from './resolver_cache';
export { ResolverCache } from './resolver_cache';

// Export encryption functions
export type { EncryptedLabelGroup } from './encryption';
export { encryptLabelGroupSync, decryptLabelGroupSync, decryptBytesSync } from './encryption';

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
} from './registry';

// Export ValueUnion type
export type { ValueUnion } from './types/value_union';

// Export result types
export { ok, err } from 'runar-ts-common/src/error/Result';
export type { Result } from 'runar-ts-common/src/error/Result';

// Export wire types
export { ValueCategory, readHeader, writeHeader, bodyOffset } from './wire';

// Export serialization utilities
export { serializeEntity, deserializeEntity } from './utils/serialization_utils';
