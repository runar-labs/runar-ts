import type { Keys } from 'runar-nodejs-api';
import { CommonKeysInterface } from 'runar-ts-serializer';

/**
 * Wrapper to implement CommonKeysInterface for native Keys instance
 * This matches the Rust NodeKeyManagerWrapper pattern exactly
 */
export class KeysManagerWrapper implements CommonKeysInterface {
  constructor(private keys: Keys) {}

  // === ENVELOPE ENCRYPTION (AUTOMATIC ROUTING) ===
  encryptWithEnvelope(data: Buffer, networkId: string | null, profilePublicKeys: Buffer[]): Buffer {
    // Handle both mobile and node platforms
    if ('mobileEncryptWithEnvelope' in this.keys && 'initAsMobile' in this.keys) {
      // Check if it's initialized as mobile
      try {
        return (this.keys as any).mobileEncryptWithEnvelope(data, networkId, profilePublicKeys);
      } catch (error) {
        // If mobile method fails, try node method
        if ('nodeEncryptWithEnvelope' in this.keys) {
          return (this.keys as any).nodeEncryptWithEnvelope(data, networkId, profilePublicKeys);
        }
        throw error;
      }
    } else if ('nodeEncryptWithEnvelope' in this.keys) {
      return (this.keys as any).nodeEncryptWithEnvelope(data, networkId, profilePublicKeys);
    } else {
      throw new Error('No encryption method available on this platform');
    }
  }

  decryptEnvelope(eedCbor: Buffer): Buffer {
    // Handle both mobile and node platforms
    if ('mobileDecryptEnvelope' in this.keys && 'initAsMobile' in this.keys) {
      // Check if it's initialized as mobile
      try {
        return (this.keys as any).mobileDecryptEnvelope(eedCbor);
      } catch (error) {
        // If mobile method fails, try node method
        if ('nodeDecryptEnvelope' in this.keys) {
          return (this.keys as any).nodeDecryptEnvelope(eedCbor);
        }
        throw error;
      }
    } else if ('nodeDecryptEnvelope' in this.keys) {
      return (this.keys as any).nodeDecryptEnvelope(eedCbor);
    } else {
      throw new Error('No decryption method available on this platform');
    }
  }

  // === UTILITY METHODS (BOTH PLATFORMS) ===
  ensureSymmetricKey(keyName: string): Buffer {
    return this.keys.ensureSymmetricKey(keyName);
  }

  setLabelMapping(mappingCbor: Buffer): void {
    this.keys.setLabelMapping(mappingCbor);
  }

  setLocalNodeInfo(nodeInfoCbor: Buffer): void {
    this.keys.setLocalNodeInfo(nodeInfoCbor);
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
}
