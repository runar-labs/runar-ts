import { Result, ok, err } from 'runar-ts-common/src/error/Result.js';
import { LabelResolver } from './label_resolver.js';
import type { CommonKeysInterface } from './keystore/device_caps.js';
import { encode, decode } from 'cbor-x';
import { Logger, Component } from 'runar-ts-common/src/logging/logger.js';

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
): Result<EncryptedLabelGroup, Error> {
  try {
    // Serialize the fields within this label group using CBOR
    const plainBytes = encode(fieldsStruct);

    // Resolve the label to key info (public key + scope)
    const infoResult = resolver.resolveLabelInfo(label);
    if (!infoResult.ok) {
      return err(
        new Error(`Failed to resolve label info for '${label}': ${(infoResult as any).error}`)
      );
    }

    const info = infoResult.value;
    if (!info) {
      return err(new Error('Label not found in resolver configuration'));
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
  keystore: CommonKeysInterface,
  logger?: Logger
): Result<T, Error> {
  const log = logger
    ? logger.withComponent(Component.Encryption)
    : Logger.newRoot(Component.Encryption);

  log.trace(`Starting decryptLabelGroupSync for label: ${encryptedGroup.label}`);

  try {
    if (!encryptedGroup.envelopeCbor) {
      log.error(
        `Empty encrypted group for label ${encryptedGroup.label}: no envelope data available`
      );
      return err(new Error('Empty encrypted group: no envelope data available'));
    }

    // Use original CBOR bytes from native API
    const encryptedBytes = encryptedGroup.envelopeCbor;
    log.trace(
      `Attempting decryption for label ${encryptedGroup.label} with ${encryptedBytes.length} bytes`
    );

    // Get keystore capabilities for debugging
    const caps = keystore.getKeystoreCaps();
    log.debug(
      `Keystore capabilities for label ${encryptedGroup.label}: hasProfileKeys=${caps.hasProfileKeys}, hasNetworkKeys=${caps.hasNetworkKeys}`
    );

    // Attempt decryption using the provided key manager (synchronous)
    const plaintext = keystore.decryptEnvelope(encryptedBytes);
    log.trace(
      `Decryption successful for label ${encryptedGroup.label}, got ${plaintext.length} bytes of plaintext`
    );

    // Deserialize the fields struct from plaintext using CBOR
    const fieldsStruct: T = decode(plaintext);
    log.trace(`CBOR deserialization successful for label ${encryptedGroup.label}`);

    return ok(fieldsStruct);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`Decryption failed for label ${encryptedGroup.label}: ${errorMsg}`);
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Decrypt bytes using envelope encryption (synchronous)
 */
export function decryptBytesSync(
  bytes: Uint8Array,
  keystore: CommonKeysInterface
): Result<Uint8Array, Error> {
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
