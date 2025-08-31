import 'reflect-metadata';
import { getFieldsByLabel, getOrderedLabels, getDefaultValue } from './helpers';
import { 
  registerEncrypt, 
  registerDecrypt, 
  registerWireName,
  lookupEncryptorByTypeName,
  lookupDecryptorByTypeName
} from 'runar-ts-serializer';

// ============================================================================
// INTERFACES & TYPES
// ============================================================================

export interface PlainOptions {
  name?: string;
}

export interface EncryptOptions {
  name?: string;
}

export interface EncryptFieldOptions {
  label: string;
  priority?: number;
}

export interface FieldEncryption {
  label: string;
  propertyKey: string | symbol;
  priority?: number;
}

export interface ClassMetadata {
  typeName: string;
  isPlain: boolean;
  isEncrypted: boolean;
  fieldEncryptions: FieldEncryption[];
}

// ============================================================================
// METADATA REGISTRY
// ============================================================================

export const classMetadataRegistry = new Map<string, ClassMetadata>();

// ============================================================================
// DECORATORS
// ============================================================================

/**
 * @Plain decorator - marks classes for zero-copy serialization without encryption
 */
export function Plain(options?: PlainOptions) {
  return function <T extends { new (...args: any[]): {} }>(constructor: T) {
    const className = constructor.name;
    const typeName = options?.name || className;

    // Register metadata
    const metadata: ClassMetadata = {
      typeName,
      isPlain: true,
      isEncrypted: false,
      fieldEncryptions: [],
    };

    classMetadataRegistry.set(className, metadata);

    // For plain classes, we don't need to add encryption methods
    // The serializer will handle them as regular structs
    const decoratedClass = class extends constructor {};

    // Set the name property so that metadata lookup works
    Object.defineProperty(decoratedClass, 'name', { value: className });

    return decoratedClass;
  };
}

/**
 * @Encrypt decorator - generates encrypted companion classes with field-level encryption
 */
export function Encrypt(options?: EncryptOptions) {
  return function <T extends { new (...args: any[]): {} }>(constructor: T) {
    const className = constructor.name;
    const typeName = options?.name || className;

    // Initialize metadata for this class
    const metadata: ClassMetadata = {
      typeName,
      isPlain: false,
      isEncrypted: true,
      fieldEncryptions: [],
    };

    classMetadataRegistry.set(className, metadata);

    const decoratedClass = class extends constructor {
      static encryptedClassName = `Encrypted${className}`;
      static fieldEncryptions = (constructor as any).fieldEncryptions || [];

      // Encryption method - now synchronous and uses serializer registry
      encryptWithKeystore(keystore: any, resolver: any) {
        // Get the encryptor from the serializer registry
        const encryptor = lookupEncryptorByTypeName(className);
        if (!encryptor) {
          throw new Error(`No encryptor registered for type: ${className}`);
        }

        // Use the registry encryptor which handles label-group encryption
        return encryptor(this, keystore, resolver);
      }

      // Decryption method - now synchronous and uses serializer registry
      decryptWithKeystore(keystore: any) {
        // Get the decryptor from the serializer registry
        const decryptor = lookupDecryptorByTypeName(className);
        if (!decryptor) {
          throw new Error(`No decryptor registered for type: ${className}`);
        }

        // Use the registry decryptor which handles label-group decryption
        return decryptor(this, keystore);
      }

      // Helper methods
      private getPlaintextFields(): string[] {
        const allFields = Object.getOwnPropertyNames(this);
        const encryptedFields = this.constructor.fieldEncryptions || [];
        const encryptedFieldNames = new Set(
          encryptedFields.map((e: any) => e.propertyKey.toString())
        );

        return allFields.filter(
          field => !encryptedFieldNames.has(field) && field !== 'constructor'
        );
      }

      // Registration method for serializer registry
      private static registerWithSerializer(className: string, typeName: string, decoratedClass: any) {
        // Register wire name
        registerWireName(className, typeName);

        // Register encryptor function
        registerEncrypt(className, (value: any, keystore: any, resolver: any) => {
          // This will be called by AnyValue.serialize when encrypting
          // The actual encryption logic is handled by the serializer
          return value.encryptWithKeystore(keystore, resolver);
        });

        // Register decryptor function
        registerDecrypt(className, (bytes: Uint8Array, keystore: any) => {
          // This will be called by AnyValue.deserialize when decrypting
          // The actual decryption logic is handled by the serializer
          const { decode } = require('cbor-x');
          const encryptedInstance = decode(bytes);
          return encryptedInstance.decryptWithKeystore(keystore);
        });
      }
    };

    // Set the name property so that metadata lookup works
    Object.defineProperty(decoratedClass, 'name', { value: className });

    // Register with serializer registry for encryption/decryption
    decoratedClass.registerWithSerializer(className, typeName, decoratedClass);

    return decoratedClass;
  };
}

/**
 * @EncryptField decorator - marks individual fields for encryption with specific labels
 */
export function EncryptField(options: EncryptFieldOptions | string) {
  return function (target: any, propertyKey: string | symbol) {
    // Support both object and string syntax
    const label = typeof options === 'string' ? options : options.label;
    const priority = typeof options === 'object' ? options.priority : undefined;

    registerFieldEncryption(target.constructor, propertyKey, label, priority);
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function registerFieldEncryption(
  constructor: Function,
  propertyKey: string | symbol,
  label: string,
  priority?: number
) {
  // Initialize fieldEncryptions array if it doesn't exist
  if (!constructor.fieldEncryptions) {
    constructor.fieldEncryptions = [];
  }

  const fieldEncryption: FieldEncryption = { label, propertyKey, priority };
  constructor.fieldEncryptions.push(fieldEncryption);

  // Update class metadata if it exists
  const metadata = classMetadataRegistry.get(constructor.name);
  if (metadata) {
    metadata.fieldEncryptions.push(fieldEncryption);
  }
}

/**
 * Helper function to get default values for types
 */
function getDefaultValue(fieldName: string): any {
  // In a real implementation, this would use reflection to determine
  // the appropriate default value based on the field's type
  // For now, return undefined (which will use the type's default)
  return undefined;
}

// ============================================================================
// ENCRYPTION FUNCTIONS (REAL IMPLEMENTATION)
// ============================================================================

/**
 * Encrypt a label group using the provided keystore and resolver
 */
async function encryptLabelGroup(
  label: string,
  data: any,
  keystore: any,
  resolver: any
): Promise<EncryptedLabelGroup | null> {
  try {
    if (!resolver?.canResolve || !resolver.canResolve(label)) {
      console.warn(`Cannot resolve encryption label: ${label}`);
      return null;
    }

    if (!keystore?.encrypt) {
      console.warn('No encryption keystore provided');
      return null;
    }

    const keyInfo = resolver.getKeyInfo(label);
    if (!keyInfo) {
      console.warn(`No key info found for label: ${label}`);
      return null;
    }

    // Serialize the data to bytes
    const { encode } = await import('cbor-x');
    const serializedData = encode(data);

    // Encrypt the data
    const encryptedData = await keystore.encrypt(serializedData, keyInfo);

    return {
      label,
      encryptedData,
      keyInfo,
    };
  } catch (error) {
    console.error(`Failed to encrypt label group '${label}':`, error);
    return null;
  }
}

/**
 * Decrypt a label group using the provided keystore
 */
async function decryptLabelGroup(encryptedGroup: EncryptedLabelGroup, keystore: any): Promise<any> {
  try {
    if (!keystore?.decrypt) {
      throw new Error('No decryption keystore provided');
    }

    // Decrypt the data
    const decryptedBytes = await keystore.decrypt(
      encryptedGroup.encryptedData,
      encryptedGroup.keyInfo
    );

    // Deserialize the data
    const { decode } = await import('cbor-x');
    const decryptedData = decode(decryptedBytes);

    return decryptedData;
  } catch (error) {
    console.error(`Failed to decrypt label group '${encryptedGroup.label}':`, error);
    throw error;
  }
}

// ============================================================================
// TYPE DEFINITIONS FOR ENCRYPTION
// ============================================================================

export interface LabelKeyInfo {
  profilePublicKeys: string[];
  networkId?: string;
}

export interface KeyMappingConfig {
  labelMappings: Record<string, LabelKeyInfo>;
}

export interface ConfigurableLabelResolver {
  canResolve(label: string): boolean;
  getKeyInfo(label: string): LabelKeyInfo | undefined;
}

export interface EnvelopeCrypto {
  encrypt(data: Uint8Array, keyInfo: LabelKeyInfo): Promise<Uint8Array>;
  decrypt(data: Uint8Array, keyInfo: LabelKeyInfo): Promise<Uint8Array>;
}

export interface EncryptedLabelGroup {
  label: string;
  encryptedData: Uint8Array;
  keyInfo: LabelKeyInfo;
}

// ============================================================================
// NEW: RUNAR NODEJS API INTEGRATION
// ============================================================================

// Import the CommonKeysInterface from the serializer
import type { CommonKeysInterface } from 'runar-ts-serializer';

/**
 * Adapter interface for the new runar-nodejs-api Keys class
 * This provides envelope encryption capabilities for the decorators
 */
export interface RunarKeysAdapter {
  // Basic keystore interface that decorators expect
  encrypt(data: Uint8Array, keyInfo: LabelKeyInfo): Promise<Uint8Array>;
  decrypt(data: Uint8Array, keyInfo: LabelKeyInfo): Promise<Uint8Array>;

  // Additional envelope encryption methods
  encryptWithEnvelope(
    data: Uint8Array,
    networkId: string,
    profilePublicKeys: Uint8Array[]
  ): Promise<Uint8Array>;
  decryptEnvelope(encryptedData: Uint8Array): Promise<Uint8Array>;
}

/**
 * Implementation of RunarKeysAdapter that wraps the CommonKeysInterface
 */
export class RunarKeysAdapter implements RunarKeysAdapter {
  private keystore: CommonKeysInterface;

  constructor(keystore: CommonKeysInterface) {
    this.keystore = keystore;
  }

  async encrypt(data: Uint8Array, keyInfo: LabelKeyInfo): Promise<Uint8Array> {
    // Use envelope encryption if we have network context
    if (keyInfo.networkId && keyInfo.profilePublicKeys.length > 0) {
      const profileKeys = keyInfo.profilePublicKeys.map(pk => Buffer.from(pk));

      return this.keystore.encryptWithEnvelope(Buffer.from(data), keyInfo.networkId, profileKeys);
    } else {
      // For local encryption, we need to use a different approach
      // since CommonKeysInterface doesn't have local encryption methods
      // This would need to be handled by the specific platform implementation
      throw new Error('Local encryption not available through CommonKeysInterface');
    }
  }

  async decrypt(data: Uint8Array, keyInfo: LabelKeyInfo): Promise<Uint8Array> {
    // Try envelope decryption first if we have network context
    if (keyInfo.networkId && keyInfo.profilePublicKeys.length > 0) {
      try {
        return this.keystore.decryptEnvelope(Buffer.from(data));
      } catch (error) {
        // Fall back to local decryption if envelope decryption fails
        console.warn('Envelope decryption failed, falling back to local decryption:', error);
        throw new Error('Local decryption not available through CommonKeysInterface');
      }
    }

    // Fall back to local decryption
    throw new Error('Local decryption not available through CommonKeysInterface');
  }

  async encryptWithEnvelope(
    data: Uint8Array,
    networkId: string,
    profilePublicKeys: Uint8Array[]
  ): Promise<Uint8Array> {
    const profileKeys = profilePublicKeys.map(pk => Buffer.from(pk));

    return this.keystore.encryptWithEnvelope(Buffer.from(data), networkId, profileKeys);
  }

  async decryptEnvelope(encryptedData: Uint8Array): Promise<Uint8Array> {
    return this.keystore.decryptEnvelope(Buffer.from(encryptedData));
  }
}

/**
 * Factory function to create a RunarKeysAdapter from a CommonKeysInterface
 */
export function createRunarKeysAdapter(keystore: CommonKeysInterface): RunarKeysAdapter {
  return new RunarKeysAdapter(keystore);
}

// ============================================================================
// METADATA ACCESS FUNCTIONS
// ============================================================================

export function getClassMetadata(className: string): ClassMetadata | undefined {
  return classMetadataRegistry.get(className);
}

export function getTypeName(constructor: Function): string | undefined {
  const metadata = classMetadataRegistry.get(constructor.name);
  return metadata?.typeName;
}

// Export a function that works with constructor functions
export function getTypeNameFromConstructor(constructor: Function): string | undefined {
  return getTypeName(constructor);
}

export function isPlainClass(constructor: Function): boolean {
  const metadata = classMetadataRegistry.get(constructor.name);
  return metadata?.isPlain || false;
}

export function isEncryptedClass(constructor: Function): boolean {
  const metadata = classMetadataRegistry.get(constructor.name);
  return metadata?.isEncrypted || false;
}

// Re-export helper functions
export { getFieldsByLabel, getOrderedLabels } from './helpers';
