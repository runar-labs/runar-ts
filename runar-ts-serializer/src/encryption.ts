import { Result, ok, err } from './result.js';
import { LabelResolver } from './label_resolver.js';
import type { CommonKeysInterface } from './wire.js';

// ---------------------------------------------------------------------------
// Envelope Encryption Types
// ---------------------------------------------------------------------------

/**
 * Envelope encrypted data structure
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
  envelope?: EnvelopeEncryptedData;
}

// ---------------------------------------------------------------------------
// Envelope Encryption Functions
// ---------------------------------------------------------------------------

/**
 * Encrypt a group of fields that share the same label
 */
export async function encryptLabelGroup<T>(
  label: string,
  fieldsStruct: T,
  keystore: CommonKeysInterface,
  resolver: LabelResolver
): Promise<Result<EncryptedLabelGroup>> {
  try {
    // Serialize the fields within this label group using CBOR
    const { encode } = await import('cbor-x');
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
    const networkId = info.networkPublicKey ? 'network' : null; // Simplified for now
    const profileKeys = info.profilePublicKeys.map(pk => Buffer.from(pk));

    // Encrypt using envelope encryption
    const encrypted = keystore.encryptWithEnvelope(dataBuffer, networkId, profileKeys);

    return ok({
      label,
      envelope: {
        encryptedData: encrypted,
        networkId: networkId || undefined,
        networkEncryptedKey: new Uint8Array(), // Will be populated by runar-keys
        profileEncryptedKeys: new Map(), // Will be populated by runar-keys
      },
    });
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Attempt to decrypt a label group back into its original struct
 */
export async function decryptLabelGroup<T>(
  encryptedGroup: EncryptedLabelGroup,
  keystore: CommonKeysInterface
): Promise<Result<T>> {
  try {
    if (!encryptedGroup.envelope) {
      return err(new Error('Empty encrypted group'));
    }

    // Attempt decryption using the provided key manager
    const plaintext = keystore.decryptEnvelope(Buffer.from(encryptedGroup.envelope.encryptedData));

    // Deserialize the fields struct from plaintext using CBOR
    const { decode } = await import('cbor-x');
    const fieldsStruct: T = decode(plaintext);

    return ok(fieldsStruct);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Decrypt bytes using envelope encryption
 */
export async function decryptBytes(
  bytes: Uint8Array,
  keystore: CommonKeysInterface
): Promise<Result<Uint8Array>> {
  try {
    // For now, we'll assume the bytes are already in the correct format
    // In the future, this should parse the EnvelopeEncryptedData structure
    const plaintext = keystore.decryptEnvelope(Buffer.from(bytes));
    return ok(plaintext);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}
