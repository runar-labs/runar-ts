/**
 * Group fields by encryption label (mimics Rust's label_groups logic)
 */
export function getFieldsByLabel(constructor: Function): Map<string, string[]> {
  const fieldEncryptions: any[] = (constructor as any).fieldEncryptions || [];
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
  const fieldEncryptions: any[] = (constructor as any).fieldEncryptions || [];

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
export function getDefaultValue(fieldName: string): any {
  // In a real implementation, this would use reflection to determine
  // the appropriate default value based on the field's type
  // For now, return undefined (which will use the type's default)
  return undefined;
}
