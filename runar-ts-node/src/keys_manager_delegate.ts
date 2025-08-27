import type { Keys } from 'runar-nodejs-api';

// Common interface for serialization and functionality that should NOT be aware of platform differences
export interface CommonKeysInterface {
  // === ENVELOPE ENCRYPTION (WORKS ON BOTH) ===
  encryptWithEnvelope(
    data: Buffer, 
    networkId: string | null, 
    profilePublicKeys: Buffer[]
  ): Buffer;
  
  decryptEnvelope(eedCbor: Buffer): Buffer;
  
  // === UTILITY METHODS (BOTH PLATFORMS) ===
  ensureSymmetricKey(keyName: string): Buffer;
  setLabelMapping(mappingCbor: Buffer): void;
  setLocalNodeInfo(nodeInfoCbor: Buffer): void;
  
  // === CONFIGURATION (BOTH PLATFORMS) ===
  setPersistenceDir(dir: string): void;
  enableAutoPersist(enabled: boolean): void;
  wipePersistence(): Promise<void>;
  flushState(): Promise<void>;
  
  // === STATE QUERIES (BOTH PLATFORMS) ===
  getKeystoreState(): number; // Common method, not platform-specific
  
  // === CAPABILITIES ===
  getKeystoreCaps(): any; // DeviceKeystoreCaps type
}

export class KeysManagerDelegate implements CommonKeysInterface {
  constructor(
    private keys: Keys, // Native Keys instance
    private platform: 'mobile' | 'node'
  ) {}
  
  // === ENVELOPE ENCRYPTION (AUTOMATIC ROUTING) ===
  encryptWithEnvelope(
    data: Buffer, 
    networkId: string | null, 
    profilePublicKeys: Buffer[]
  ): Buffer {
    if (this.platform === 'mobile') {
      return this.keys.mobileEncryptWithEnvelope(data, networkId, profilePublicKeys);
    } else {
      return this.keys.nodeEncryptWithEnvelope(data, networkId, profilePublicKeys);
    }
  }
  
  decryptEnvelope(eedCbor: Buffer): Buffer {
    if (this.platform === 'mobile') {
      return this.keys.mobileDecryptEnvelope(eedCbor);
    } else {
      return this.keys.nodeDecryptEnvelope(eedCbor);
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
    if (this.platform === 'mobile') {
      return this.keys.mobileGetKeystoreState();
    } else {
      return this.keys.nodeGetKeystoreState();
    }
  }
  
  getKeystoreCaps(): any {
    return this.keys.getKeystoreCaps();
  }
}

