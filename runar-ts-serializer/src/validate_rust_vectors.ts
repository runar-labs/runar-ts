/**
 * TypeScript Serializer Validation Tool
 *
 * This validates TypeScript serialization against Rust test vectors
 * to ensure cross-language compatibility.
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

function readBytes(filePath: string): Uint8Array {
  return fs.readFileSync(filePath);
}

function validatePrimitiveString(): boolean {
  console.log('🔍 Validating primitive string...');
  try {
    const rustData = readBytes(
      '/home/rafael/Development/runar-rust/target/serializer-vectors/prim_string.bin'
    );
    const tsData = readBytes(
      '/home/rafael/Development/runar-ts/target/serializer-vectors-ts/prim_string.bin'
    );

    // Test that Rust data can be deserialized by TypeScript
    const rustValue = AnyValue.deserialize(rustData, undefined);
    if (!rustValue.ok) {
      console.log(`❌ Failed to deserialize Rust string data: ${rustValue.error}`);
      return false;
    }

    // Test that TypeScript data can be deserialized
    const tsValue = AnyValue.deserialize(tsData, undefined);
    if (!tsValue.ok) {
      console.log(`❌ Failed to deserialize TypeScript string data: ${tsValue.error}`);
      return false;
    }

    // Compare values
    const rustStr = rustValue.value.as<string>();
    const tsStr = tsValue.value.as<string>();

    if (!rustStr.ok || !tsStr.ok) {
      console.log('❌ Failed to extract string values');
      return false;
    }

    if (rustStr.value !== tsStr.value) {
      console.log(`❌ Values don't match: Rust="${rustStr.value}", TS="${tsStr.value}"`);
      return false;
    }

    console.log(`✅ String validation passed: "${rustStr.value}"`);
    return true;
  } catch (error) {
    console.log(`❌ String validation failed: ${error}`);
    return false;
  }
}

function validatePrimitiveBool(): boolean {
  console.log('🔍 Validating primitive bool...');
  try {
    const rustData = readBytes(
      '/home/rafael/Development/runar-rust/target/serializer-vectors/prim_bool.bin'
    );
    const tsData = readBytes(
      '/home/rafael/Development/runar-ts/target/serializer-vectors-ts/prim_bool.bin'
    );

    const rustValue = AnyValue.deserialize(rustData, undefined);
    const tsValue = AnyValue.deserialize(tsData, undefined);

    if (!rustValue.ok || !tsValue.ok) {
      console.log('❌ Failed to deserialize bool data');
      return false;
    }

    const rustBool = rustValue.value.as<boolean>();
    const tsBool = tsValue.value.as<boolean>();

    if (!rustBool.ok || !tsBool.ok) {
      console.log('❌ Failed to extract bool values');
      return false;
    }

    if (rustBool.value !== tsBool.value) {
      console.log(`❌ Values don't match: Rust=${rustBool.value}, TS=${tsBool.value}`);
      return false;
    }

    console.log(`✅ Bool validation passed: ${rustBool.value}`);
    return true;
  } catch (error) {
    console.log(`❌ Bool validation failed: ${error}`);
    return false;
  }
}

function validatePrimitiveI64(): boolean {
  console.log('🔍 Validating primitive i64...');
  try {
    const rustData = readBytes(
      '/home/rafael/Development/runar-rust/target/serializer-vectors/prim_i64.bin'
    );
    const tsData = readBytes(
      '/home/rafael/Development/runar-ts/target/serializer-vectors-ts/prim_i64.bin'
    );

    const rustValue = AnyValue.deserialize(rustData, undefined);
    const tsValue = AnyValue.deserialize(tsData, undefined);

    if (!rustValue.ok || !tsValue.ok) {
      console.log('❌ Failed to deserialize i64 data');
      return false;
    }

    const rustNum = rustValue.value.as<number>();
    const tsNum = tsValue.value.as<number>();

    if (!rustNum.ok || !tsNum.ok) {
      console.log('❌ Failed to extract number values');
      return false;
    }

    if (rustNum.value !== tsNum.value) {
      console.log(`❌ Values don't match: Rust=${rustNum.value}, TS=${tsNum.value}`);
      return false;
    }

    console.log(`✅ i64 validation passed: ${rustNum.value}`);
    return true;
  } catch (error) {
    console.log(`❌ i64 validation failed: ${error}`);
    return false;
  }
}

function validatePrimitiveU64(): boolean {
  console.log('🔍 Validating primitive u64...');
  try {
    const rustData = readBytes(
      '/home/rafael/Development/runar-rust/target/serializer-vectors/prim_u64.bin'
    );
    const tsData = readBytes(
      '/home/rafael/Development/runar-ts/target/serializer-vectors-ts/prim_u64.bin'
    );

    const rustValue = AnyValue.deserialize(rustData, undefined);
    const tsValue = AnyValue.deserialize(tsData, undefined);

    if (!rustValue.ok || !tsValue.ok) {
      console.log('❌ Failed to deserialize u64 data');
      return false;
    }

    const rustNum = rustValue.value.as<number>();
    const tsNum = tsValue.value.as<number>();

    if (!rustNum.ok || !tsNum.ok) {
      console.log('❌ Failed to extract number values');
      return false;
    }

    if (rustNum.value !== tsNum.value) {
      console.log(`❌ Values don't match: Rust=${rustNum.value}, TS=${tsNum.value}`);
      return false;
    }

    console.log(`✅ u64 validation passed: ${rustNum.value}`);
    return true;
  } catch (error) {
    console.log(`❌ u64 validation failed: ${error}`);
    return false;
  }
}

function validateBytes(): boolean {
  console.log('🔍 Validating bytes...');
  try {
    const rustData = readBytes(
      '/home/rafael/Development/runar-rust/target/serializer-vectors/bytes.bin'
    );
    const tsData = readBytes(
      '/home/rafael/Development/runar-ts/target/serializer-vectors-ts/bytes.bin'
    );

    const rustValue = AnyValue.deserialize(rustData, undefined);
    const tsValue = AnyValue.deserialize(tsData, undefined);

    if (!rustValue.ok || !tsValue.ok) {
      console.log('❌ Failed to deserialize bytes data');
      return false;
    }

    const rustBytes = rustValue.value.as<Uint8Array>();
    const tsBytes = tsValue.value.as<Uint8Array>();

    if (!rustBytes.ok || !tsBytes.ok) {
      console.log('❌ Failed to extract bytes values');
      return false;
    }

    if (rustBytes.value.length !== tsBytes.value.length) {
      console.log(
        `❌ Lengths don't match: Rust=${rustBytes.value.length}, TS=${tsBytes.value.length}`
      );
      return false;
    }

    for (let i = 0; i < rustBytes.value.length; i++) {
      if (rustBytes.value[i] !== tsBytes.value[i]) {
        console.log(
          `❌ Bytes don't match at index ${i}: Rust=${rustBytes.value[i]}, TS=${tsBytes.value[i]}`
        );
        return false;
      }
    }

    console.log(`✅ Bytes validation passed: [${Array.from(rustBytes.value).join(', ')}]`);
    return true;
  } catch (error) {
    console.log(`❌ Bytes validation failed: ${error}`);
    return false;
  }
}

function validateJson(): boolean {
  console.log('🔍 Validating JSON...');
  try {
    const rustData = readBytes(
      '/home/rafael/Development/runar-rust/target/serializer-vectors/json.bin'
    );
    const tsData = readBytes(
      '/home/rafael/Development/runar-ts/target/serializer-vectors-ts/json.bin'
    );

    const rustValue = AnyValue.deserialize(rustData, undefined);
    const tsValue = AnyValue.deserialize(tsData, undefined);

    if (!rustValue.ok || !tsValue.ok) {
      console.log('❌ Failed to deserialize JSON data');
      return false;
    }

    const rustJson = rustValue.value.as<any>();
    const tsJson = tsValue.value.as<any>();

    if (!rustJson.ok || !tsJson.ok) {
      console.log('❌ Failed to extract JSON values');
      return false;
    }

    // Compare JSON objects
    if (JSON.stringify(rustJson.value) !== JSON.stringify(tsJson.value)) {
      console.log(
        `❌ JSON doesn't match: Rust=${JSON.stringify(rustJson.value)}, TS=${JSON.stringify(tsJson.value)}`
      );
      return false;
    }

    console.log(`✅ JSON validation passed: ${JSON.stringify(rustJson.value)}`);
    return true;
  } catch (error) {
    console.log(`❌ JSON validation failed: ${error}`);
    return false;
  }
}

function validateListAny(): boolean {
  console.log('🔍 Validating heterogeneous list...');
  try {
    const rustData = readBytes(
      '/home/rafael/Development/runar-rust/target/serializer-vectors/list_any.bin'
    );
    const tsData = readBytes(
      '/home/rafael/Development/runar-ts/target/serializer-vectors-ts/list_any.bin'
    );

    const rustValue = AnyValue.deserialize(rustData, undefined);
    const tsValue = AnyValue.deserialize(tsData, undefined);

    if (!rustValue.ok || !tsValue.ok) {
      console.log('❌ Failed to deserialize list data');
      return false;
    }

    const rustList = rustValue.value.as<any[]>();
    const tsList = tsValue.value.as<any[]>();

    if (!rustList.ok || !tsList.ok) {
      console.log('❌ Failed to extract list values');
      return false;
    }

    if (rustList.value.length !== tsList.value.length) {
      console.log(
        `❌ List lengths don't match: Rust=${rustList.value.length}, TS=${tsList.value.length}`
      );
      return false;
    }

    for (let i = 0; i < rustList.value.length; i++) {
      if (JSON.stringify(rustList.value[i]) !== JSON.stringify(tsList.value[i])) {
        console.log(
          `❌ List elements don't match at index ${i}: Rust=${JSON.stringify(rustList.value[i])}, TS=${JSON.stringify(tsList.value[i])}`
        );
        return false;
      }
    }

    console.log(
      `✅ Heterogeneous list validation passed: [${rustList.value.map(v => JSON.stringify(v)).join(', ')}]`
    );
    return true;
  } catch (error) {
    console.log(`❌ Heterogeneous list validation failed: ${error}`);
    return false;
  }
}

function validateMapAny(): boolean {
  console.log('🔍 Validating heterogeneous map...');
  try {
    const rustData = readBytes(
      '/home/rafael/Development/runar-rust/target/serializer-vectors/map_any.bin'
    );
    const tsData = readBytes(
      '/home/rafael/Development/runar-ts/target/serializer-vectors-ts/map_any.bin'
    );

    const rustValue = AnyValue.deserialize(rustData, undefined);
    const tsValue = AnyValue.deserialize(tsData, undefined);

    if (!rustValue.ok || !tsValue.ok) {
      console.log('❌ Failed to deserialize map data');
      return false;
    }

    const rustMap = rustValue.value.as<any>();
    const tsMap = tsValue.value.as<any>();

    if (!rustMap.ok || !tsMap.ok) {
      console.log('❌ Failed to extract map values');
      return false;
    }

    if (JSON.stringify(rustMap.value) !== JSON.stringify(tsMap.value)) {
      console.log(
        `❌ Maps don't match: Rust=${JSON.stringify(rustMap.value)}, TS=${JSON.stringify(tsMap.value)}`
      );
      return false;
    }

    console.log(`✅ Heterogeneous map validation passed: ${JSON.stringify(rustMap.value)}`);
    return true;
  } catch (error) {
    console.log(`❌ Heterogeneous map validation failed: ${error}`);
    return false;
  }
}

function validateListI64(): boolean {
  console.log('🔍 Validating typed i64 list...');
  try {
    const rustData = readBytes(
      '/home/rafael/Development/runar-rust/target/serializer-vectors/list_i64.bin'
    );
    const tsData = readBytes(
      '/home/rafael/Development/runar-ts/target/serializer-vectors-ts/list_i64.bin'
    );

    const rustValue = AnyValue.deserialize(rustData, undefined);
    const tsValue = AnyValue.deserialize(tsData, undefined);

    if (!rustValue.ok || !tsValue.ok) {
      console.log('❌ Failed to deserialize i64 list data');
      return false;
    }

    const rustList = rustValue.value.as<number[]>();
    const tsList = tsValue.value.as<number[]>();

    if (!rustList.ok || !tsList.ok) {
      console.log('❌ Failed to extract i64 list values');
      return false;
    }

    if (rustList.value.length !== tsList.value.length) {
      console.log(
        `❌ i64 list lengths don't match: Rust=${rustList.value.length}, TS=${tsList.value.length}`
      );
      return false;
    }

    for (let i = 0; i < rustList.value.length; i++) {
      if (rustList.value[i] !== tsList.value[i]) {
        console.log(
          `❌ i64 list elements don't match at index ${i}: Rust=${rustList.value[i]}, TS=${tsList.value[i]}`
        );
        return false;
      }
    }

    console.log(`✅ Typed i64 list validation passed: [${rustList.value.join(', ')}]`);
    return true;
  } catch (error) {
    console.log(`❌ Typed i64 list validation failed: ${error}`);
    return false;
  }
}

function validateMapStringI64(): boolean {
  console.log('🔍 Validating typed string->i64 map...');
  try {
    const rustData = readBytes(
      '/home/rafael/Development/runar-rust/target/serializer-vectors/map_string_i64.bin'
    );
    const tsData = readBytes(
      '/home/rafael/Development/runar-ts/target/serializer-vectors-ts/map_string_i64.bin'
    );

    const rustValue = AnyValue.deserialize(rustData, undefined);
    const tsValue = AnyValue.deserialize(tsData, undefined);

    if (!rustValue.ok || !tsValue.ok) {
      console.log('❌ Failed to deserialize string->i64 map data');
      return false;
    }

    const rustMap = rustValue.value.as<any>();
    const tsMap = tsValue.value.as<any>();

    if (!rustMap.ok || !tsMap.ok) {
      console.log('❌ Failed to extract string->i64 map values');
      return false;
    }

    if (JSON.stringify(rustMap.value) !== JSON.stringify(tsMap.value)) {
      console.log(
        `❌ String->i64 maps don't match: Rust=${JSON.stringify(rustMap.value)}, TS=${JSON.stringify(tsMap.value)}`
      );
      return false;
    }

    console.log(`✅ Typed string->i64 map validation passed: ${JSON.stringify(rustMap.value)}`);
    return true;
  } catch (error) {
    console.log(`❌ Typed string->i64 map validation failed: ${error}`);
    return false;
  }
}

function validateStructPlain(): boolean {
  console.log('🔍 Validating plain struct...');
  try {
    const rustData = readBytes(
      '/home/rafael/Development/runar-rust/target/serializer-vectors/struct_plain.bin'
    );
    const tsData = readBytes(
      '/home/rafael/Development/runar-ts/target/serializer-vectors-ts/struct_plain.bin'
    );

    const rustValue = AnyValue.deserialize(rustData, undefined);
    const tsValue = AnyValue.deserialize(tsData, undefined);

    if (!rustValue.ok || !tsValue.ok) {
      console.log('❌ Failed to deserialize struct data');
      return false;
    }

    const rustStruct = rustValue.value.as<PlainUser>();
    const tsStruct = tsValue.value.as<PlainUser>();

    if (!rustStruct.ok || !tsStruct.ok) {
      console.log('❌ Failed to extract struct values');
      return false;
    }

    if (
      rustStruct.value.id !== tsStruct.value.id ||
      rustStruct.value.name !== tsStruct.value.name
    ) {
      console.log(
        `❌ Structs don't match: Rust={id: "${rustStruct.value.id}", name: "${rustStruct.value.name}"}, TS={id: "${tsStruct.value.id}", name: "${tsStruct.value.name}"}`
      );
      return false;
    }

    console.log(
      `✅ Plain struct validation passed: {id: "${rustStruct.value.id}", name: "${rustStruct.value.name}"}`
    );
    return true;
  } catch (error) {
    console.log(`❌ Plain struct validation failed: ${error}`);
    return false;
  }
}

function checkDirectoriesExist(): boolean {
  const rustDir = '/home/rafael/Development/runar-rust/target/serializer-vectors';
  const tsDir = '/home/rafael/Development/runar-ts/target/serializer-vectors-ts';

  if (!fs.existsSync(rustDir)) {
    console.log(`❌ Rust test vectors directory not found: ${rustDir}`);
    console.log('   Run Rust serializer_vectors first');
    return false;
  }

  if (!fs.existsSync(tsDir)) {
    console.log(`❌ TypeScript test vectors directory not found: ${tsDir}`);
    console.log('   Run TypeScript serializer_vectors first');
    return false;
  }

  console.log('📁 Found test vector directories:');
  console.log(`   Rust: ${rustDir}`);
  console.log(`   TypeScript:  ${tsDir}`);

  return true;
}

function main(): void {
  console.log('🔬 Cross-Language Serializer Validation');
  console.log('=====================================');

  if (!checkDirectoriesExist()) {
    process.exit(1);
  }

  console.log('\n🚀 Running validation tests...');

  const tests = [
    validatePrimitiveString,
    validatePrimitiveBool,
    validatePrimitiveI64,
    validatePrimitiveU64,
    validateBytes,
    validateJson,
    validateListAny,
    validateMapAny,
    validateListI64,
    validateMapStringI64,
    validateStructPlain,
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    if (test()) {
      passed++;
    } else {
      failed++;
    }
  }

  console.log('\n📊 Validation Results');
  console.log('===================');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

  if (failed === 0) {
    console.log('\n🎉 All validations passed! TypeScript and Rust serializers are compatible!');
  } else {
    console.log('\n⚠️  Some validations failed. Check the output above for details.');
    process.exit(1);
  }
}

// Run if this file is executed directly
main();

export { main as validateRustVectors };
