import 'reflect-metadata';

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
  return function<T extends { new(...args: any[]): {} }>(constructor: T) {
    const className = constructor.name;
    const typeName = options?.name || className;

    // Register metadata
    const metadata: ClassMetadata = {
      typeName,
      isPlain: true,
      isEncrypted: false,
      fieldEncryptions: []
    };

    classMetadataRegistry.set(className, metadata);

    // Add runtime methods to the class
    const decoratedClass = class extends constructor {
      // These methods will be implemented by the serializer
      encryptWithKeystore(keystore: any, resolver: any) {
        return this; // No-op for plain types
      }

      decryptWithKeystore(keystore: any) {
        return this; // No-op for plain types
      }
    };

    // Set the name property so that metadata lookup works
    Object.defineProperty(decoratedClass, 'name', { value: className });

    return decoratedClass;
  };
}

/**
 * @Encrypt decorator - generates encrypted companion classes with field-level encryption
 */
export function Encrypt(options?: EncryptOptions) {
  return function<T extends { new(...args: any[]): {} }>(constructor: T) {
    const className = constructor.name;
    const typeName = options?.name || className;

    // Initialize metadata for this class
    const metadata: ClassMetadata = {
      typeName,
      isPlain: false,
      isEncrypted: true,
      fieldEncryptions: []
    };

    classMetadataRegistry.set(className, metadata);

    const decoratedClass = class extends constructor {
      static encryptedClassName = `Encrypted${className}`;
      static fieldEncryptions = (constructor as any).fieldEncryptions || [];

      // Encryption method
      encryptWithKeystore(keystore: any, resolver: any) {
        // Create a simple encrypted representation
        const encrypted: any = {};

        // Copy plaintext fields (fields without encryption decorators)
        const plaintextFields = this.getPlaintextFields();
        for (const field of plaintextFields) {
          encrypted[field] = this[field];
        }

        // Group fields by label and encrypt each group
        const fieldsByLabel = getFieldsByLabel(this.constructor);
        const orderedLabels = getOrderedLabels(this.constructor);

        for (const label of orderedLabels) {
          if (resolver.canResolve(label)) {
            const fieldNames = fieldsByLabel.get(label) || [];

            // Create sub-struct for this label group
            const labelGroupData: any = {};
            for (const fieldName of fieldNames) {
              labelGroupData[fieldName] = this[fieldName];
            }

            const encryptedGroup = encryptLabelGroup(
              label,
              labelGroupData,
              keystore,
              resolver
            );
            encrypted[`${label}_encrypted`] = encryptedGroup;
          } else {
            encrypted[`${label}_encrypted`] = null;
          }
        }

        // Add metadata to identify this as an encrypted instance
        encrypted._encryptedType = this.constructor.name;

        return encrypted;
      }

      // Decryption method (for encrypted instances)
      decryptWithKeystore(keystore: any) {
        const decrypted = new constructor();

        // Copy plaintext fields (these are already in plain form)
        const plaintextFields = this.getPlaintextFields();
        for (const field of plaintextFields) {
          decrypted[field] = this[field];
        }

        // Decrypt labeled field groups
        const orderedLabels = getOrderedLabels(this.constructor);

        for (const label of orderedLabels) {
          const encryptedField = `${label}_encrypted`;
          if (this[encryptedField]) {
            try {
              const decryptedGroup = decryptLabelGroup(
                this[encryptedField],
                keystore
              );

              // Distribute decrypted fields back to the object
              if (decryptedGroup && typeof decryptedGroup === 'object') {
                for (const [fieldName, fieldValue] of Object.entries(decryptedGroup)) {
                  decrypted[fieldName] = fieldValue;
                }
              }
            } catch (e) {
              // Fields remain as default values if decryption fails
              const fieldsByLabel = getFieldsByLabel(this.constructor);
              const fieldNames = fieldsByLabel.get(label) || [];
              for (const fieldName of fieldNames) {
                decrypted[fieldName] = getDefaultValue(fieldName);
              }
            }
          }
        }

        return decrypted;
      }

      // Helper methods
      private getPlaintextFields(): string[] {
        const allFields = Object.getOwnPropertyNames(this);
        const encryptedFields = this.constructor.fieldEncryptions || [];
        const encryptedFieldNames = new Set(encryptedFields.map((e: any) => e.propertyKey.toString()));

        return allFields.filter(field => !encryptedFieldNames.has(field) && field !== 'constructor');
      }
    };

    // Set the name property so that metadata lookup works
    Object.defineProperty(decoratedClass, 'name', { value: className });

    return decoratedClass;
  };
}

/**
 * @EncryptField decorator - marks individual fields for encryption with specific labels
 */
export function EncryptField(options: EncryptFieldOptions | string) {
  return function(target: any, propertyKey: string | symbol) {
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
 * Group fields by encryption label (mimics Rust's label_groups logic)
 */
export function getFieldsByLabel(constructor: Function): Map<string, string[]> {
  const fieldEncryptions: FieldEncryption[] = constructor.fieldEncryptions || [];
  const grouped = new Map<string, string[]>();

  for (const encryption of fieldEncryptions) {
    const properties = grouped.get(encryption.label) || [];
    properties.push(encryption.propertyKey.toString());
    grouped.set(encryption.label, properties);
  }

  return grouped;
}

/**
 * Get ordered labels for consistent encryption (mimics Rust's label_order logic)
 */
export function getOrderedLabels(constructor: Function): string[] {
  const fieldEncryptions: FieldEncryption[] = constructor.fieldEncryptions || [];

  // Extract unique labels
  const uniqueLabels = [...new Set(fieldEncryptions.map(e => e.label))];

  // Sort by priority first, then by label name
  return uniqueLabels.sort((a, b) => {
    // Find priorities (default to 2 if not specified)
    const aPriority = fieldEncryptions.find(e => e.label === a)?.priority ?? 2;
    const bPriority = fieldEncryptions.find(e => e.label === b)?.priority ?? 2;

    // Compare by priority first
    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }

    // Then by label name
    return a.localeCompare(b);
  });
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
// ENCRYPTION FUNCTIONS (STUBS)
// ============================================================================

/**
 * Encrypt a label group (this will be implemented by the actual encryption system)
 */
async function encryptLabelGroup(
  label: string,
  data: any,
  keystore: any,
  resolver: any
): Promise<any> {
  // This is a stub - actual implementation will use the encryption system
  console.log(`Encrypting label '${label}' with data:`, data);
  return { label, encrypted: true, data };
}

/**
 * Decrypt a label group (this will be implemented by the actual encryption system)
 */
async function decryptLabelGroup(
  encryptedGroup: any,
  keystore: any
): Promise<any> {
  // This is a stub - actual implementation will use the decryption system
  console.log(`Decrypting label '${encryptedGroup.label}'`);
  return encryptedGroup.data;
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


