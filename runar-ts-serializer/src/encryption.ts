import { Result, ok, err } from './result.js';
import { LabelResolver } from './label_resolver.js';
import type { CommonKeysInterface } from './wire.js';
import { encode, decode } from 'cbor-x';

// ---------------------------------------------------------------------------
// Envelope Encryption Types
// ---------------------------------------------------------------------------

/**
 * Container for label-grouped encryption (one per label)
 */
export class EncryptedLabelGroup {
  constructor(
    /** The label this group was encrypted with */
    public label: string,
    /** Original CBOR bytes from native API */
    public envelopeCbor: Uint8Array
  ) {}
}

// ---------------------------------------------------------------------------
// Synchronous Envelope Encryption Functions
// ---------------------------------------------------------------------------

/**
 * Encrypt a group of fields that share the same label (synchronous)
 */
export function encryptLabelGroupSync<T>(
  label: string,
  fieldsStruct: T,
  keystore: CommonKeysInterface,
  resolver: LabelResolver
): Result<EncryptedLabelGroup> {
  try {
    // Serialize the fields within this label group using CBOR
    const plainBytes = encode(fieldsStruct);

    // Resolve the label to key info (public key + scope)
    const infoResult = resolver.resolveLabelInfo(label);
    if (!infoResult.ok) {
      return err(
        new Error(`Failed to resolve label info for '${label}': ${infoResult.error.message}`)
      );
    }

    const info = infoResult.value;
    if (!info) {
      return err(new Error(`Label not found`));
    }

    // Convert to Uint8Array for native API
    const dataBuffer = new Uint8Array(plainBytes);
    const networkPublicKey = info.networkPublicKey || null; // Already Uint8Array type
    const profileKeys = info.profilePublicKeys; // Already Uint8Array[] type

    // Encrypt using envelope encryption (synchronous)
    // The native API returns CBOR-encoded bytes directly
    const encryptedBytes = keystore.encryptWithEnvelope(dataBuffer, networkPublicKey, profileKeys);

    // Store the original CBOR bytes from native API
    return ok(new EncryptedLabelGroup(label, encryptedBytes));
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Attempt to decrypt a label group back into its original struct (synchronous)
 */
export function decryptLabelGroupSync<T>(
  encryptedGroup: EncryptedLabelGroup,
  keystore: CommonKeysInterface
): Result<T> {
  try {
    if (!encryptedGroup.envelopeCbor) {
      return err(new Error('Empty encrypted group - no envelope data'));
    }

    // Use original CBOR bytes from native API
    const encryptedBytes = encryptedGroup.envelopeCbor;

    // Attempt decryption using the provided key manager (synchronous)
    const plaintext = keystore.decryptEnvelope(encryptedBytes);

    // Deserialize the fields struct from plaintext using CBOR
    const fieldsStruct: T = decode(plaintext);

    return ok(fieldsStruct);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Decrypt bytes using envelope encryption (synchronous)
 */
export function decryptBytesSync(
  bytes: Uint8Array,
  keystore: CommonKeysInterface
): Result<Uint8Array> {
  try {
    // The bytes parameter contains the CBOR-encoded EnvelopeEncryptedData structure
    // The native API expects the same format, so pass it through
    const encryptedBytes = bytes;

    // Decrypt using native module
    const plaintext = keystore.decryptEnvelope(encryptedBytes);
    return ok(new Uint8Array(plaintext));
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}
