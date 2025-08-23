/**
 * TypeScript Serializer Test Vectors
 *
 * This generates test vectors compatible with the Rust serializer_vectors.rs
 * to ensure cross-language serialization compatibility.
 */

import { AnyValue } from './index.js';
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

  // Heterogeneous list - use JSON for mixed types
  const listAny = AnyValue.newJson([1, 'two']);
  serializeAndWrite(out, 'list_any.bin', listAny);

  // For heterogeneous map, use JSON for mixed types
  const mapAny = AnyValue.newJson({
    x: 10,
    y: 'ten',
  });
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

  console.log('TypeScript serializer vectors written successfully');
}

export { main as generateSerializerVectors };
