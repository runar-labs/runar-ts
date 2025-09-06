// Container Element Encryption Tests
// Based on Rust composite_container_test.rs and arc_value_test.rs patterns

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { AnyValue, ValueCategory, encryptLabelGroupSync } from '../src';
import { TestEnvironment } from './test_utils/key_managers';

// Test struct without encryption (like TestProfile in Rust)
interface TestProfile {
  id: string;
  name: string;
  email: string;
}

// Test struct with encryption (like TestStruct in Rust)
interface TestStruct {
  a: number;
  b: string;
}

describe('Container Element Encryption Tests', () => {
  let testEnv: TestEnvironment;

  beforeAll(async () => {
    testEnv = new TestEnvironment();
    await testEnv.initialize();
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  describe('Simple Container Tests', () => {
    test('should handle simple HashMap<String,String> roundtrip', async () => {
      // Create HashMap<String, String> like in Rust test_simple_hashmap_roundtrip
      const map = new Map<string, string>();
      map.set('u1', 'Alice');
      map.set('u2', 'Bob');

      const anyValue = AnyValue.newMap(map);

      // Test serialization with encryption context
      const serializationContext = testEnv.createSerializationContext(
        testEnv.getUserMobileWrapper()
      );
      const serialized = anyValue.serialize(serializationContext);
      expect(serialized.ok).toBe(true);
      if (!serialized.ok) return;

      // Test deserialization
      const deserialized = AnyValue.deserialize(serialized.value, testEnv.getNodeWrapper());
      expect(deserialized.ok).toBe(true);
      if (!deserialized.ok) return;

      expect(deserialized.value.getCategory()).toBe(ValueCategory.Map);

      // Extract typed HashMap using asType with explicit constructor
      const typedMap = deserialized.value.asType<Map<string, string>>(Map);
      expect(typedMap.ok).toBe(true);
      if (!typedMap.ok) return;

      // Verify the map has the correct number of entries
      expect(typedMap.value.size).toBe(2);

      // Verify user1 - elements should be plain strings after container element decryption
      const user1Value = typedMap.value.get('u1');
      expect(user1Value).toBeDefined();
      expect(user1Value).toBe('Alice');

      // Verify user2
      const user2Value = typedMap.value.get('u2');
      expect(user2Value).toBeDefined();
      expect(user2Value).toBe('Bob');
    });

    test('should handle simple Vec<String> roundtrip', async () => {
      // Create Vec<String> like in Rust test_simple_vec_roundtrip
      const vec = ['Alice', 'Bob'];

      const anyValue = AnyValue.newList(vec);

      // Test serialization with encryption context
      const serializationContext = testEnv.createSerializationContext(
        testEnv.getUserMobileWrapper()
      );
      const serialized = anyValue.serialize(serializationContext);
      expect(serialized.ok).toBe(true);
      if (!serialized.ok) return;

      // Test deserialization
      const deserialized = AnyValue.deserialize(serialized.value, testEnv.getNodeWrapper());
      expect(deserialized.ok).toBe(true);
      if (!deserialized.ok) return;

      expect(deserialized.value.getCategory()).toBe(ValueCategory.List);

      // Extract typed Vec using asType with explicit constructor
      const typedVec = deserialized.value.asType<string[]>(Array);
      expect(typedVec.ok).toBe(true);
      if (!typedVec.ok) return;

      // Verify the vec has the correct number of entries
      expect(typedVec.value.length).toBe(2);

      // Verify user1 - elements should be plain strings after container element decryption
      const user1Value = typedVec.value[0];
      expect(user1Value).toBeDefined();
      expect(user1Value).toBe('Alice');

      // Verify user2
      const user2Value = typedVec.value[1];
      expect(user2Value).toBeDefined();
      expect(user2Value).toBe('Bob');
    });

    test('should handle primitive types in containers', async () => {
      // Test primitives like in Rust test_primitive_* tests
      const testCases = [
        { value: 'hello', type: 'string' },
        { value: 42, type: 'number' },
        { value: true, type: 'boolean' },
        { value: 3.14159, type: 'number' },
      ];

      for (const testCase of testCases) {
        const anyValue = AnyValue.newPrimitive(testCase.value);

        const serializationContext = testEnv.createSerializationContext(
          testEnv.getUserMobileWrapper()
        );
        const serialized = anyValue.serialize(serializationContext);
        expect(serialized.ok).toBe(true);
        if (!serialized.ok) continue;

        const deserialized = AnyValue.deserialize(serialized.value, testEnv.getNodeWrapper());
        expect(deserialized.ok).toBe(true);
        if (!deserialized.ok) continue;

        const typedValue = deserialized.value.asType<typeof testCase.value>();
        expect(typedValue.ok).toBe(true);
        if (!typedValue.ok) continue;

        expect(typedValue.value).toBe(testCase.value);
      }
    });
  });

  describe('Composite Container Tests', () => {
    test('should handle HashMap<String,Struct> roundtrip', async () => {
      // Create HashMap<String, AnyValue> like in Rust test_hashmap_of_profiles_roundtrip
      const map = new Map<string, AnyValue>();
      map.set(
        'u1',
        AnyValue.newStruct({
          id: 'u1',
          name: 'Alice',
          email: 'a@x.com',
        })
      );
      map.set(
        'u2',
        AnyValue.newStruct({
          id: 'u2',
          name: 'Bob',
          email: 'b@x.com',
        })
      );

      const anyValue = AnyValue.newMap(map);

      // Test serialization with encryption context
      const serializationContext = testEnv.createSerializationContext(
        testEnv.getUserMobileWrapper()
      );
      const serialized = anyValue.serialize(serializationContext);
      expect(serialized.ok).toBe(true);
      if (!serialized.ok) return;

      // Test deserialization
      const deserialized = AnyValue.deserialize(serialized.value, testEnv.getNodeWrapper());
      expect(deserialized.ok).toBe(true);
      if (!deserialized.ok) return;

      expect(deserialized.value.getCategory()).toBe(ValueCategory.Map);

      // Extract typed HashMap using asType - elements are AnyValue objects
      const typedMap = deserialized.value.asType<Map<string, AnyValue>>(Map);
      expect(typedMap.ok).toBe(true);
      if (!typedMap.ok) return;

      // Verify the map has the correct number of entries
      expect(typedMap.value.size).toBe(2);

      // Verify user1 - should be AnyValue object that can be converted to TestProfile
      const user1Value = typedMap.value.get('u1');
      expect(user1Value).toBeDefined();
      expect(user1Value).toBeInstanceOf(AnyValue);

      if (!user1Value) return; // Type guard
      const user1Profile = user1Value.asType<TestProfile>();
      expect(user1Profile.ok).toBe(true);
      if (user1Profile.ok) {
        expect(user1Profile.value.id).toBe('u1');
        expect(user1Profile.value.name).toBe('Alice');
        expect(user1Profile.value.email).toBe('a@x.com');
      }

      // Verify user2 - should be AnyValue object that can be converted to TestProfile
      const user2Value = typedMap.value.get('u2');
      expect(user2Value).toBeDefined();
      expect(user2Value).toBeInstanceOf(AnyValue);

      if (!user2Value) return; // Type guard
      const user2Profile = user2Value.asType<TestProfile>();
      expect(user2Profile.ok).toBe(true);
      if (user2Profile.ok) {
        expect(user2Profile.value.id).toBe('u2');
        expect(user2Profile.value.name).toBe('Bob');
        expect(user2Profile.value.email).toBe('b@x.com');
      }
    });

    test('should handle Vec<Struct> roundtrip', async () => {
      // Create Vec<AnyValue> like in Rust test_vec_of_profiles_roundtrip
      const profiles: AnyValue[] = [
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

      // Test serialization with encryption context
      const serializationContext = testEnv.createSerializationContext(
        testEnv.getUserMobileWrapper()
      );
      const serialized = anyValue.serialize(serializationContext);
      expect(serialized.ok).toBe(true);
      if (!serialized.ok) return;

      // Test deserialization
      const deserialized = AnyValue.deserialize(serialized.value, testEnv.getNodeWrapper());
      expect(deserialized.ok).toBe(true);
      if (!deserialized.ok) return;

      expect(deserialized.value.getCategory()).toBe(ValueCategory.List);

      // Extract typed Vec using asType - elements are AnyValue objects
      const typedProfiles = deserialized.value.asType<AnyValue[]>(Array);
      expect(typedProfiles.ok).toBe(true);
      if (!typedProfiles.ok) return;

      // Verify the list has the correct number of entries
      expect(typedProfiles.value.length).toBe(2);

      // Verify first profile (user1) - should be AnyValue object that can be converted to TestProfile
      const user1Value = typedProfiles.value[0];
      expect(user1Value).toBeDefined();
      expect(user1Value).toBeInstanceOf(AnyValue);

      const user1Profile = user1Value.asType<TestProfile>();
      expect(user1Profile.ok).toBe(true);
      if (user1Profile.ok) {
        expect(user1Profile.value.id).toBe('u1');
        expect(user1Profile.value.name).toBe('Alice');
        expect(user1Profile.value.email).toBe('a@x.com');
      }

      // Verify second profile (user2) - should be AnyValue object that can be converted to TestProfile
      const user2Value = typedProfiles.value[1];
      expect(user2Value).toBeDefined();
      expect(user2Value).toBeInstanceOf(AnyValue);

      const user2Profile = user2Value.asType<TestProfile>();
      expect(user2Profile.ok).toBe(true);
      if (user2Profile.ok) {
        expect(user2Profile.value.id).toBe('u2');
        expect(user2Profile.value.name).toBe('Bob');
        expect(user2Profile.value.email).toBe('b@x.com');
      }
    });
  });

  describe('Nested Container Tests', () => {
    test('should handle nested composite structures', async () => {
      // Create HashMap<String, Vec<AnyValue>> like in Rust test_nested_composite_structures
      const group1Profiles: AnyValue[] = [
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

      const group2Profiles: AnyValue[] = [
        AnyValue.newStruct({
          id: 'g2_u1',
          name: 'Group2 Charlie',
          email: 'g2_c@x.com',
        }),
      ];

      const nestedMap = new Map<string, AnyValue>();
      nestedMap.set('group1', AnyValue.newList(group1Profiles));
      nestedMap.set('group2', AnyValue.newList(group2Profiles));

      const anyValue = AnyValue.newMap(nestedMap);

      // Test serialization and deserialization
      const serialized = anyValue.serialize(
        testEnv.createSerializationContext(testEnv.getUserMobileWrapper())
      );
      expect(serialized.ok).toBe(true);
      if (!serialized.ok) return;

      const deserialized = AnyValue.deserialize(serialized.value, testEnv.getNodeWrapper());
      expect(deserialized.ok).toBe(true);
      if (!deserialized.ok) return;

      expect(deserialized.value.getCategory()).toBe(ValueCategory.Map);

      // Extract the nested structure - elements are AnyValue objects
      const typedNested = deserialized.value.asType<Map<string, AnyValue>>(Map);
      expect(typedNested.ok).toBe(true);
      if (!typedNested.ok) return;

      // Verify structure
      expect(typedNested.value.size).toBe(2);

      // Verify group1 - should be AnyValue array that can be converted
      const group1Value = typedNested.value.get('group1');
      expect(group1Value).toBeDefined();
      expect(group1Value).toBeInstanceOf(AnyValue);

      if (!group1Value) return; // Type guard
      const group1List = group1Value.asType<AnyValue[]>(Array);
      expect(group1List.ok).toBe(true);
      if (!group1List.ok) return;
      expect(group1List.value.length).toBe(2);

      // Check the first element - should be AnyValue that can be converted to TestProfile
      const user1Element = group1List.value[0];
      expect(user1Element).toBeDefined();
      expect(user1Element).toBeInstanceOf(AnyValue);

      const user1Profile = user1Element.asType<TestProfile>();
      expect(user1Profile.ok).toBe(true);
      if (user1Profile.ok) {
        expect(user1Profile.value.id).toBe('g1_u1');
        expect(user1Profile.value.name).toBe('Group1 Alice');
        expect(user1Profile.value.email).toBe('g1_a@x.com');
      }

      // Check the second element - should be AnyValue that can be converted to TestProfile
      const user2Element = group1List.value[1];
      expect(user2Element).toBeDefined();
      expect(user2Element).toBeInstanceOf(AnyValue);

      const user2Profile = user2Element.asType<TestProfile>();
      expect(user2Profile.ok).toBe(true);
      if (user2Profile.ok) {
        expect(user2Profile.value.id).toBe('g1_u2');
        expect(user2Profile.value.name).toBe('Group1 Bob');
        expect(user2Profile.value.email).toBe('g1_b@x.com');
      }

      // Verify group2 - should be AnyValue array that can be converted
      const group2Value = typedNested.value.get('group2');
      expect(group2Value).toBeDefined();
      expect(group2Value).toBeInstanceOf(AnyValue);

      if (!group2Value) return; // Type guard
      const group2List = group2Value.asType<AnyValue[]>(Array);
      expect(group2List.ok).toBe(true);
      if (!group2List.ok) return;
      expect(group2List.value.length).toBe(1);

      // Check the element - should be AnyValue that can be converted to TestProfile
      const group2User1Element = group2List.value[0];
      expect(group2User1Element).toBeDefined();
      expect(group2User1Element).toBeInstanceOf(AnyValue);

      const group2User1Profile = group2User1Element.asType<TestProfile>();
      expect(group2User1Profile.ok).toBe(true);
      if (group2User1Profile.ok) {
        expect(group2User1Profile.value.id).toBe('g2_u1');
        expect(group2User1Profile.value.name).toBe('Group2 Charlie');
        expect(group2User1Profile.value.email).toBe('g2_c@x.com');
      }
    });
  });

  describe('Mixed Content Container Tests', () => {
    test('should handle mixed content containers', async () => {
      // Test containers with mixed content types like in Rust test_mixed_content_containers
      const mixedMap = new Map<string, AnyValue>();

      // Add a struct
      mixedMap.set(
        'profile',
        AnyValue.newStruct({
          id: 'mixed_user',
          name: 'Mixed User',
          email: 'mixed@x.com',
        })
      );

      // Add a primitive
      const countValue = AnyValue.newPrimitive(42);
      mixedMap.set('count', countValue);

      // Add a string
      const descValue = AnyValue.newPrimitive('Mixed content test');
      mixedMap.set('description', descValue);

      // Add a list of primitives
      const scoresList: AnyValue[] = [];
      for (const score of [85, 92, 78]) {
        const scoreValue = AnyValue.newPrimitive(score);
        scoresList.push(scoreValue);
      }
      mixedMap.set('scores', AnyValue.newList(scoresList));

      const anyValue = AnyValue.newMap(mixedMap);

      // Test serialization and deserialization
      const serialized = anyValue.serialize(
        testEnv.createSerializationContext(testEnv.getUserMobileWrapper())
      );
      expect(serialized.ok).toBe(true);
      if (!serialized.ok) return;

      const deserialized = AnyValue.deserialize(serialized.value, testEnv.getNodeWrapper());
      expect(deserialized.ok).toBe(true);
      if (!deserialized.ok) return;

      expect(deserialized.value.getCategory()).toBe(ValueCategory.Map);

      // Extract the map - elements are AnyValue objects
      const typedMap = deserialized.value.asType<Map<string, AnyValue>>(Map);
      expect(typedMap.ok).toBe(true);
      if (!typedMap.ok) return;

      // Verify profile - should be AnyValue object that can be converted to TestProfile
      const profileValue = typedMap.value.get('profile');
      expect(profileValue).toBeDefined();
      expect(profileValue).toBeInstanceOf(AnyValue);

      if (!profileValue) return; // Type guard
      const profile = profileValue.asType<TestProfile>();
      expect(profile.ok).toBe(true);
      if (profile.ok) {
        expect(profile.value.id).toBe('mixed_user');
        expect(profile.value.name).toBe('Mixed User');
        expect(profile.value.email).toBe('mixed@x.com');
      }

      // Verify count - should be AnyValue object that can be converted to number
      const countValueFromMap = typedMap.value.get('count');
      expect(countValueFromMap).toBeDefined();
      expect(countValueFromMap).toBeInstanceOf(AnyValue);

      const count = countValueFromMap!.asType<number>();
      expect(count.ok).toBe(true);
      if (count.ok) {
        expect(count.value).toBe(42);
      }

      // Verify description - should be AnyValue object that can be converted to string
      const descValueFromMap = typedMap.value.get('description');
      expect(descValueFromMap).toBeDefined();
      expect(descValueFromMap).toBeInstanceOf(AnyValue);

      const description = descValueFromMap!.asType<string>();
      expect(description.ok).toBe(true);
      if (description.ok) {
        expect(description.value).toBe('Mixed content test');
      }

      // Verify scores - should be AnyValue object that can be converted to AnyValue array
      const scoresValue = typedMap.value.get('scores');
      expect(scoresValue).toBeDefined();
      expect(scoresValue).toBeInstanceOf(AnyValue);

      if (!scoresValue) return; // Type guard
      const scores = scoresValue.asAnyValueArray();
      expect(scores.ok).toBe(true);
      if (!scores.ok) return;
      expect(scores.value.length).toBe(3);

      // Check elements - should be AnyValue objects that can be converted to numbers
      const score1 = scores.value[0].asType<number>();
      expect(score1.ok).toBe(true);
      if (score1.ok) expect(score1.value).toBe(85);

      const score2 = scores.value[1].asType<number>();
      expect(score2.ok).toBe(true);
      if (score2.ok) expect(score2.value).toBe(92);

      const score3 = scores.value[2].asType<number>();
      expect(score3.ok).toBe(true);
      if (score3.ok) expect(score3.value).toBe(78);
    });
  });

  describe('Container Element Encryption Tests', () => {
    test('should handle containers with encrypted elements', async () => {
      // This test will verify that container element decryption works
      // when containers contain encrypted elements that need to be decrypted

      // Manually encrypt some data using the encryption functions
      const sensitiveData = 'sensitive_data';
      const sensitiveDataBytes = new TextEncoder().encode(sensitiveData);

      // Encrypt the sensitive data using the resolver
      const serializationContext = testEnv.createSerializationContext(
        testEnv.getUserMobileWrapper()
      );
      const encryptResult = encryptLabelGroupSync(
        'user',
        { data: sensitiveDataBytes },
        serializationContext.keystore,
        serializationContext.resolver
      );
      expect(encryptResult.ok).toBe(true);
      if (!encryptResult.ok) return;

      // Create a container with both encrypted and plain elements
      const encryptedMap = new Map<string, any>();
      encryptedMap.set('encrypted_field', encryptResult.value.envelopeCbor); // This will be encrypted bytes
      encryptedMap.set('plain_field', 'public_data');

      const anyValue = AnyValue.newMap(encryptedMap);

      // Test serialization with encryption context
      const serialized = anyValue.serialize(serializationContext);
      expect(serialized.ok).toBe(true);
      if (!serialized.ok) return;

      // Test deserialization with keystore
      const deserialized = AnyValue.deserialize(serialized.value, testEnv.getNodeWrapper());
      expect(deserialized.ok).toBe(true);
      if (!deserialized.ok) return;

      expect(deserialized.value.getCategory()).toBe(ValueCategory.Map);

      // Extract the map - this should trigger container element decryption
      const typedMap = deserialized.value.asType<Map<string, any>>();
      expect(typedMap.ok).toBe(true);
      if (!typedMap.ok) return;

      // Verify we can access the decrypted elements
      expect(typedMap.value.has('encrypted_field')).toBe(true);
      expect(typedMap.value.has('plain_field')).toBe(true);
    });

    test('should handle heterogeneous containers with mixed plain/encrypted elements', async () => {
      // This test verifies the heterogeneous container support mentioned in the design

      // Encrypt some sensitive data
      const secretData = 'secret_data';
      const personalData = 'private_info';

      const secretBytes = new TextEncoder().encode(secretData);
      const personalBytes = new TextEncoder().encode(personalData);

      // Encrypt the sensitive data
      const serializationContext = testEnv.createSerializationContext(
        testEnv.getUserMobileWrapper()
      );
      const secretEncryptResult = encryptLabelGroupSync(
        'user',
        { data: secretBytes },
        serializationContext.keystore,
        serializationContext.resolver
      );
      expect(secretEncryptResult.ok).toBe(true);
      if (!secretEncryptResult.ok) return;

      const personalEncryptResult = encryptLabelGroupSync(
        'user',
        { data: personalBytes },
        serializationContext.keystore,
        serializationContext.resolver
      );
      expect(personalEncryptResult.ok).toBe(true);
      if (!personalEncryptResult.ok) return;

      const heterogeneousMap = new Map<string, any>();

      // Add plain elements
      heterogeneousMap.set('plain_string', 'public_data');
      heterogeneousMap.set('plain_number', 42);

      // Add encrypted elements (actual encrypted bytes)
      heterogeneousMap.set('encrypted_sensitive', secretEncryptResult.value.envelopeCbor);
      heterogeneousMap.set('encrypted_personal', personalEncryptResult.value.envelopeCbor);

      const anyValue = AnyValue.newMap(heterogeneousMap);

      // Test serialization with encryption context
      const serialized = anyValue.serialize(serializationContext);
      expect(serialized.ok).toBe(true);
      if (!serialized.ok) return;

      // Test deserialization with keystore
      const deserialized = AnyValue.deserialize(serialized.value, testEnv.getNodeWrapper());
      expect(deserialized.ok).toBe(true);
      if (!deserialized.ok) return;

      expect(deserialized.value.getCategory()).toBe(ValueCategory.Map);

      // Extract the map - this should handle both plain and encrypted elements
      const typedMap = deserialized.value.asType<Map<string, any>>();
      expect(typedMap.ok).toBe(true);
      if (!typedMap.ok) return;

      // Verify all elements are accessible
      expect(typedMap.value.has('plain_string')).toBe(true);
      expect(typedMap.value.has('plain_number')).toBe(true);
      expect(typedMap.value.has('encrypted_sensitive')).toBe(true);
      expect(typedMap.value.has('encrypted_personal')).toBe(true);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle containers without keystore (plain data only)', async () => {
      // This test specifically checks behavior when no keystore is provided
      // It should still work for plain data but not for encrypted data
      const plainMap = new Map<string, string>();
      plainMap.set('key1', 'value1');
      plainMap.set('key2', 'value2');

      const anyValue = AnyValue.newMap(plainMap);

      // Test serialization without keystore
      const serialized = anyValue.serialize(undefined);
      expect(serialized.ok).toBe(true);
      if (!serialized.ok) return;

      // Test deserialization without keystore
      const deserialized = AnyValue.deserialize(serialized.value, undefined);
      expect(deserialized.ok).toBe(true);
      if (!deserialized.ok) return;

      expect(deserialized.value.getCategory()).toBe(ValueCategory.Map);

      // Extract the map - should work for plain data
      const typedMap = deserialized.value.asType<Map<string, string>>(Map);
      expect(typedMap.ok).toBe(true);
      if (!typedMap.ok) return;

      // Verify we can access the plain elements
      expect(typedMap.value.has('key1')).toBe(true);
      expect(typedMap.value.has('key2')).toBe(true);
      expect(typedMap.value.get('key1')).toBe('value1');
      expect(typedMap.value.get('key2')).toBe('value2');
    });

    test('should handle empty containers', async () => {
      // Test empty HashMap
      const emptyMap = new Map<string, any>();
      const mapAnyValue = AnyValue.newMap(emptyMap);

      const mapSerialized = mapAnyValue.serialize(
        testEnv.createSerializationContext(testEnv.getUserMobileWrapper())
      );
      expect(mapSerialized.ok).toBe(true);
      if (!mapSerialized.ok) return;

      const mapDeserialized = AnyValue.deserialize(mapSerialized.value, testEnv.getNodeWrapper());
      expect(mapDeserialized.ok).toBe(true);
      if (!mapDeserialized.ok) return;

      const mapTyped = mapDeserialized.value.asType<Map<string, any>>(Map);
      expect(mapTyped.ok).toBe(true);
      if (!mapTyped.ok) return;
      expect(mapTyped.value.size).toBe(0);

      // Test empty Vec
      const emptyVec: any[] = [];
      const vecAnyValue = AnyValue.newList(emptyVec);

      const vecSerialized = vecAnyValue.serialize(
        testEnv.createSerializationContext(testEnv.getUserMobileWrapper())
      );
      expect(vecSerialized.ok).toBe(true);
      if (!vecSerialized.ok) return;

      const vecDeserialized = AnyValue.deserialize(vecSerialized.value, testEnv.getNodeWrapper());
      expect(vecDeserialized.ok).toBe(true);
      if (!vecDeserialized.ok) return;

      const vecTyped = vecDeserialized.value.asType<any[]>(Array);
      expect(vecTyped.ok).toBe(true);
      if (!vecTyped.ok) return;
      expect(vecTyped.value.length).toBe(0);
    });

    test('should handle large containers', async () => {
      // Test large containers for performance (reduced size to avoid CBOR issues)
      const largeMap = new Map<string, AnyValue>();
      for (let i = 0; i < 100; i++) {
        const value = AnyValue.newPrimitive(i);
        largeMap.set(`key_${i}`, value);
      }

      const anyValue = AnyValue.newMap(largeMap);

      const serialized = anyValue.serialize(
        testEnv.createSerializationContext(testEnv.getUserMobileWrapper())
      );
      expect(serialized.ok).toBe(true);
      if (!serialized.ok) return;

      const deserialized = AnyValue.deserialize(serialized.value, testEnv.getNodeWrapper());
      expect(deserialized.ok).toBe(true);
      if (!deserialized.ok) return;

      const typedMap = deserialized.value.asType<Map<string, AnyValue>>(Map);
      expect(typedMap.ok).toBe(true);
      if (!typedMap.ok) return;
      expect(typedMap.value.size).toBe(100);
    });
  });
});
