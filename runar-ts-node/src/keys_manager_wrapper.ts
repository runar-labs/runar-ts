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
    // Use the original working approach: nodes only support network-wide encryption
    // This matches Rust: keys_manager.create_envelope_for_network(data, network_id)
    return this.keys.nodeEncryptWithEnvelope(data, networkId, profilePublicKeys);
  }

  decryptEnvelope(eedCbor: Buffer): Buffer {
    // This matches Rust: keys_manager.decrypt_envelope_data(env)
    return this.keys.nodeDecryptEnvelope(eedCbor);
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
    return this.keys.nodeGetKeystoreState();
  }

  getKeystoreCaps(): any {
    return this.keys.getKeystoreCaps();
  }
}
