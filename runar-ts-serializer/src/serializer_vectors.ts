/**
 * TypeScript Serializer Test Vectors
 *
 * This generates test vectors compatible with the Rust serializer_vectors.rs
 * to ensure cross-language serialization compatibility.
 */

import { AnyValue } from './index.js';
import { encode } from 'cbor-x';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface PlainUser {
  id: string;
  name: string;
}

interface TestProfile {
  id: string;
  secret: string;
}

function writeBytes(outputDir: string, name: string, bytes: Uint8Array): void {
  const filePath = path.join(outputDir, name);
  fs.writeFileSync(filePath, bytes);
}

function serializeAndWrite(outputDir: string, name: string, anyValue: any): void {
  const result = anyValue.serialize();
  if (!result.ok) {
    throw new Error(`Failed to serialize ${name}: ${result.error}`);
  }
  writeBytes(outputDir, name, result.value);
}

function main(): void {
  // Output directory
  const out = path.join(__dirname, '../../target/serializer-vectors-ts');
  if (!fs.existsSync(out)) {
    fs.mkdirSync(out, { recursive: true });
  }

  console.log(`Writing TypeScript serializer vectors to ${out}`);

  // Primitives
  serializeAndWrite(out, 'prim_string.bin', AnyValue.newPrimitive('hello'));
  serializeAndWrite(out, 'prim_bool.bin', AnyValue.newPrimitive(true));
  serializeAndWrite(out, 'prim_i64.bin', AnyValue.newPrimitive(42));
  serializeAndWrite(out, 'prim_u64.bin', AnyValue.newPrimitive(7));

  // Bytes
  serializeAndWrite(out, 'bytes.bin', AnyValue.newBytes(new Uint8Array([1, 2, 3])));

  // JSON
  const json = { a: 1, b: [true, 'x'] };
  serializeAndWrite(out, 'json.bin', AnyValue.newJson(json));

  // Heterogeneous list - use binary serialization for mixed types
  const listAny = AnyValue.newList([AnyValue.newPrimitive(1), AnyValue.newPrimitive('two')]);
  serializeAndWrite(out, 'list_any.bin', listAny);

  // Heterogeneous map - use binary serialization for mixed types
  const mapAny = AnyValue.newMap(
    new Map<string, AnyValue<any>>([
      ['x', AnyValue.newPrimitive(10)],
      ['y', AnyValue.newPrimitive('ten')],
    ])
  );
  serializeAndWrite(out, 'map_any.bin', mapAny);

  // Typed containers (no element encryption)
  const listTyped = AnyValue.newList([1, 2, 3]);
  serializeAndWrite(out, 'list_i64.bin', listTyped);

  const mapTyped = AnyValue.newMap(
    new Map([
      ['a', 1],
      ['b', 2],
    ])
  );
  serializeAndWrite(out, 'map_string_i64.bin', mapTyped);

  // Struct plain
  const user: PlainUser = {
    id: 'u1',
    name: 'Alice',
  };
  const avUser = AnyValue.newStruct(user);
  serializeAndWrite(out, 'struct_plain.bin', avUser);

  // === COMPREHENSIVE TEST SCENARIOS ===

  // 1. BIGGER LISTS AND MAPS
  console.log('Generating comprehensive test scenarios...');

  // Large list with many elements
  const largeList = AnyValue.newList(Array.from({ length: 100 }, (_, i) => i + 1));
  serializeAndWrite(out, 'list_large.bin', largeList);

  // Large map with many key-value pairs
  const largeMap = new Map<string, number>();
  for (let i = 0; i < 50; i++) {
    largeMap.set(`key${i}`, i * 2);
  }
  serializeAndWrite(out, 'map_large.bin', AnyValue.newMap(largeMap));

  // 2. NESTED STRUCTURES - List of Maps
  const listOfMaps = AnyValue.newList([
    AnyValue.newMap(
      new Map<string, any>([
        ['name', 'Alice'],
        ['age', 30],
      ])
    ),
    AnyValue.newMap(
      new Map<string, any>([
        ['name', 'Bob'],
        ['age', 25],
      ])
    ),
    AnyValue.newMap(
      new Map<string, any>([
        ['name', 'Charlie'],
        ['age', 35],
      ])
    ),
  ]);
  serializeAndWrite(out, 'list_of_maps.bin', listOfMaps);

  // 3. NESTED STRUCTURES - Map with Lists as Values
  const mapWithLists = AnyValue.newMap(
    new Map<string, AnyValue<any>>([
      ['numbers', AnyValue.newList([1, 2, 3, 4, 5])],
      ['strings', AnyValue.newList(['hello', 'world', 'test'])],
      ['booleans', AnyValue.newList([true, false, true])],
      ['mixed', AnyValue.newList([42, 'text', true, 'null'])],
    ])
  );
  serializeAndWrite(out, 'map_with_lists.bin', mapWithLists);

  // 4. COMPLEX NESTED COMBINATIONS
  // Map containing lists of maps
  const user1Profile = AnyValue.newMap(
    new Map<string, AnyValue>([
      ['verified', AnyValue.newPrimitive(true)],
      ['premium', AnyValue.newPrimitive(false)],
    ])
  );
  const user1Map = AnyValue.newMap(
    new Map<string, AnyValue>([
      ['id', AnyValue.newPrimitive(1)],
      ['profile', user1Profile],
    ])
  );

  const user2Profile = AnyValue.newMap(
    new Map<string, AnyValue>([
      ['verified', AnyValue.newPrimitive(false)],
      ['premium', AnyValue.newPrimitive(true)],
    ])
  );
  const user2Map = AnyValue.newMap(
    new Map<string, AnyValue>([
      ['id', AnyValue.newPrimitive(2)],
      ['profile', user2Profile],
    ])
  );

  const usersList = AnyValue.newList([user1Map, user2Map]);

  const featuresList = AnyValue.newList(['auth', 'profile', 'settings']);
  const metadataMap = AnyValue.newMap(
    new Map<string, AnyValue>([
      ['version', AnyValue.newPrimitive('1.0')],
      ['features', featuresList],
    ])
  );

  const complexNested = AnyValue.newMap(
    new Map<string, AnyValue<any>>([
      ['users', usersList],
      ['metadata', metadataMap],
    ])
  );
  serializeAndWrite(out, 'complex_nested.bin', complexNested);

  // 5. EDGE CASES - Empty Collections
  serializeAndWrite(out, 'list_empty.bin', AnyValue.newList([]));
  serializeAndWrite(out, 'map_empty.bin', AnyValue.newMap(new Map()));

  // 6. EDGE CASES - Single Element Collections
  serializeAndWrite(out, 'list_single.bin', AnyValue.newList([42]));
  serializeAndWrite(out, 'map_single.bin', AnyValue.newMap(new Map([['key', 'value']])));

  // 7. DEEP NESTING - Multiple Levels
  const level4Map = new Map<string, any>([['level4', 'deepest value']]);
  const level3List = AnyValue.newList([AnyValue.newMap(level4Map)]);
  const level3Map = new Map<string, any>([['level3', level3List]]);
  const level2List = AnyValue.newList([AnyValue.newMap(level3Map)]);
  const level2Map = new Map<string, any>([['level2', level2List]]);
  const level1List = AnyValue.newList([AnyValue.newMap(level2Map)]);
  const level1Map = new Map<string, any>([['level1', level1List]]);

  const deepNesting = AnyValue.newList([AnyValue.newMap(level1Map)]);
  serializeAndWrite(out, 'deep_nesting.bin', deepNesting);

  // 8. LARGE DATA - Big Strings and Numbers
  const largeString = 'x'.repeat(1000); // 1KB string
  serializeAndWrite(out, 'large_string.bin', AnyValue.newPrimitive(largeString));

  const bigNumber = Number.MAX_SAFE_INTEGER;
  serializeAndWrite(out, 'big_number.bin', AnyValue.newPrimitive(bigNumber));

  // 9. MIXED TYPE COMPLEXITY
  const mixedComplexity = AnyValue.newMap(
    new Map<string, AnyValue<any>>([
      [
        'primitives',
        AnyValue.newList([
          AnyValue.newPrimitive(42),
          AnyValue.newPrimitive('string'),
          AnyValue.newPrimitive(true),
          AnyValue.newPrimitive(3.14),
          AnyValue.newPrimitive(null),
        ]),
      ],
      ['bytes', AnyValue.newBytes(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))],
      ['json', AnyValue.newJson({ complex: { nested: { object: [1, 2, 3] } } })],
      ['struct', AnyValue.newStruct({ id: 'test', data: [1, 2, 3] })],
    ])
  );
  serializeAndWrite(out, 'mixed_complexity.bin', mixedComplexity);

  // 10. RECURSIVE STRUCTURES
  interface UserWithFriends {
    id: string;
    name: string;
    friends?: AnyValue<any>[];
  }

  const friendUser1: UserWithFriends = { id: '1', name: 'Alice' };
  const friendUser2: UserWithFriends = { id: '2', name: 'Bob' };
  const friendUser3: UserWithFriends = { id: '3', name: 'Charlie' };

  const recursiveUsers = AnyValue.newList([
    AnyValue.newStruct(friendUser1),
    AnyValue.newStruct(friendUser2),
    AnyValue.newStruct(friendUser3),
  ]);
  serializeAndWrite(out, 'recursive_structs.bin', recursiveUsers);

  // 11. HETEROGENEOUS COLLECTIONS WITH ALL TYPES
  const allTypesList = AnyValue.newList([
    AnyValue.newPrimitive(42), // integer
    AnyValue.newPrimitive('string'), // string
    AnyValue.newPrimitive(true), // boolean
    AnyValue.newPrimitive(3.14159), // float
    AnyValue.newPrimitive(null), // null
    AnyValue.newBytes(new Uint8Array([1, 2, 3])), // bytes
    AnyValue.newJson({ key: 'value' }), // json
    AnyValue.newStruct({ id: 'test' }), // struct
    AnyValue.newList([1, 2, 3]), // nested list
    AnyValue.newMap(new Map([['k', 'v']])), // nested map
  ]);
  serializeAndWrite(out, 'all_types_list.bin', allTypesList);

  // 12. MAP WITH COMPLEX KEYS AND VALUES
  const complexMap = AnyValue.newMap(
    new Map<string, AnyValue<any>>([
      ['simple_string', AnyValue.newPrimitive('value')],
      ['simple_number', AnyValue.newPrimitive(123)],
      ['nested_list', AnyValue.newList([AnyValue.newMap(new Map([['inner', 'data']]))])],
      [
        'nested_map',
        AnyValue.newMap(
          new Map([
            ['level1', AnyValue.newMap(new Map([['level2', AnyValue.newPrimitive('deep')]]))],
          ])
        ),
      ],
      [
        'mixed_array',
        AnyValue.newList(['string', 42, true, 'null', AnyValue.newPrimitive('nested')]),
      ],
    ])
  );
  serializeAndWrite(out, 'complex_map.bin', complexMap);

  // 13. PERFORMANCE TEST - Very Large Collections
  const veryLargeList = AnyValue.newList(Array.from({ length: 1000 }, (_, i) => i));
  serializeAndWrite(out, 'very_large_list.bin', veryLargeList);

  const veryLargeMap = new Map<string, number>();
  for (let i = 0; i < 500; i++) {
    veryLargeMap.set(`key_${i}`, i);
  }
  serializeAndWrite(out, 'very_large_map.bin', AnyValue.newMap(veryLargeMap));

  // 14. NULL AND UNDEFINED HANDLING
  serializeAndWrite(out, 'null_value.bin', AnyValue.newPrimitive(null));
  serializeAndWrite(out, 'undefined_like.bin', AnyValue.newPrimitive(undefined));

  // 15. SPECIAL CHARACTERS AND UNICODE
  const unicodeString = 'Hello 世界 🌍 Test: áéíóú ñ';
  serializeAndWrite(out, 'unicode_string.bin', AnyValue.newPrimitive(unicodeString));

  const specialChars = new Map<string, string>([
    ['normal', 'value'],
    ['with spaces', 'spaced value'],
    ['with-dashes', 'dashed-value'],
    ['with_underscores', 'underscore_value'],
    ['with.dots', 'dotted.value'],
    ['with/slashes', 'slashed/value'],
    ['with\\backslashes', 'backslashed\\value'],
  ]);
  serializeAndWrite(out, 'special_chars_map.bin', AnyValue.newMap(specialChars));

  console.log('TypeScript serializer vectors written successfully');
}

export { main as generateSerializerVectors };
