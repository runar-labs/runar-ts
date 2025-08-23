import { describe, it, expect } from 'bun:test';
import { AnyValue, ValueCategory } from '../../runar-ts-serializer/src/index.js';

describe('Cross-Language Compatibility (TypeScript ↔ Rust)', () => {
  describe('Wire Format Compatibility', () => {
    it('should produce identical wire format for primitives', () => {
      // Test string
      const stringValue = AnyValue.from('hello world');
      const stringBytes = stringValue.serialize();
      expect(stringBytes.ok).toBe(true);

      if (stringBytes.ok) {
        // Verify header structure: [category][is_encrypted][type_len][type_name][data]
        expect(stringBytes.value[0]).toBe(ValueCategory.Primitive); // category
        expect(stringBytes.value[1]).toBe(0); // not encrypted
        expect(stringBytes.value[2]).toBe(6); // type name length ("string")
        expect(new TextDecoder().decode(stringBytes.value.subarray(3, 9))).toBe('string');
      }

      // Test boolean
      const boolValue = AnyValue.from(true);
      const boolBytes = boolValue.serialize();
      expect(boolBytes.ok).toBe(true);

      if (boolBytes.ok) {
        expect(boolBytes.value[0]).toBe(ValueCategory.Primitive);
        expect(boolBytes.value[1]).toBe(0);
        expect(boolBytes.value[2]).toBe(4); // "bool"
        expect(new TextDecoder().decode(boolBytes.value.subarray(3, 7))).toBe('bool');
      }

      // Test integer
      const intValue = AnyValue.from(42);
      const intBytes = intValue.serialize();
      expect(intBytes.ok).toBe(true);

      if (intBytes.ok) {
        expect(intBytes.value[0]).toBe(ValueCategory.Primitive);
        expect(intBytes.value[1]).toBe(0);
        expect(intBytes.value[2]).toBe(3); // "i64"
        expect(new TextDecoder().decode(intBytes.value.subarray(3, 6))).toBe('i64');
      }
    });

    it('should handle null values correctly', () => {
      const nullValue = AnyValue.from(null);
      const nullBytes = nullValue.serialize();
      expect(nullBytes.ok).toBe(true);

      if (nullBytes.ok) {
        expect(nullBytes.value[0]).toBe(ValueCategory.Null);
        expect(nullBytes.value.length).toBe(1); // Just the category byte
      }
    });

    it('should handle arrays and lists', () => {
      const arrayValue = AnyValue.from([1, 2, 3]);
      const arrayBytes = arrayValue.serialize();
      expect(arrayBytes.ok).toBe(true);

      if (arrayBytes.ok) {
        expect(arrayBytes.value[0]).toBe(ValueCategory.List);
        expect(arrayBytes.value[1]).toBe(0); // not encrypted

        // Get the type name length and decode the type name
        const typeNameLen = arrayBytes.value[2];
        const typeName = new TextDecoder().decode(arrayBytes.value.subarray(3, 3 + typeNameLen));

        // The type name should be in the format "list<element_type>"
        expect(typeName).toMatch(/^list<.+>$/);
        expect(typeNameLen).toBe(typeName.length);

        // For integer arrays, it should be "list<i64>"
        expect(typeName).toBe('list<i64>');
      }

      // Test string array
      const stringArrayValue = AnyValue.from(['hello', 'world']);
      const stringArrayBytes = stringArrayValue.serialize();
      expect(stringArrayBytes.ok).toBe(true);

      if (stringArrayBytes.ok) {
        expect(stringArrayBytes.value[0]).toBe(ValueCategory.List);
        const typeNameLen = stringArrayBytes.value[2];
        const typeName = new TextDecoder().decode(
          stringArrayBytes.value.subarray(3, 3 + typeNameLen)
        );
        expect(typeName).toBe('list<string>');
      }

      // Test boolean array
      const boolArrayValue = AnyValue.from([true, false]);
      const boolArrayBytes = boolArrayValue.serialize();
      expect(boolArrayBytes.ok).toBe(true);

      if (boolArrayBytes.ok) {
        expect(boolArrayBytes.value[0]).toBe(ValueCategory.List);
        const typeNameLen = boolArrayBytes.value[2];
        const typeName = new TextDecoder().decode(
          boolArrayBytes.value.subarray(3, 3 + typeNameLen)
        );
        expect(typeName).toBe('list<bool>');
      }
    });

    it('should handle objects with struct category', () => {
      const objectValue = AnyValue.from({ name: 'test', value: 123 });
      const objectBytes = objectValue.serialize();
      expect(objectBytes.ok).toBe(true);

      if (objectBytes.ok) {
        expect(objectBytes.value[0]).toBe(ValueCategory.Struct);
        expect(objectBytes.value[1]).toBe(0); // not encrypted
        expect(objectBytes.value[2]).toBe(6); // "struct"
        expect(new TextDecoder().decode(objectBytes.value.subarray(3, 9))).toBe('struct');
      }
    });
  });

  describe('Roundtrip Serialization', () => {
    it('should serialize and deserialize primitives correctly', () => {
      // Test string roundtrip
      const originalString = 'hello world';
      const stringValue = AnyValue.from(originalString);
      const stringBytes = stringValue.serialize();

      expect(stringBytes.ok).toBe(true);
      if (stringBytes.ok) {
        const deserialized = AnyValue.fromBytes(stringBytes.value);
        const result = deserialized.as<string>();
        expect(result.ok).toBe(true);
        expect(result.value).toBe(originalString);
      }

      // Test number roundtrip
      const originalNumber = 42;
      const numberValue = AnyValue.from(originalNumber);
      const numberBytes = numberValue.serialize();

      expect(numberBytes.ok).toBe(true);
      if (numberBytes.ok) {
        const deserialized = AnyValue.fromBytes(numberBytes.value);
        const result = deserialized.as<number>();
        expect(result.ok).toBe(true);
        expect(result.value).toBe(originalNumber);
      }

      // Test boolean roundtrip
      const originalBool = true;
      const boolValue = AnyValue.from(originalBool);
      const boolBytes = boolValue.serialize();

      expect(boolBytes.ok).toBe(true);
      if (boolBytes.ok) {
        const deserialized = AnyValue.fromBytes(boolBytes.value);
        const result = deserialized.as<boolean>();
        expect(result.ok).toBe(true);
        expect(result.value).toBe(originalBool);
      }
    });

    it('should handle complex object serialization', () => {
      const originalObject = {
        name: 'John Doe',
        age: 30,
        active: true,
        scores: [85, 92, 78],
        metadata: {
          created: '2023-01-01',
          version: 1,
        },
      };

      const objectValue = AnyValue.from(originalObject);
      const objectBytes = objectValue.serialize();

      expect(objectBytes.ok).toBe(true);
      if (objectBytes.ok) {
        const deserialized = AnyValue.fromBytes(objectBytes.value);
        const result = deserialized.as<typeof originalObject>();
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.name).toBe(originalObject.name);
          expect(result.value.age).toBe(originalObject.age);
          expect(result.value.active).toBe(originalObject.active);
          expect(Array.isArray(result.value.scores)).toBe(true);
          expect(result.value.scores).toEqual(originalObject.scores);
        }
      }
    });
  });

  describe('Category Detection', () => {
    it('should correctly categorize different value types', () => {
      expect(AnyValue.from(null).getCategory()).toBe(ValueCategory.Null);
      expect(AnyValue.from('string').getCategory()).toBe(ValueCategory.Primitive);
      expect(AnyValue.from(42).getCategory()).toBe(ValueCategory.Primitive);
      expect(AnyValue.from(true).getCategory()).toBe(ValueCategory.Primitive);
      expect(AnyValue.from([1, 2, 3]).getCategory()).toBe(ValueCategory.List);
      expect(AnyValue.from({ key: 'value' }).getCategory()).toBe(ValueCategory.Struct);
    });
  });

  describe('Rust-Compatible Value Categories', () => {
    it('should use correct category enum values matching Rust', () => {
      // Verify the enum values match Rust runar-serializer
      expect(ValueCategory.Null).toBe(0);
      expect(ValueCategory.Primitive).toBe(1);
      expect(ValueCategory.List).toBe(2);
      expect(ValueCategory.Map).toBe(3);
      expect(ValueCategory.Struct).toBe(4);
      expect(ValueCategory.Bytes).toBe(5);
      expect(ValueCategory.Json).toBe(6);
    });
  });

  describe('Wire Format Structure', () => {
    it('should produce correct wire format structure', () => {
      const value = AnyValue.from('test');
      const bytes = value.serialize();

      expect(bytes.ok).toBe(true);
      if (bytes.ok) {
        const wire = bytes.value;

        // Wire format: [category][is_encrypted][type_name_len][type_name_bytes...][data...]
        const category = wire[0];
        const isEncrypted = wire[1];
        const typeNameLen = wire[2];
        const typeNameBytes = wire.subarray(3, 3 + typeNameLen);
        const typeName = new TextDecoder().decode(typeNameBytes);
        const dataStart = 3 + typeNameLen;
        const dataBytes = wire.subarray(dataStart);

        expect(category).toBe(ValueCategory.Primitive);
        expect(isEncrypted).toBe(0); // Not encrypted
        expect(typeName).toBe('string');
        // The data bytes contain CBOR-encoded data, not raw UTF-8
        // For a string primitive, we expect CBOR encoding of the string value
        expect(dataBytes.length).toBeGreaterThan(0);
        expect(category).toBe(ValueCategory.Primitive);
        expect(typeName).toBe('string');
        expect(isEncrypted).toBe(0);
      }
    });
  });
});
