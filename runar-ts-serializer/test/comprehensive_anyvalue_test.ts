// Comprehensive AnyValue Tests
// Complete parity with Rust composite_container_test.rs and arc_value_test.rs
// No duplication, full coverage, critical quality standards

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { AnyValue, ValueCategory, encryptLabelGroupSync } from '../src';
import { AnyValueTestEnvironment } from './test_utils/key_managers';

// Test structs matching Rust exactly
interface TestProfile {
  id: string;
  name: string;
  email: string;
}

interface TestStruct {
  a: number;
  b: string;
}

describe('Comprehensive AnyValue Tests', () => {
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

  describe('Container Element Tests', () => {
    test('should handle simple HashMap<String,String> roundtrip', async () => {
      const map = new Map<string, string>();
      map.set('u1', 'Alice');
      map.set('u2', 'Bob');

      const anyValue = AnyValue.newMap(map);
      const serialized = anyValue.serialize();
      expect(serialized.ok).toBe(true);
      if (!serialized.ok) return;

      const deserialized = AnyValue.deserialize(serialized.value, undefined);
      expect(deserialized.ok).toBe(true);
      if (!deserialized.ok) return;

      expect(deserialized.value.getCategory()).toBe(ValueCategory.Map);

      const typedMap = deserialized.value.asType<Map<string, string>>(Map);
      expect(typedMap.ok).toBe(true);
      if (typedMap.ok) {
        expect(typedMap.value.size).toBe(2);
        expect(typedMap.value.get('u1')).toBe('Alice');
        expect(typedMap.value.get('u2')).toBe('Bob');
      }
    });

    test('should handle simple Vec<String> roundtrip', async () => {
      const vec = ['Alice', 'Bob'];
      const anyValue = AnyValue.newList(vec);
      const serialized = anyValue.serialize();
      expect(serialized.ok).toBe(true);
      if (!serialized.ok) return;

      const deserialized = AnyValue.deserialize(serialized.value, undefined);
      expect(deserialized.ok).toBe(true);
      if (!deserialized.ok) return;

      expect(deserialized.value.getCategory()).toBe(ValueCategory.List);

      const typedVec = deserialized.value.asType<string[]>(Array);
      expect(typedVec.ok).toBe(true);
      if (typedVec.ok) {
        expect(typedVec.value.length).toBe(2);
        expect(typedVec.value[0]).toBe('Alice');
        expect(typedVec.value[1]).toBe('Bob');
      }
    });

    test('should handle HashMap<String,Struct> roundtrip', async () => {
      const map = new Map<string, AnyValue>();
      map.set('u1', AnyValue.newStruct({
        id: 'u1',
        name: 'Alice',
        email: 'a@x.com',
      }));
      map.set('u2', AnyValue.newStruct({
        id: 'u2',
        name: 'Bob',
        email: 'b@x.com',
      }));

      const anyValue = AnyValue.newMap(map);
      const serialized = anyValue.serialize();
      expect(serialized.ok).toBe(true);
      if (!serialized.ok) return;

      const deserialized = AnyValue.deserialize(serialized.value, undefined);
      expect(deserialized.ok).toBe(true);
      if (!deserialized.ok) return;

      expect(deserialized.value.getCategory()).toBe(ValueCategory.Map);

      const typedMap = deserialized.value.asAnyValueMap();
      expect(typedMap.ok).toBe(true);
      if (typedMap.ok) {
        expect(typedMap.value.size).toBe(2);

        const user1Value = typedMap.value.get('u1');
        expect(user1Value).toBeDefined();
        expect(user1Value).toBeInstanceOf(AnyValue);
        
        const user1Profile = user1Value!.asType<TestProfile>();
        expect(user1Profile.ok).toBe(true);
        if (user1Profile.ok) {
          expect(user1Profile.value.id).toBe('u1');
          expect(user1Profile.value.name).toBe('Alice');
          expect(user1Profile.value.email).toBe('a@x.com');
        }

        const user2Value = typedMap.value.get('u2');
        expect(user2Value).toBeDefined();
        expect(user2Value).toBeInstanceOf(AnyValue);
        
        const user2Profile = user2Value!.asType<TestProfile>();
        expect(user2Profile.ok).toBe(true);
        if (user2Profile.ok) {
          expect(user2Profile.value.id).toBe('u2');
          expect(user2Profile.value.name).toBe('Bob');
          expect(user2Profile.value.email).toBe('b@x.com');
        }
      }
    });

    test('should handle Vec<Struct> roundtrip', async () => {
      const profiles = [
        AnyValue.newStruct({
          id: 'u1',
          name: 'Alice',
          email: 'a@x.com',
        }),
        AnyValue.newStruct({
          id: 'u2',
          name: 'Bob',
          email: 'b@x.com',
        }),
      ];

      const anyValue = AnyValue.newList(profiles);
      const serialized = anyValue.serialize();
      expect(serialized.ok).toBe(true);
      if (!serialized.ok) return;

      const deserialized = AnyValue.deserialize(serialized.value, undefined);
      expect(deserialized.ok).toBe(true);
      if (!deserialized.ok) return;

      expect(deserialized.value.getCategory()).toBe(ValueCategory.List);

      const typedProfiles = deserialized.value.asAnyValueArray();
      expect(typedProfiles.ok).toBe(true);
      if (typedProfiles.ok) {
        expect(typedProfiles.value.length).toBe(2);

        const user1Profile = typedProfiles.value[0].asType<TestProfile>();
        expect(user1Profile.ok).toBe(true);
        if (user1Profile.ok) {
          expect(user1Profile.value.id).toBe('u1');
          expect(user1Profile.value.name).toBe('Alice');
          expect(user1Profile.value.email).toBe('a@x.com');
        }

        const user2Profile = typedProfiles.value[1].asType<TestProfile>();
        expect(user2Profile.ok).toBe(true);
        if (user2Profile.ok) {
          expect(user2Profile.value.id).toBe('u2');
          expect(user2Profile.value.name).toBe('Bob');
          expect(user2Profile.value.email).toBe('b@x.com');
        }
      }
    });

    test('should handle nested composite structures', async () => {
      const nestedMap = new Map<string, AnyValue>();

      const group1Profiles = [
        AnyValue.newStruct({
          id: 'g1_u1',
          name: 'Group1 Alice',
          email: 'g1_a@x.com',
        }),
        AnyValue.newStruct({
          id: 'g1_u2',
          name: 'Group1 Bob',
          email: 'g1_b@x.com',
        }),
      ];
      nestedMap.set('group1', AnyValue.newList(group1Profiles));

      const group2Profiles = [AnyValue.newStruct({
        id: 'g2_u1',
        name: 'Group2 Charlie',
        email: 'g2_c@x.com',
      })];
      nestedMap.set('group2', AnyValue.newList(group2Profiles));

      const anyValue = AnyValue.newMap(nestedMap);
      const serialized = anyValue.serialize();
      expect(serialized.ok).toBe(true);
      if (!serialized.ok) return;

      const deserialized = AnyValue.deserialize(serialized.value, undefined);
      expect(deserialized.ok).toBe(true);
      if (!deserialized.ok) return;

      expect(deserialized.value.getCategory()).toBe(ValueCategory.Map);

      const typedNested = deserialized.value.asAnyValueMap();
      expect(typedNested.ok).toBe(true);
      if (typedNested.ok) {
        expect(typedNested.value.size).toBe(2);

        const group1Value = typedNested.value.get('group1');
        expect(group1Value).toBeDefined();
        expect(group1Value).toBeInstanceOf(AnyValue);
        
        const group1List = group1Value!.asAnyValueArray();
        expect(group1List.ok).toBe(true);
        if (group1List.ok) {
          expect(group1List.value.length).toBe(2);
          
          const user1Element = group1List.value[0];
          expect(user1Element).toBeInstanceOf(AnyValue);
          const user1Profile = user1Element.asType<TestProfile>();
          expect(user1Profile.ok).toBe(true);
          if (user1Profile.ok) {
            expect(user1Profile.value.id).toBe('g1_u1');
            expect(user1Profile.value.name).toBe('Group1 Alice');
            expect(user1Profile.value.email).toBe('g1_a@x.com');
          }
        }

        const group2Value = typedNested.value.get('group2');
        expect(group2Value).toBeDefined();
        expect(group2Value).toBeInstanceOf(AnyValue);
        
        const group2List = group2Value!.asAnyValueArray();
        expect(group2List.ok).toBe(true);
        if (group2List.ok) {
          expect(group2List.value.length).toBe(1);
          
          const user1Element = group2List.value[0];
          expect(user1Element).toBeInstanceOf(AnyValue);
          const user1Profile = user1Element.asType<TestProfile>();
          expect(user1Profile.ok).toBe(true);
          if (user1Profile.ok) {
            expect(user1Profile.value.id).toBe('g2_u1');
            expect(user1Profile.value.name).toBe('Group2 Charlie');
            expect(user1Profile.value.email).toBe('g2_c@x.com');
          }
        }
      }
    });

    test('should handle mixed content containers', async () => {
      const mixedMap = new Map<string, AnyValue>();

      mixedMap.set('profile', AnyValue.newStruct({
        id: 'mixed_user',
        name: 'Mixed User',
        email: 'mixed@x.com',
      }));

      mixedMap.set('count', AnyValue.newPrimitive(42));

      mixedMap.set('description', AnyValue.newPrimitive('Mixed content test'));

      mixedMap.set('scores', AnyValue.newList([
        AnyValue.newPrimitive(85),
        AnyValue.newPrimitive(92),
        AnyValue.newPrimitive(78),
      ]));

      const anyValue = AnyValue.newMap(mixedMap);
      const serialized = anyValue.serialize();
      expect(serialized.ok).toBe(true);
      if (!serialized.ok) return;

      const deserialized = AnyValue.deserialize(serialized.value, undefined);
      expect(deserialized.ok).toBe(true);
      if (!deserialized.ok) return;

      expect(deserialized.value.getCategory()).toBe(ValueCategory.Map);

      const typedMap = deserialized.value.asAnyValueMap();
      expect(typedMap.ok).toBe(true);
      if (typedMap.ok) {
        expect(typedMap.value.size).toBe(4);

        const profileValue = typedMap.value.get('profile');
        expect(profileValue).toBeDefined();
        expect(profileValue).toBeInstanceOf(AnyValue);
        const profile = profileValue!.asType<TestProfile>();
        expect(profile.ok).toBe(true);
        if (profile.ok) {
          expect(profile.value.id).toBe('mixed_user');
          expect(profile.value.name).toBe('Mixed User');
          expect(profile.value.email).toBe('mixed@x.com');
        }

        const countValue = typedMap.value.get('count');
        expect(countValue).toBeDefined();
        expect(countValue).toBeInstanceOf(AnyValue);
        const count = countValue!.asType<number>();
        expect(count.ok).toBe(true);
        if (count.ok) expect(count.value).toBe(42);

        const descValue = typedMap.value.get('description');
        expect(descValue).toBeDefined();
        expect(descValue).toBeInstanceOf(AnyValue);
        const description = descValue!.asType<string>();
        expect(description.ok).toBe(true);
        if (description.ok) expect(description.value).toBe('Mixed content test');

        const scoresValue = typedMap.value.get('scores');
        expect(scoresValue).toBeDefined();
        expect(scoresValue).toBeInstanceOf(AnyValue);
        
        const scores = scoresValue!.asAnyValueArray();
        expect(scores.ok).toBe(true);
        if (scores.ok) {
          expect(scores.value.length).toBe(3);
          
          const score1 = scores.value[0].asType<number>();
          expect(score1.ok).toBe(true);
          if (score1.ok) expect(score1.value).toBe(85);
          
          const score2 = scores.value[1].asType<number>();
          expect(score2.ok).toBe(true);
          if (score2.ok) expect(score2.value).toBe(92);
          
          const score3 = scores.value[2].asType<number>();
          expect(score3.ok).toBe(true);
          if (score3.ok) expect(score3.value).toBe(78);
        }
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
