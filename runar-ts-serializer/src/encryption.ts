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
export class EnvelopeEncryptedData {
  constructor(
    /** The encrypted data payload */
    public encryptedData: Uint8Array,
    /** Envelope key encrypted with network key (always required) */
    public networkEncryptedKey: Uint8Array,
    /** Envelope key encrypted with each profile key */
    public profileEncryptedKeys: Map<string, Uint8Array>,
    /** Network ID this data belongs to */
    public networkId?: string
  ) {}
}

/**
 * Container for label-grouped encryption (one per label)
 */
export class EncryptedLabelGroup {
  constructor(
    /** The label this group was encrypted with */
    public label: string,
    /** Envelope-encrypted payload produced by runar-keys */
    public envelope: EnvelopeEncryptedData
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
    // The native API returns a CBOR-encoded EnvelopeEncryptedData structure
    const encryptedBytes = keystore.encryptWithEnvelope(dataBuffer, networkPublicKey, profileKeys);

    // Parse the CBOR-encoded EnvelopeEncryptedData returned by native module
    const envelopeData = decode(encryptedBytes);

    // Validate envelope structure
    if (!envelopeData || typeof envelopeData !== 'object') {
      return err(new Error('Invalid envelope data structure returned from native module'));
    }

    // Convert to our class format - the native API uses different field names
    const envelope = new EnvelopeEncryptedData(
      envelopeData.encrypted_data ? new Uint8Array(envelopeData.encrypted_data) : new Uint8Array(),
      envelopeData.network_encrypted_key
        ? new Uint8Array(envelopeData.network_encrypted_key)
        : new Uint8Array(),
      new Map(
        Object.entries(envelopeData.profile_encrypted_keys || {}).map(([k, v]) => [
          k,
          new Uint8Array(v as any),
        ])
      ),
      envelopeData.network_id
    );

    return ok(new EncryptedLabelGroup(label, envelope));
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

    // The native API expects the CBOR-encoded EnvelopeEncryptedData structure
    // We need to re-encode our interface back to the native format
    const envelopeCbor = encode({
      encrypted_data: encryptedGroup.envelope.encryptedData,
      network_id: encryptedGroup.envelope.networkId,
      network_encrypted_key: encryptedGroup.envelope.networkEncryptedKey,
      profile_encrypted_keys: Object.fromEntries(encryptedGroup.envelope.profileEncryptedKeys),
    });

    const encryptedBytes = new Uint8Array(envelopeCbor);

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


