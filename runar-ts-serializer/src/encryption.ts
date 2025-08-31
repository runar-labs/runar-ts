import { Result, ok, err } from './result.js';
import { LabelResolver } from './label_resolver.js';
import type { CommonKeysInterface } from './wire.js';
import { encode, decode } from 'cbor-x';

// ---------------------------------------------------------------------------
// Envelope Encryption Types
// ---------------------------------------------------------------------------

/**
 * Envelope encrypted data structure - matches Rust exactly
 */
export interface EnvelopeEncryptedData {
  /** The encrypted data payload */
  encryptedData: Uint8Array;
  /** Network ID this data belongs to */
  networkId?: string;
  /** Envelope key encrypted with network key (always required) */
  networkEncryptedKey: Uint8Array;
  /** Envelope key encrypted with each profile key */
  profileEncryptedKeys: Map<string, Uint8Array>;
}

/**
 * Container for label-grouped encryption (one per label)
 */
export interface EncryptedLabelGroup {
  /** The label this group was encrypted with */
  label: string;
  /** Envelope-encrypted payload produced by runar-keys */
  envelope: EnvelopeEncryptedData;
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
      return err(new Error(`Label '${label}' not available in current context`));
    }

    // Convert to Buffer for CommonKeysInterface compatibility
    const dataBuffer = Buffer.from(plainBytes);
    const networkPublicKey = info.networkPublicKey ? Buffer.from(info.networkPublicKey) : null;
    const profileKeys = info.profilePublicKeys.map(pk => Buffer.from(pk));

    // Encrypt using envelope encryption (synchronous)
    const encryptedBytes = keystore.encryptWithEnvelope(dataBuffer, networkPublicKey, profileKeys);

    // Parse the CBOR-encoded EnvelopeEncryptedData returned by native module
    const envelopeData = decode(encryptedBytes);

    // Validate envelope structure
    if (!envelopeData || typeof envelopeData !== 'object') {
      return err(new Error('Invalid envelope data structure returned from native module'));
    }

    // Convert to our interface format
    const envelope: EnvelopeEncryptedData = {
      encryptedData: envelopeData.encryptedData
        ? new Uint8Array(envelopeData.encryptedData)
        : new Uint8Array(),
      networkId: envelopeData.networkId,
      networkEncryptedKey: envelopeData.networkEncryptedKey
        ? new Uint8Array(envelopeData.networkEncryptedKey)
        : new Uint8Array(),
      profileEncryptedKeys: new Map(
        Object.entries(envelopeData.profileEncryptedKeys || {}).map(([k, v]) => [
          k,
          new Uint8Array(v as any),
        ])
      ),
    };

    return ok({
      label,
      envelope,
    });
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
    if (!encryptedGroup.envelope) {
      return err(new Error('Empty encrypted group'));
    }

    // Serialize the envelope back to CBOR for native module
    const envelopeCbor = encode({
      encryptedData: encryptedGroup.envelope.encryptedData,
      networkId: encryptedGroup.envelope.networkId,
      networkEncryptedKey: encryptedGroup.envelope.networkEncryptedKey,
      profileEncryptedKeys: Object.fromEntries(encryptedGroup.envelope.profileEncryptedKeys),
    });

    // Attempt decryption using the provided key manager (synchronous)
    const plaintext = keystore.decryptEnvelope(Buffer.from(envelopeCbor));

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
    // Parse the CBOR-encoded EnvelopeEncryptedData structure
    const envelopeData = decode(bytes);

    // Validate envelope structure
    if (!envelopeData || typeof envelopeData !== 'object') {
      return err(new Error('Invalid EnvelopeEncryptedData structure'));
    }

    // Serialize back to CBOR for native module
    const envelopeCbor = encode(envelopeData);

    // Decrypt using native module
    const plaintext = keystore.decryptEnvelope(Buffer.from(envelopeCbor));
    return ok(new Uint8Array(plaintext));
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

// ---------------------------------------------------------------------------
// Legacy Async Functions (for backward compatibility)
// ---------------------------------------------------------------------------

/**
 * @deprecated Use encryptLabelGroupSync instead
 */
export async function encryptLabelGroup<T>(
  label: string,
  fieldsStruct: T,
  keystore: CommonKeysInterface,
  resolver: LabelResolver
): Promise<Result<EncryptedLabelGroup>> {
  return encryptLabelGroupSync(label, fieldsStruct, keystore, resolver);
}

/**
 * @deprecated Use decryptLabelGroupSync instead
 */
export async function decryptLabelGroup<T>(
  encryptedGroup: EncryptedLabelGroup,
  keystore: CommonKeysInterface
): Promise<Result<T>> {
  return decryptLabelGroupSync(encryptedGroup, keystore);
}

/**
 * @deprecated Use decryptBytesSync instead
 */
export async function decryptBytes(
  bytes: Uint8Array,
  keystore: CommonKeysInterface
): Promise<Result<Uint8Array>> {
  return decryptBytesSync(bytes, keystore);
}
