import type { Keys } from 'runar-nodejs-api';
import { CommonKeysInterface } from 'runar-ts-serializer';

/**
 * Wrapper to implement CommonKeysInterface for native Keys instance
 * This matches the Rust NodeKeyManagerWrapper pattern exactly
 */
export class KeysManagerWrapper implements CommonKeysInterface {
  constructor(private keys: Keys) {}

  // === ENVELOPE ENCRYPTION (AUTOMATIC ROUTING) ===
  encryptWithEnvelope(
    data: Uint8Array,
    networkPublicKey: Uint8Array | undefined | null,
    profilePublicKeys: Uint8Array[]
  ): Uint8Array {
    // Handle both mobile and node platforms
    if ('mobileEncryptWithEnvelope' in this.keys && 'initAsMobile' in this.keys) {
      // Check if it's initialized as mobile
      try {
        return new Uint8Array(
          (this.keys as any).mobileEncryptWithEnvelope(
            Buffer.from(data),
            networkPublicKey ? Buffer.from(networkPublicKey) : null,
            profilePublicKeys.map(pk => Buffer.from(pk))
          )
        );
      } catch (error) {
        // If mobile method fails, try node method
        if ('nodeEncryptWithEnvelope' in this.keys) {
          return new Uint8Array(
            (this.keys as any).nodeEncryptWithEnvelope(
              Buffer.from(data),
              networkPublicKey ? Buffer.from(networkPublicKey) : null,
              profilePublicKeys.map(pk => Buffer.from(pk))
            )
          );
        }
        throw error;
      }
    } else if ('nodeEncryptWithEnvelope' in this.keys) {
      return new Uint8Array(
        (this.keys as any).nodeEncryptWithEnvelope(
          Buffer.from(data),
          networkPublicKey ? Buffer.from(networkPublicKey) : null,
          profilePublicKeys.map(pk => Buffer.from(pk))
        )
      );
    } else {
      throw new Error('No encryption method available on this platform');
    }
  }

  decryptEnvelope(eedCbor: Uint8Array): Uint8Array {
    // Handle both mobile and node platforms
    // Since we're testing with mobile keystores, try mobile first
    if ('mobileDecryptEnvelope' in this.keys) {
      try {
        return new Uint8Array((this.keys as any).mobileDecryptEnvelope(Buffer.from(eedCbor)));
      } catch (error) {
        // If mobile fails, try node as fallback
        if ('nodeDecryptEnvelope' in this.keys) {
          return new Uint8Array((this.keys as any).nodeDecryptEnvelope(Buffer.from(eedCbor)));
        }
        throw error;
      }
    } else if ('nodeDecryptEnvelope' in this.keys) {
      return new Uint8Array((this.keys as any).nodeDecryptEnvelope(Buffer.from(eedCbor)));
    }

    throw new Error('No decryption method available on this platform');
  }

  // === UTILITY METHODS (BOTH PLATFORMS) ===
  ensureSymmetricKey(keyName: string): Uint8Array {
    return new Uint8Array(this.keys.ensureSymmetricKey(keyName));
  }

  setLabelMapping(mappingCbor: Uint8Array): void {
    this.keys.setLabelMapping(Buffer.from(mappingCbor));
  }

  setLocalNodeInfo(nodeInfoCbor: Uint8Array): void {
    this.keys.setLocalNodeInfo(Buffer.from(nodeInfoCbor));
  }

  // === CONFIGURATION (BOTH PLATFORMS) ===
  setPersistenceDir(dir: string): void {
    this.keys.setPersistenceDir(dir);
  }

  enableAutoPersist(enabled: boolean): void {
    this.keys.enableAutoPersist(enabled);
  }

  async wipePersistence(): Promise<void> {
    return this.keys.wipePersistence();
  }

  async flushState(): Promise<void> {
    return this.keys.flushState();
  }

  // === STATE QUERIES (BOTH PLATFORMS) ===
  getKeystoreState(): number {
    // Handle both mobile and node platforms
    if ('mobileGetKeystoreState' in this.keys && 'initAsMobile' in this.keys) {
      // Check if it's initialized as mobile
      try {
        return (this.keys as any).mobileGetKeystoreState();
      } catch (error) {
        // If mobile method fails, try node method
        if ('nodeGetKeystoreState' in this.keys) {
          return (this.keys as any).nodeGetKeystoreState();
        }
        throw error;
      }
    } else if ('nodeGetKeystoreState' in this.keys) {
      return (this.keys as any).nodeGetKeystoreState();
    } else {
      // Fallback for unknown platform
      return 0;
    }
  }

  getKeystoreCaps(): any {
    return this.keys.getKeystoreCaps();
  }

  // === NETWORK KEY MANAGEMENT ===
  getNetworkPublicKey(networkId: string): Uint8Array {
    // According to the design plan, this should retrieve the network public key
    // from the native Keys instance for the specified network ID
    try {
      // Use the native API to get the network public key
      if ('nodeGetPublicKey' in this.keys) {
        const publicKeyBuffer = (this.keys as any).nodeGetPublicKey(networkId);
        return new Uint8Array(publicKeyBuffer);
      } else if ('getPublicKey' in this.keys) {
        const publicKeyBuffer = (this.keys as any).getPublicKey(networkId);
        return new Uint8Array(publicKeyBuffer);
      } else {
        throw new Error('No public key retrieval method available on this platform');
      }
    } catch (error) {
      throw new Error(`Failed to retrieve network public key for ${networkId}: ${error}`);
    }
  }
}
