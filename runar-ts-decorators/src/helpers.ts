import { FieldEncryption } from './index';

/**
 * Group fields by encryption label (mimics Rust's label_groups logic)
 */
export function getFieldsByLabel(constructor: Function): Map<string, string[]> {
  const fieldEncryptions: FieldEncryption[] =
    (constructor as Function & { fieldEncryptions?: FieldEncryption[] }).fieldEncryptions || [];
  const grouped = new Map<string, string[]>();

  for (const encryption of fieldEncryptions) {
    const properties = grouped.get(encryption.label) || [];
    properties.push(encryption.propertyKey.toString());
    grouped.set(encryption.label, properties);
  }

  return grouped;
}

/**
 * Get unique labels in natural order (as they appear)
 */
export function getOrderedLabels(constructor: Function): string[] {
  const fieldEncryptions: FieldEncryption[] =
    (constructor as Function & { fieldEncryptions?: FieldEncryption[] }).fieldEncryptions || [];

  // Extract unique labels in natural order
  const uniqueLabels = [...new Set(fieldEncryptions.map(e => e.label))];

  // Return in natural order (as they appear)
  return uniqueLabels;
}

/**
 * Helper function to get default values for types
 */
export function getDefaultValue(fieldName: string): unknown {
  // In a real implementation, this would use reflection to determine
  // the appropriate default value based on the field's type
  // For now, return undefined (which will use the type's default)
  return undefined;
}
