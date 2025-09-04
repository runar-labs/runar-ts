// Device capabilities interface as specified in Section 25.5
export interface DeviceKeystoreCaps {
  readonly canEncrypt: boolean;
  readonly canDecrypt: boolean;
  readonly hasNetworkKeys: boolean;
  readonly hasProfileKeys: boolean;
}

// Common interface for serialization and functionality that should NOT be aware of platform differences
export interface CommonKeysInterface {
  // === CORE SERIALIZER METHODS (Section 25.5) ===
  encryptWithEnvelope(
    data: Uint8Array,
    networkPublicKey: Uint8Array | undefined | null,
    profilePublicKeys: Uint8Array[]
  ): Uint8Array;

  decryptEnvelope(eedCbor: Uint8Array): Uint8Array;

  getKeystoreState(): number;

  getKeystoreCaps(): DeviceKeystoreCaps;

  // === ADMINISTRATIVE/UTILITY METHODS (Section 25.5) ===
  ensureSymmetricKey(keyName: string): Uint8Array;
  setLocalNodeInfo(nodeInfoCbor: Uint8Array): void;
  setPersistenceDir(dir: string): void;
  enableAutoPersist(enabled: boolean): void;
  wipePersistence(): Promise<void>;
  flushState(): Promise<void>;
  setLabelMapping(label: string, networkPublicKey?: Uint8Array, userKeySpec?: unknown): void;
}
