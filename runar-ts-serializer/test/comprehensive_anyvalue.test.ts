// Comprehensive AnyValue Tests - Basic Functionality
// Focuses on core AnyValue features without encryption
// Container element tests are covered in container_element_encryption.test.ts

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { AnyValue, ValueCategory } from '../src';
import { AnyValueTestEnvironment } from './test_utils/key_managers';

// Test structs matching Rust exactly
interface TestStruct {
  a: number;
  b: string;
}

describe('Comprehensive AnyValue Tests - Basic Functionality', () => {
  let testEnv: AnyValueTestEnvironment;

  beforeAll(async () => {
    testEnv = new AnyValueTestEnvironment();
    await testEnv.initialize();
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  describe('Primitive Type Tests', () => {
    test('should handle string primitive roundtrip', async () => {
      const original = 'hello';
      const anyValue = AnyValue.newPrimitive(original);
      expect(anyValue.getCategory()).toBe(ValueCategory.Primitive);

      const serialized = anyValue.serialize();
      expect(serialized.ok).toBe(true);
      if (!serialized.ok) return;

      const deserialized = AnyValue.deserialize(serialized.value, undefined);
      expect(deserialized.ok).toBe(true);
      if (!deserialized.ok) return;

      const resolved = deserialized.value.asType<string>();
      expect(resolved.ok).toBe(true);
      if (resolved.ok) {
        expect(resolved.value).toBe(original);
      }
    });

    test('should handle number primitive roundtrip', async () => {
      const original = 42;
      const anyValue = AnyValue.newPrimitive(original);
      expect(anyValue.getCategory()).toBe(ValueCategory.Primitive);

      const serialized = anyValue.serialize();
      expect(serialized.ok).toBe(true);
      if (!serialized.ok) return;

      const deserialized = AnyValue.deserialize(serialized.value, undefined);
      expect(deserialized.ok).toBe(true);
      if (!deserialized.ok) return;

      const resolved = deserialized.value.asType<number>();
      expect(resolved.ok).toBe(true);
      if (resolved.ok) {
        expect(resolved.value).toBe(original);
      }
    });

    test('should handle boolean primitive roundtrip', async () => {
      const original = true;
      const anyValue = AnyValue.newPrimitive(original);
      expect(anyValue.getCategory()).toBe(ValueCategory.Primitive);

      const serialized = anyValue.serialize();
      expect(serialized.ok).toBe(true);
      if (!serialized.ok) return;

      const deserialized = AnyValue.deserialize(serialized.value, undefined);
      expect(deserialized.ok).toBe(true);
      if (!deserialized.ok) return;

      const resolved = deserialized.value.asType<boolean>();
      expect(resolved.ok).toBe(true);
      if (resolved.ok) {
        expect(resolved.value).toBe(original);
      }
    });

    test('should handle float primitive roundtrip', async () => {
      const original = Math.PI;
      const anyValue = AnyValue.newPrimitive(original);
      expect(anyValue.getCategory()).toBe(ValueCategory.Primitive);

      const serialized = anyValue.serialize();
      expect(serialized.ok).toBe(true);
      if (!serialized.ok) return;

      const deserialized = AnyValue.deserialize(serialized.value, undefined);
      expect(deserialized.ok).toBe(true);
      if (!deserialized.ok) return;

      const resolved = deserialized.value.asType<number>();
      expect(resolved.ok).toBe(true);
      if (resolved.ok) {
        expect(resolved.value).toBeCloseTo(original);
      }
    });
  });

  describe('Container Type Tests', () => {
    test('should handle list with mixed primitives', async () => {
      const original = [
        AnyValue.newPrimitive(1),
        AnyValue.newPrimitive('two')
      ];
      const anyValue = AnyValue.newList(original);
      expect(anyValue.getCategory()).toBe(ValueCategory.List);

      const serialized = anyValue.serialize();
      expect(serialized.ok).toBe(true);
      if (!serialized.ok) return;

      const deserialized = AnyValue.deserialize(serialized.value, undefined);
      expect(deserialized.ok).toBe(true);
      if (!deserialized.ok) return;

      const resolved = deserialized.value.asAnyValueArray();
      expect(resolved.ok).toBe(true);
      if (resolved.ok) {
        expect(resolved.value.length).toBe(2);
        
        const item0 = resolved.value[0].asType<number>();
        expect(item0.ok).toBe(true);
        if (item0.ok) expect(item0.value).toBe(1);
        
        const item1 = resolved.value[1].asType<string>();
        expect(item1.ok).toBe(true);
        if (item1.ok) expect(item1.value).toBe('two');
      }
    });

    test('should handle map with mixed primitives', async () => {
      const original = new Map<string, AnyValue>();
      original.set('key1', AnyValue.newPrimitive(42));
      original.set('key2', AnyValue.newPrimitive('value'));

      const anyValue = AnyValue.newMap(original);
      expect(anyValue.getCategory()).toBe(ValueCategory.Map);

      const serialized = anyValue.serialize();
      expect(serialized.ok).toBe(true);
      if (!serialized.ok) return;

      const deserialized = AnyValue.deserialize(serialized.value, undefined);
      expect(deserialized.ok).toBe(true);
      if (!deserialized.ok) return;

      const resolved = deserialized.value.asAnyValueMap();
      expect(resolved.ok).toBe(true);
      if (resolved.ok) {
        expect(resolved.value.size).toBe(2);
        
        const val1 = resolved.value.get('key1')?.asType<number>();
        expect(val1?.ok).toBe(true);
        if (val1?.ok) expect(val1.value).toBe(42);
        
        const val2 = resolved.value.get('key2')?.asType<string>();
        expect(val2?.ok).toBe(true);
        if (val2?.ok) expect(val2.value).toBe('value');
      }
    });
  });

  describe('Special Type Tests', () => {
    test('should handle bytes roundtrip', async () => {
      const original = new Uint8Array([1, 2, 3]);
      const anyValue = AnyValue.newBytes(original);
      expect(anyValue.getCategory()).toBe(ValueCategory.Bytes);

      const serialized = anyValue.serialize();
      expect(serialized.ok).toBe(true);
      if (!serialized.ok) return;

      const deserialized = AnyValue.deserialize(serialized.value, undefined);
      expect(deserialized.ok).toBe(true);
      if (!deserialized.ok) return;

      const resolved = deserialized.value.asType<Uint8Array>();
      expect(resolved.ok).toBe(true);
      if (resolved.ok) {
        expect(Array.from(resolved.value)).toEqual(Array.from(original));
      }
    });

    test('should handle JSON roundtrip', async () => {
      const original = { key: 'value', number: 42, array: [1, 2, 3] };
      const anyValue = AnyValue.newJson(original);
      expect(anyValue.getCategory()).toBe(ValueCategory.Json);

      const serialized = anyValue.serialize();
      expect(serialized.ok).toBe(true);
      if (!serialized.ok) return;

      const deserialized = AnyValue.deserialize(serialized.value, undefined);
      expect(deserialized.ok).toBe(true);
      if (!deserialized.ok) return;

      const resolved = deserialized.value.asType<object>();
      expect(resolved.ok).toBe(true);
      if (resolved.ok) {
        expect(resolved.value).toEqual(original);
      }
    });

    test('should handle null values', async () => {
      const anyValue = AnyValue.null();
      expect(anyValue.getCategory()).toBe(ValueCategory.Null);
      expect(anyValue.isNull()).toBe(true);

      const serialized = anyValue.serialize();
      expect(serialized.ok).toBe(true);
      if (!serialized.ok) return;

      const deserialized = AnyValue.deserialize(serialized.value, undefined);
      expect(deserialized.ok).toBe(true);
      if (!deserialized.ok) return;

      expect(deserialized.value.getCategory()).toBe(ValueCategory.Null);
      expect(deserialized.value.isNull()).toBe(true);
    });
  });

  describe('Struct Type Tests', () => {
    test('should handle struct roundtrip', async () => {
      const original: TestStruct = {
        a: 123,
        b: 'test'
      };
      const anyValue = AnyValue.newStruct(original);
      expect(anyValue.getCategory()).toBe(ValueCategory.Struct);

      const serialized = anyValue.serialize();
      expect(serialized.ok).toBe(true);
      if (!serialized.ok) return;

      const deserialized = AnyValue.deserialize(serialized.value, undefined);
      expect(deserialized.ok).toBe(true);
      if (!deserialized.ok) return;

      const resolved = deserialized.value.asType<TestStruct>();
      expect(resolved.ok).toBe(true);
      if (resolved.ok) {
        expect(resolved.value).toEqual(original);
      }
    });
  });

  describe('Nested Structure Tests', () => {
    test('should handle nested containers', async () => {
      const innerMap = new Map<string, AnyValue>();
      innerMap.set('num', AnyValue.newPrimitive(42));
      innerMap.set('str', AnyValue.newPrimitive('nested'));

      const list = [AnyValue.newMap(innerMap)];
      const anyValue = AnyValue.newList(list);

      const serialized = anyValue.serialize();
      expect(serialized.ok).toBe(true);
      if (!serialized.ok) return;

      const deserialized = AnyValue.deserialize(serialized.value, undefined);
      expect(deserialized.ok).toBe(true);
      if (!deserialized.ok) return;

      const resolved = deserialized.value.asAnyValueArray();
      expect(resolved.ok).toBe(true);
      if (resolved.ok) {
        expect(resolved.value.length).toBe(1);
        
        // After deserialization, Maps become Structs (plain objects)
        const innerStructResolved = resolved.value[0].asType<Record<string, any>>();
        expect(innerStructResolved.ok).toBe(true);
        if (innerStructResolved.ok) {
          expect(innerStructResolved.value.num).toBe(42);
          expect(innerStructResolved.value.str).toBe('nested');
        }
      }
    });
  });

  describe('JSON Conversion Tests', () => {
    test('should convert primitive to JSON', async () => {
      const anyValue = AnyValue.newPrimitive('hello');
      const jsonVal = anyValue.toJson();
      expect(jsonVal.ok).toBe(true);
      if (jsonVal.ok) {
        expect(jsonVal.value).toBe('hello');
      }
    });

    test('should convert list to JSON', async () => {
      const list = [AnyValue.newPrimitive(1), AnyValue.newPrimitive(2)];
      const anyValue = AnyValue.newList(list);
      const jsonVal = anyValue.toJson();
      expect(jsonVal.ok).toBe(true);
      if (jsonVal.ok) {
        expect(jsonVal.value).toEqual([1, 2]);
      }
    });

    test('should handle complex JSON structures', async () => {
      const jsonVal = {
        string: 'hello',
        number: 42,
        boolean: true,
        array: [1, 2, 3],
        object: { key: 'value' }
      };

      const anyValue = AnyValue.newJson(jsonVal);
      expect(anyValue.getCategory()).toBe(ValueCategory.Json);

      const backToJson = anyValue.toJson();
      expect(backToJson.ok).toBe(true);
      if (backToJson.ok) {
        expect(backToJson.value).toEqual(jsonVal);
      }
    });
  });

  describe('Error Handling Tests', () => {
    test('should handle deserialize bounds check', async () => {
      // Test malformed data that would cause out-of-bounds access
      const malformedData = new Uint8Array([1, 0, 2]); // category=1, encrypted=0, type_name_len=2
      // This has 3 bytes total, but claims type_name_len=2
      // Should fail with invalid type name length

      const result = AnyValue.deserialize(malformedData, undefined);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Invalid type name length');
      }
    });

    test('should handle empty containers', async () => {
      const emptyMap = new Map<string, any>();
      const mapAnyValue = AnyValue.newMap(emptyMap);
      
      const mapSerialized = mapAnyValue.serialize();
      expect(mapSerialized.ok).toBe(true);
      if (!mapSerialized.ok) return;

      const mapDeserialized = AnyValue.deserialize(mapSerialized.value, undefined);
      expect(mapDeserialized.ok).toBe(true);
      if (!mapDeserialized.ok) return;

      const mapTyped = mapDeserialized.value.asType<Map<string, any>>(Map);
      expect(mapTyped.ok).toBe(true);
      if (mapTyped.ok) {
        expect(mapTyped.value.size).toBe(0);
      }

      const emptyVec: any[] = [];
      const vecAnyValue = AnyValue.newList(emptyVec);
      
      const vecSerialized = vecAnyValue.serialize();
      expect(vecSerialized.ok).toBe(true);
      if (!vecSerialized.ok) return;

      const vecDeserialized = AnyValue.deserialize(vecSerialized.value, undefined);
      expect(vecDeserialized.ok).toBe(true);
      if (!vecDeserialized.ok) return;

      const vecTyped = vecDeserialized.value.asType<any[]>(Array);
      expect(vecTyped.ok).toBe(true);
      if (vecTyped.ok) {
        expect(vecTyped.value.length).toBe(0);
      }
    });
  });
});