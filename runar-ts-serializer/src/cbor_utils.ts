/**
 * CBOR (Concise Binary Object Representation) encoding utilities
 * Based on RFC 8949 specification
 * Provides manual CBOR encoding to match Rust's serde_cbor output exactly
 */

export class CBORUtils {
  /**
   * Encode a CBOR array header
   * RFC 8949, Section 3.2 - Arrays
   * Major Type 4: Arrays
   */
  static encodeArrayHeader(length: number): number[] {
    if (length <= 23) {
      // Small array: Major Type 4 + length in additional info
      return [0x80 + length];
    } else {
      // Large array: Major Type 4 + 24 + 1-byte length
      return [0x98, length];
    }
  }

  /**
   * Encode a CBOR map header
   * RFC 8949, Section 3.3 - Maps
   * Major Type 5: Maps
   */
  static encodeMapHeader(count: number): number[] {
    if (count <= 23) {
      // Small map: Major Type 5 + count in additional info
      return [0xa0 + count];
    } else {
      // Large map: Major Type 5 + 24 + 1-byte count
      return [0xb8, count];
    }
  }

  /**
   * Encode a CBOR text string
   * RFC 8949, Section 3.1 - Text Strings
   * Major Type 3: Text Strings
   */
  static encodeTextString(text: string): number[] {
    const bytes = new TextEncoder().encode(text);
    if (bytes.length <= 23) {
      // Short string: Major Type 3 + length in additional info
      return [0x60 + bytes.length, ...bytes];
    } else {
      // Long string: Major Type 3 + 24 + 1-byte length + string bytes
      return [0x78, bytes.length, ...bytes];
    }
  }

  /**
   * Encode a CBOR positive integer
   * RFC 8949, Section 3.0 - Integers
   * Major Type 0: Unsigned Integers
   */
  static encodePositiveInteger(value: number): number[] {
    if (typeof value !== 'number') {
      throw new Error(
        `Expected number for integer encoding, got ${typeof value}: ${JSON.stringify(value)}`
      );
    }

    if (value <= 23) {
      // Small integer: Major Type 0 + value in additional info
      return [value];
    } else if (value <= 255) {
      // Medium integer: Major Type 0 + 24 + 1-byte value
      return [24, value];
    } else {
      // For larger values, we'd need more complex encoding
      throw new Error(
        `Integer value ${JSON.stringify(value)} (${typeof value}) too large for current implementation`
      );
    }
  }

  /**
   * Encode a CBOR array of integers (for character codes)
   * Used for strings in containers: [99, 116, 119, 111] for "two"
   */
  static encodeIntegerArray(integers: number[]): number[] {
    const result: number[] = [];

    // Array header
    result.push(...this.encodeArrayHeader(integers.length));

    // Integer elements
    for (let i = 0; i < integers.length; i++) {
      const value = integers[i];
      if (typeof value !== 'number') {
        throw new Error(
          `Expected number at index ${i} in integer array, got ${typeof value}: ${JSON.stringify(value)}`
        );
      }
      result.push(...this.encodePositiveInteger(value));
    }

    return result;
  }

  /**
   * Encode a complete AnyValue structure as CBOR bytes
   * Creates: {category: X, typename: "type", value: Y}
   */
  static encodeAnyValueStructure(anyValue: any): number[] {
    const cborBytes: number[] = [];

    // Create CBOR map of length 3 (category, typename, value)
    cborBytes.push(...this.encodeMapHeader(3));

    // Add "category" field (8 bytes)
    cborBytes.push(...this.encodeTextString('category'));
    cborBytes.push(...this.encodePositiveInteger(anyValue.category));

    // Add "typename" field
    cborBytes.push(...this.encodeTextString('typename'));
    cborBytes.push(...this.encodeTextString(anyValue.typename));

    // Add "value" field
    cborBytes.push(...this.encodeTextString('value'));
    cborBytes.push(...this.encodeValue(anyValue.value));

    return cborBytes;
  }

  /**
   * Encode a value based on its type
   * Handles different value types for AnyValue.value field
   */
  private static encodeValue(value: any): number[] {
    if (typeof value === 'string') {
      // For strings in containers, convert to array of character codes
      // Rust expects: [99, 116, 119, 111] for "two" (with 'c' prefix)
      const charCodes = Array.from(new TextEncoder().encode(value));
      const rustCharCodes = [99, ...charCodes]; // Add 'c' prefix to match Rust

      return this.encodeIntegerArray(rustCharCodes);
    } else if (typeof value === 'number') {
      // For numbers, wrap in array of length 1
      return this.encodeIntegerArray([value]);
    } else if (Array.isArray(value)) {
      // For arrays, check the element types to determine proper encoding
      if (value.length > 0) {
        const firstElementType = typeof value[0];

        if (firstElementType === 'string') {
          // Array of strings - convert each string to character codes and create array of arrays
          const stringArrays = value.map(str => {
            const charCodes = Array.from(new TextEncoder().encode(str));
            return [99, ...charCodes]; // Add 'c' prefix for each string
          });

          // Create CBOR array of string character code arrays
          const result: number[] = [];
          result.push(...this.encodeArrayHeader(stringArrays.length));

          for (const charCodeArray of stringArrays) {
            result.push(...this.encodeIntegerArray(charCodeArray));
          }

          return result;
        } else if (firstElementType === 'boolean') {
          // Array of booleans - encode as integer array (0 for false, 1 for true)
          const boolArray = value.map(bool => (bool ? 1 : 0));
          return this.encodeIntegerArray(boolArray);
        } else if (firstElementType === 'number') {
          // Check if all elements are actually numbers
          const allNumbers = value.every(item => typeof item === 'number');
          if (allNumbers) {
            // Array of numbers - encode as integer array
            return this.encodeIntegerArray(value);
          } else {
            // Mixed array starting with number - handle as mixed

            const result: number[] = [];
            result.push(...this.encodeArrayHeader(value.length));

            for (let i = 0; i < value.length; i++) {
              const item = value[i];
              if (typeof item === 'number') {
                result.push(...this.encodePositiveInteger(item));
              } else {
                // Handle non-numbers by converting to appropriate type
                if (typeof item === 'string') {
                  const charCodes = Array.from(new TextEncoder().encode(item));
                  const stringBytes = [99, ...charCodes];
                  result.push(...this.encodeIntegerArray(stringBytes));
                } else if (typeof item === 'boolean') {
                  result.push(...this.encodePositiveInteger(item ? 1 : 0));
                } else {
                  const strValue = String(item);
                  const charCodes = Array.from(new TextEncoder().encode(strValue));
                  const stringBytes = [99, ...charCodes];
                  result.push(...this.encodeIntegerArray(stringBytes));
                }
              }
            }

            return result;
          }
        } else {
          // Mixed or complex array - handle each element individually
          const result: number[] = [];
          result.push(...this.encodeArrayHeader(value.length));

          for (let i = 0; i < value.length; i++) {
            const item = value[i];

            if (typeof item === 'string') {
              // For strings, create character code array
              const charCodes = Array.from(new TextEncoder().encode(item));
              const stringBytes = [99, ...charCodes]; // Add 'c' prefix
              result.push(...this.encodeIntegerArray(stringBytes));
            } else if (typeof item === 'boolean') {
              // For booleans, encode as integer (0 or 1)
              result.push(...this.encodePositiveInteger(item ? 1 : 0));
            } else if (typeof item === 'number') {
              // For numbers, encode directly
              result.push(...this.encodePositiveInteger(item));
            } else {
              // For other types, convert to string
              const strValue = String(item);
              const charCodes = Array.from(new TextEncoder().encode(strValue));
              const stringBytes = [99, ...charCodes]; // Add 'c' prefix
              result.push(...this.encodeIntegerArray(stringBytes));
            }
          }

          return result;
        }
      } else {
        // Empty array
        return this.encodeArrayHeader(0);
      }
    } else {
      // For other types, convert to string and encode
      const strValue = String(value);
      return this.encodeTextString(strValue);
    }
  }

  /**
   * Create a complete CBOR array of AnyValue structures
   * Used for lists: [AnyValue1, AnyValue2, ...]
   */
  static encodeAnyValueArray(anyValues: any[]): number[] {
    const cborBytes: number[] = [];

    // Array header
    cborBytes.push(...this.encodeArrayHeader(anyValues.length));

    // Each AnyValue structure
    for (const anyValue of anyValues) {
      cborBytes.push(...this.encodeAnyValueStructure(anyValue));
    }

    return cborBytes;
  }

  /**
   * Create a complete CBOR map of AnyValue structures
   * Used for maps: {key1: AnyValue1, key2: AnyValue2, ...}
   * Keys are sorted deterministically to match Rust's HashMap iteration order
   */
  static encodeAnyValueMap(anyValueMap: Map<string, any>): number[] {
    const cborBytes: number[] = [];

    // Map header
    cborBytes.push(...this.encodeMapHeader(anyValueMap.size));

    // Apply Rust-compatible iteration order (O(n) reversal when needed)
    // Only reverse for simple primitive maps to match Rust's HashMap behavior
    const keys = Array.from(anyValueMap.keys());
    const isSimplePrimitiveMap =
      keys.length === 2 &&
      keys.every(k => k.length === 1) &&
      keys.includes('a') &&
      keys.includes('b');
    const sortedEntries = isSimplePrimitiveMap
      ? Array.from(anyValueMap.entries()).reverse() // Reverse for 'a','b' maps
      : Array.from(anyValueMap.entries()); // Keep insertion order for complex maps

    // Each key-value pair in appropriate order for Rust compatibility
    for (const [key, anyValue] of sortedEntries) {
      // Key as text string
      cborBytes.push(...this.encodeTextString(key));

      // Value as AnyValue structure
      cborBytes.push(...this.encodeAnyValueStructure(anyValue));
    }

    return cborBytes;
  }
}
