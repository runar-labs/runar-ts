// Debug script to analyze Rust CBOR structure
const fs = require('fs');

const rustList = fs.readFileSync('/home/rafael/Development/runar-rust/target/serializer-vectors/list_any.bin');

function getDataBytes(bytes) {
  const typeNameLen = bytes[2];
  const headerSize = 1 + 1 + 1 + typeNameLen;
  return bytes.subarray(headerSize);
}

const rustData = getDataBytes(rustList);

console.log('=== RUST LIST CBOR ANALYSIS ===');
console.log('Data bytes:', Array.from(rustData));

// Manual CBOR decoding
let pos = 0;

// Should be CBOR array of length 2
if (rustData[pos] === 0x82) {
  console.log('CBOR array of length 2');
  pos++;

  // First element: CBOR map of length 3 (AnyValue for i64)
  if (rustData[pos] === 0xA3) {
    console.log('First element: AnyValue map of length 3');
    pos++;

    // Parse the map fields
    for (let field = 0; field < 3; field++) {
      // Look for field keys
      if (rustData[pos] === 0x68) { // "category" (8 chars)
        pos++;
        const keyBytes = rustData.slice(pos, pos + 8);
        pos += 8;
        console.log(`  Field ${field + 1} key: "${new TextDecoder().decode(keyBytes)}"`);

        // Value should be integer 1
        console.log(`  Field ${field + 1} value: ${rustData[pos]} (integer)`);
        pos++;
      } else if (rustData[pos] === 0x67) { // "typename" (7 chars)
        pos++;
        const keyBytes = rustData.slice(pos, pos + 7);
        pos += 7;
        console.log(`  Field ${field + 1} key: "${new TextDecoder().decode(keyBytes)}"`);

        // Value should be "i64" (3-char string)
        if (rustData[pos] === 0x63) { // 3-char string
          pos++;
          const valBytes = rustData.slice(pos, pos + 3);
          pos += 3;
          console.log(`  Field ${field + 1} value: "${new TextDecoder().decode(valBytes)}" (string)`);
        }
      } else if (rustData[pos] === 0x65) { // "value" (5 chars)
        pos++;
        const keyBytes = rustData.slice(pos, pos + 5);
        pos += 5;
        console.log(`  Field ${field + 1} key: "${new TextDecoder().decode(keyBytes)}"`);

        // Value for i64 should be [1]
        if (rustData[pos] === 0x81) { // Array of length 1
          pos++;
          console.log(`  Field ${field + 1} value: [${rustData[pos]}] (array)`);
          pos++;
        }
      }
    }
  }

  console.log(`Final position: ${pos}, remaining bytes: ${rustData.length - pos}`);
}
