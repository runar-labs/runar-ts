import { Keys } from 'runar-nodejs-api';
import { CommonKeysInterface } from '../runar-ts-serializer/src/wire.js';
import { KeysManagerWrapper } from './keys_manager_wrapper.js';
import type { NodeConfig } from './config.js';

/**
 * Factory for creating role-based keystores
 * Follows the REAL implementation pattern from NodeJS API tests
 */
export class KeystoreFactory {
  /**
   * Create a keystore based on the configured role
   * @param config - Node configuration with role specification
   * @param tmpDir - Temporary directory for keystore persistence
   * @returns CommonKeysInterface implementation for the specified role
   */
  static createKeystore(config: NodeConfig, tmpDir: string): CommonKeysInterface {
    const keys = new Keys();
    keys.setPersistenceDir(tmpDir);
    keys.enableAutoPersist(true);
    
    const role = config.role || 'backend'; // Default to backend for TypeScript
    
    if (role === 'frontend') {
      keys.initAsMobile();
      return new FrontendKeystoreWrapper(keys);
    } else {
      keys.initAsNode();
      return new BackendKeystoreWrapper(keys);
    }
  }
}

/**
 * Frontend keystore wrapper (mobile role)
 * Handles user root key initialization and profile key derivation
 */
class FrontendKeystoreWrapper implements CommonKeysInterface {
  constructor(private keys: Keys) {}

  async initialize(): Promise<void> {
    await this.keys.mobileInitializeUserRootKey();
  }

  encryptWithEnvelope(
    data: Buffer,
    networkPublicKey: Buffer | undefined | null,
    profilePublicKeys: Buffer[]
  ): Buffer {
    return this.keys.mobileEncryptWithEnvelope(data, networkPublicKey, profilePublicKeys);
  }

  decryptEnvelope(eedCbor: Buffer): Buffer {
    return this.keys.mobileDecryptEnvelope(eedCbor);
  }

  ensureSymmetricKey(keyName: string): Buffer {
    return this.keys.ensureSymmetricKey(keyName);
  }

  setLabelMapping(mappingCbor: Buffer): void {
    this.keys.setLabelMapping(mappingCbor);
  }

  setLocalNodeInfo(nodeInfoCbor: Buffer): void {
    this.keys.setLocalNodeInfo(nodeInfoCbor);
  }

  setPersistenceDir(dir: string): void {
    this.keys.setPersistenceDir(dir);
  }

  enableAutoPersist(enabled: boolean): void {
    this.keys.enableAutoPersist(enabled);
  }

  async wipePersistence(): Promise<void> {
    await this.keys.wipePersistence();
  }

  async flushState(): Promise<void> {
    await this.keys.flushState();
  }

  getKeystoreState(): number {
    return this.keys.mobileGetKeystoreState();
  }

  getKeystoreCaps(): any {
    return this.keys.getKeystoreCaps();
  }

  // Frontend-specific methods
  mobileGenerateNetworkDataKey(): string {
    return this.keys.mobileGenerateNetworkDataKey();
  }

  mobileGetNetworkPublicKey(networkId: string): Buffer {
    return this.keys.mobileGetNetworkPublicKey(networkId);
  }

  mobileDeriveUserProfileKey(profileName: string): Buffer {
    return this.keys.mobileDeriveUserProfileKey(profileName);
  }

  mobileCreateNetworkKeyMessage(networkId: string, nodeAgreementPk: Buffer): Buffer {
    return this.keys.mobileCreateNetworkKeyMessage(networkId, nodeAgreementPk);
  }
}

/**
 * Backend keystore wrapper (node role)
 * Handles network key installation and certificate management
 */
class BackendKeystoreWrapper implements CommonKeysInterface {
  constructor(private keys: Keys) {}

  async initialize(): Promise<void> {
    // Backend-specific initialization
    // No user root key generation
    // No profile key derivation
    // Ready to receive network keys and certificates
  }

  encryptWithEnvelope(
    data: Buffer,
    networkPublicKey: Buffer | undefined | null,
    profilePublicKeys: Buffer[]
  ): Buffer {
    return this.keys.nodeEncryptWithEnvelope(data, networkPublicKey, profilePublicKeys);
  }

  decryptEnvelope(eedCbor: Buffer): Buffer {
    return this.keys.nodeDecryptEnvelope(eedCbor);
  }

  ensureSymmetricKey(keyName: string): Buffer {
    return this.keys.ensureSymmetricKey(keyName);
  }

  setLabelMapping(mappingCbor: Buffer): void {
    this.keys.setLabelMapping(mappingCbor);
  }

  setLocalNodeInfo(nodeInfoCbor: Buffer): void {
    this.keys.setLocalNodeInfo(nodeInfoCbor);
  }

  setPersistenceDir(dir: string): void {
    this.keys.setPersistenceDir(dir);
  }

  enableAutoPersist(enabled: boolean): void {
    this.keys.enableAutoPersist(enabled);
  }

  async wipePersistence(): Promise<void> {
    await this.keys.wipePersistence();
  }

  async flushState(): Promise<void> {
    await this.keys.flushState();
  }

  getKeystoreState(): number {
    return this.keys.nodeGetKeystoreState();
  }

  getKeystoreCaps(): any {
    return this.keys.getKeystoreCaps();
  }

  // Backend-specific methods
  nodeGetAgreementPublicKey(): Buffer {
    return this.keys.nodeGetAgreementPublicKey();
  }

  nodeInstallNetworkKey(networkKeyMessage: Buffer): void {
    this.keys.nodeInstallNetworkKey(networkKeyMessage);
  }

  nodeInstallCertificate(certMessage: Buffer): void {
    this.keys.nodeInstallCertificate(certMessage);
  }
}
