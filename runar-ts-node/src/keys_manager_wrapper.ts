import { Keys } from 'runar-nodejs-api';
import { Result, ok, err } from 'runar-ts-common';

// Device keystore capabilities interface
export interface DeviceKeystoreCaps {
  readonly canEncrypt: boolean;
  readonly canDecrypt: boolean;
  readonly hasNetworkKeys: boolean;
  readonly hasProfileKeys: boolean;
}

// Common interface that all keystore wrappers must implement
export interface CommonKeysInterface {
  // Core encryption/decryption methods
  encryptWithEnvelope(
    data: Uint8Array,
    networkPublicKey: Uint8Array | undefined | null,
    profilePublicKeys: Uint8Array[]
  ): Uint8Array;

  decryptEnvelope(eedCbor: Uint8Array): Uint8Array;

  // Keystore state and capabilities
  getKeystoreState(): number;
  getKeystoreCaps(): DeviceKeystoreCaps;

  // Utility methods
  ensureSymmetricKey(keyName: string): Uint8Array;
  setLocalNodeInfo(nodeInfoCbor: Uint8Array): void;
  setPersistenceDir(dir: string): void;
  enableAutoPersist(enabled: boolean): void;
  wipePersistence(): Promise<void>;
  flushState(): Promise<void>;

  // Label mapping method (required by tests)
  setLabelMapping(label: string, networkPublicKey: Uint8Array | undefined, userKeySpec: any): void;
}

// Mobile keystore wrapper - handles profile keys and mobile-specific operations
export class KeysWrapperMobile implements CommonKeysInterface {
  private readonly keys: Keys;
  private readonly role = 'frontend' as const;
  private labelMappings: Map<string, { networkPublicKey?: Uint8Array; userKeySpec?: any }> =
    new Map();

  constructor(keys: Keys) {
    this.keys = keys;
  }

  // Core encryption method for mobile keystore
  encryptWithEnvelope(
    data: Uint8Array,
    networkPublicKey: Uint8Array | undefined | null,
    profilePublicKeys: Uint8Array[]
  ): Uint8Array {
    try {
      const result = this.keys.mobileEncryptWithEnvelope(
        Buffer.from(data),
        networkPublicKey ? Buffer.from(networkPublicKey) : null,
        profilePublicKeys.map(pk => Buffer.from(pk))
      );
      return new Uint8Array(result);
    } catch (error) {
      throw new Error(
        `Mobile encryption failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Core decryption method for mobile keystore
  // For dual-encrypted envelopes, mobile should use profile keys for decryption
  decryptEnvelope(eedCbor: Uint8Array): Uint8Array {
    try {
      // Mobile keystore should use its profile keys for decryption
      const result = this.keys.mobileDecryptEnvelope(Buffer.from(eedCbor));
      return new Uint8Array(result);
    } catch (error) {
      throw new Error(
        `Mobile decryption failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Mobile-specific profile key derivation
  mobileDeriveUserProfileKey(label: string): Uint8Array {
    try {
      const result = this.keys.mobileDeriveUserProfileKey(label);
      return new Uint8Array(result);
    } catch (error) {
      throw new Error(
        `Failed to derive user profile key: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Mobile-specific network key generation
  mobileGenerateNetworkDataKey(): Uint8Array {
    try {
      const result = this.keys.mobileGenerateNetworkDataKey();
      return new Uint8Array(result);
    } catch (error) {
      throw new Error(
        `Failed to generate network data key: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Mobile-specific network key installation
  mobileInstallNetworkPublicKey(networkPublicKey: Uint8Array): void {
    try {
      this.keys.mobileInstallNetworkPublicKey(Buffer.from(networkPublicKey));
    } catch (error) {
      throw new Error(
        `Failed to install network public key: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Mobile-specific network key message creation
  mobileCreateNetworkKeyMessage(
    networkPublicKey: Uint8Array,
    nodeAgreementPublicKey: Uint8Array
  ): Uint8Array {
    try {
      const result = this.keys.mobileCreateNetworkKeyMessage(
        Buffer.from(networkPublicKey),
        Buffer.from(nodeAgreementPublicKey)
      );
      return new Uint8Array(result);
    } catch (error) {
      throw new Error(
        `Failed to create network key message: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Mobile-specific user root key initialization
  async mobileInitializeUserRootKey(): Promise<void> {
    try {
      await this.keys.mobileInitializeUserRootKey();
    } catch (error) {
      throw new Error(
        `Failed to initialize user root key: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Keystore state query
  getKeystoreState(): number {
    try {
      return this.keys.mobileGetKeystoreState();
    } catch (error) {
      throw new Error(
        `Failed to get mobile keystore state: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Keystore capabilities
  getKeystoreCaps(): DeviceKeystoreCaps {
    return {
      canEncrypt: true,
      canDecrypt: true,
      hasNetworkKeys: false, // Mobile keystores don't have network keys by default
      hasProfileKeys: true, // Mobile keystores have profile keys
    };
  }

  // Utility methods
  ensureSymmetricKey(keyName: string): Uint8Array {
    try {
      const result = this.keys.ensureSymmetricKey(keyName);
      return new Uint8Array(result);
    } catch (error) {
      throw new Error(
        `Failed to ensure symmetric key: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  setLocalNodeInfo(nodeInfoCbor: Uint8Array): void {
    try {
      this.keys.setLocalNodeInfo(Buffer.from(nodeInfoCbor));
    } catch (error) {
      throw new Error(
        `Failed to set local node info: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  setPersistenceDir(dir: string): void {
    try {
      this.keys.setPersistenceDir(dir);
    } catch (error) {
      throw new Error(
        `Failed to set persistence directory: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  enableAutoPersist(enabled: boolean): void {
    try {
      this.keys.enableAutoPersist(enabled);
    } catch (error) {
      throw new Error(
        `Failed to enable auto persist: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async wipePersistence(): Promise<void> {
    try {
      await this.keys.wipePersistence();
    } catch (error) {
      throw new Error(
        `Failed to wipe persistence: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async flushState(): Promise<void> {
    try {
      await this.keys.flushState();
    } catch (error) {
      throw new Error(
        `Failed to flush state: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Label mapping method (required by interface)
  setLabelMapping(label: string, networkPublicKey: Uint8Array | undefined, userKeySpec: any): void {
    this.labelMappings.set(label, { networkPublicKey, userKeySpec });
  }

  // Get label mappings (for testing/debugging)
  getLabelMappings(): Map<string, { networkPublicKey?: Uint8Array; userKeySpec?: any }> {
    return new Map(this.labelMappings);
  }
}

// Node keystore wrapper - handles network keys and node-specific operations
export class KeysWrapperNode implements CommonKeysInterface {
  private readonly keys: Keys;
  private readonly role = 'backend' as const;
  private labelMappings: Map<string, { networkPublicKey?: Uint8Array; userKeySpec?: any }> =
    new Map();

  constructor(keys: Keys) {
    this.keys = keys;
  }

  // Core encryption method for node keystore
  encryptWithEnvelope(
    data: Uint8Array,
    networkPublicKey: Uint8Array | undefined | null,
    profilePublicKeys: Uint8Array[]
  ): Uint8Array {
    try {
      const result = this.keys.nodeEncryptWithEnvelope(
        Buffer.from(data),
        networkPublicKey ? Buffer.from(networkPublicKey) : null,
        profilePublicKeys.map(pk => Buffer.from(pk))
      );
      return new Uint8Array(result);
    } catch (error) {
      throw new Error(
        `Node encryption failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Core decryption method for node keystore
  decryptEnvelope(eedCbor: Uint8Array): Uint8Array {
    try {
      const result = this.keys.nodeDecryptEnvelope(Buffer.from(eedCbor));
      return new Uint8Array(result);
    } catch (error) {
      throw new Error(
        `Node decryption failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Node-specific CSR generation
  nodeGenerateCsr(): Uint8Array {
    try {
      const result = this.keys.nodeGenerateCsr();
      return new Uint8Array(result);
    } catch (error) {
      throw new Error(
        `Failed to generate CSR: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Node-specific agreement public key retrieval
  nodeGetAgreementPublicKey(): Uint8Array {
    try {
      const result = this.keys.nodeGetAgreementPublicKey();
      return new Uint8Array(result);
    } catch (error) {
      throw new Error(
        `Failed to get agreement public key: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Node-specific network key installation
  nodeInstallNetworkKey(networkKeyMessage: Uint8Array): void {
    try {
      this.keys.nodeInstallNetworkKey(Buffer.from(networkKeyMessage));
    } catch (error) {
      throw new Error(
        `Failed to install network key: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Keystore state query
  getKeystoreState(): number {
    try {
      return this.keys.nodeGetKeystoreState();
    } catch (error) {
      throw new Error(
        `Failed to get node keystore state: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Keystore capabilities
  getKeystoreCaps(): DeviceKeystoreCaps {
    return {
      canEncrypt: true,
      canDecrypt: true,
      hasNetworkKeys: true, // Node keystores have network keys
      hasProfileKeys: false, // Node keystores don't have profile keys
    };
  }

  // Utility methods
  ensureSymmetricKey(keyName: string): Uint8Array {
    try {
      const result = this.keys.ensureSymmetricKey(keyName);
      return new Uint8Array(result);
    } catch (error) {
      throw new Error(
        `Failed to ensure symmetric key: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  setLocalNodeInfo(nodeInfoCbor: Uint8Array): void {
    try {
      this.keys.setLocalNodeInfo(Buffer.from(nodeInfoCbor));
    } catch (error) {
      throw new Error(
        `Failed to set local node info: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  setPersistenceDir(dir: string): void {
    try {
      this.keys.setPersistenceDir(dir);
    } catch (error) {
      throw new Error(
        `Failed to set persistence directory: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  enableAutoPersist(enabled: boolean): void {
    try {
      this.keys.enableAutoPersist(enabled);
    } catch (error) {
      throw new Error(
        `Failed to enable auto persist: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async wipePersistence(): Promise<void> {
    try {
      await this.keys.wipePersistence();
    } catch (error) {
      throw new Error(
        `Failed to wipe persistence: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async flushState(): Promise<void> {
    try {
      await this.keys.flushState();
    } catch (error) {
      throw new Error(
        `Failed to flush state: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Label mapping method (required by interface)
  setLabelMapping(label: string, networkPublicKey: Uint8Array | undefined, userKeySpec: any): void {
    this.labelMappings.set(label, { networkPublicKey, userKeySpec });
  }

  // Get label mappings (for testing/debugging)
  getLabelMappings(): Map<string, { networkPublicKey?: Uint8Array; userKeySpec?: any }> {
    return new Map(this.labelMappings);
  }
}

// Factory class for creating role-specific keystore wrappers
export class KeystoreFactory {
  /**
   * Creates a role-specific keystore wrapper
   * @param keys - The native Keys instance
   * @param role - Either 'frontend' (mobile) or 'backend' (node)
   * @returns Result containing the appropriate wrapper or an error
   */
  static create(keys: Keys, role: 'frontend' | 'backend'): Result<CommonKeysInterface, Error> {
    if (role === 'frontend') {
      return ok(new KeysWrapperMobile(keys));
    } else if (role === 'backend') {
      return ok(new KeysWrapperNode(keys));
    } else {
      return err(new Error(`Invalid keystore role: ${role}. Must be 'frontend' or 'backend'`));
    }
  }

  /**
   * Creates a mobile keystore wrapper
   * @param keys - The native Keys instance
   * @returns Result containing the mobile wrapper or an error
   */
  static createMobile(keys: Keys): Result<KeysWrapperMobile, Error> {
    return ok(new KeysWrapperMobile(keys));
  }

  /**
   * Creates a node keystore wrapper
   * @param keys - The native Keys instance
   * @returns Result containing the node wrapper or an error
   */
  static createNode(keys: Keys): Result<KeysWrapperNode, Error> {
    return ok(new KeysWrapperNode(keys));
  }
}
