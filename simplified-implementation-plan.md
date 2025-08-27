# Simplified Keys Manager Implementation Plan (Corrected)

## 🎯 **Implementation Overview**

This plan implements the **corrected design** that follows the proper pattern:

1. **Node creates keystore using FFI** and stores the reference
2. **Node creates a delegate** that the serializer can use
3. **Common interface** for serialization and functionality that should NOT be aware of platform differences
4. **Direct platform-specific calls** for functionality that needs to be platform-aware

## 📋 **Phase 1: Create CommonKeysInterface (Truly Platform-Agnostic)**

### **Step 1.1: Create Package Structure**
```
runar-ts-common-keys/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                    # Main exports
│   ├── CommonKeysInterface.ts      # Truly common interface
│   └── types.ts                    # Type definitions
├── test/
│   └── CommonKeysInterface.test.ts # Interface validation tests
└── README.md
```

### **Step 1.2: Define Truly Common Interface**
```typescript
// src/CommonKeysInterface.ts
export interface CommonKeysInterface {
  // === ENVELOPE ENCRYPTION (WORKS ON BOTH) ===
  encryptWithEnvelope(data: Buffer, networkId: string | null, profilePublicKeys: Buffer[]): Buffer;
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
  getKeystoreCaps(): DeviceKeystoreCaps;
}
```

**Key Changes**:
- ❌ **Removed**: `encryptLocalData`, `decryptLocalData` (NODE ONLY)
- ❌ **Removed**: `nodeGetKeystoreState`, `mobileGetKeystoreState`
- ❌ **Removed**: Message encryption methods (not used in serializer)
- ❌ **Removed**: Network encryption methods (not used in serializer)
- ✅ **Added**: `getKeystoreState()` (common method)
- ✅ **Kept**: Only methods that work on both platforms AND are actually used

## 📋 **Phase 2: Create KeysManagerDelegate**

### **Step 2.1: Create Delegate Implementation**
```typescript
// runar-ts-node/src/keys_manager_delegate.ts
import { CommonKeysInterface } from 'runar-ts-common-keys';

export class KeysManagerDelegate implements CommonKeysInterface {
  constructor(
    private keys: any, // Native Keys instance
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
  
  getKeystoreCaps(): DeviceKeystoreCaps {
    return this.keys.getKeystoreCaps();
  }
}
```

### **Step 2.2: Add Tests for Delegate**
```typescript
// runar-ts-node/test/keys_manager_delegate.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { KeysManagerDelegate } from '../src/keys_manager_delegate';

describe('KeysManagerDelegate', () => {
  it('should route mobile methods correctly', () => {
    const mockKeys = {
      mobileEncryptWithEnvelope: (data: Buffer, networkId: string | null, profileKeys: Buffer[]) => Buffer.from('mobile_encrypted'),
      nodeEncryptWithEnvelope: (data: Buffer, networkId: string | null, profileKeys: Buffer[]) => Buffer.from('node_encrypted'),
      // ... other methods
    };
    
    const mobileDelegate = new KeysManagerDelegate(mockKeys, 'mobile');
    const result = mobileDelegate.encryptWithEnvelope(Buffer.from('test'), 'network', [Buffer.from('key')]);
    
    assert.equal(result.toString(), 'mobile_encrypted');
  });
  
  it('should route node methods correctly', () => {
    const mockKeys = {
      mobileEncryptWithEnvelope: (data: Buffer, networkId: string | null, profileKeys: Buffer[]) => Buffer.from('mobile_encrypted'),
      nodeEncryptWithEnvelope: (data: Buffer, networkId: string | null, profileKeys: Buffer[]) => Buffer.from('node_encrypted'),
      // ... other methods
    };
    
    const nodeDelegate = new KeysManagerDelegate(mockKeys, 'node');
    const result = nodeDelegate.encryptWithEnvelope(Buffer.from('test'), 'network', [Buffer.from('key')]);
    
    assert.equal(result.toString(), 'node_encrypted');
  });
});
```

## 📋 **Phase 3: Update Node to Create Keystore**

### **Step 3.1: Update Node Constructor**
```typescript
// runar-ts-node/src/index.ts
import { CommonKeysInterface } from 'runar-ts-common-keys';
import { KeysManagerDelegate } from './keys_manager_delegate';

export class Node {
  private keysManager: any; // Native Keys instance from FFI (already initialized)
  private keysDelegate: CommonKeysInterface; // Delegate for serializer
  private config: NodeConfig;
  
  constructor(config: NodeConfig) {
    this.config = config;
    
    // Get the already initialized keysManager from config
    this.keysManager = config.keysManager;
    
    // Platform is determined from config, not from key manager state
    const platform = config.platform;
    
    // Create delegate that implements CommonKeysInterface
    this.keysDelegate = new KeysManagerDelegate(this.keysManager, platform);
  }
  
  // Method to get keys delegate for serializer
  getKeysDelegate(): CommonKeysInterface {
    return this.keysDelegate;
  }
  
  // ... existing methods ...
}

// NodeConfig class with initialized keysManager
export class NodeConfig {
  public readonly default_network_id: string;
  public readonly network_ids: string[];
  public readonly network_config?: any; // NetworkConfig type
  public readonly logging_config?: any; // LoggingConfig type
  public readonly request_timeout_ms: number;
  public readonly keysManager: any; // Already initialized Keys instance from FFI
  public readonly platform: 'mobile' | 'node'; // Platform determined during setup
  public readonly keyStorePath: string; // Path to key store file
  public readonly keyManagerState?: Buffer; // Serialized key manager state (if needed)
  
  constructor(
    default_network_id: string,
    keysManager: any, // Already initialized
    platform: 'mobile' | 'node',
    keyStorePath: string
  ) {
    this.default_network_id = default_network_id;
    this.network_ids = [];
    this.request_timeout_ms = 30000; // 30 seconds default
    this.keysManager = keysManager;
    this.platform = platform;
    this.keyStorePath = keyStorePath;
  }
  
  withAdditionalNetworks(networkIds: string[]): NodeConfig {
    this.network_ids.push(...networkIds);
    return this;
  }
  
  withNetworkConfig(networkConfig: any): NodeConfig {
    this.network_config = networkConfig;
    return this;
  }
  
  withLoggingConfig(loggingConfig: any): NodeConfig {
    this.logging_config = loggingConfig;
    return this;
  }
  
  withRequestTimeout(timeoutMs: number): NodeConfig {
    this.request_timeout_ms = timeoutMs;
    return this;
  }
  
  withKeyManagerState(keyStateBytes: Buffer): NodeConfig {
    this.keyManagerState = keyStateBytes;
    return this;
  }
}

// CLI Configuration Manager (responsible for loading/creating config)
export class NodeConfigManager {
  private configPath: string;
  
  constructor(configPath: string) {
    this.configPath = configPath;
  }
  
  // Load existing config from disk
  async loadConfig(): Promise<NodeConfig | null> {
    try {
      const configData = await fs.readFile(this.configPath, 'utf8');
      const config = JSON.parse(configData);
      
      // Load and initialize keysManager based on platform
      const keysManager = await this.initializeKeysManager(config.platform, config.keyStorePath);
      
      return new NodeConfig(
        config.default_network_id,
        keysManager,
        config.platform,
        config.keyStorePath
      );
    } catch (error) {
      // No existing config found
      return null;
    }
  }
  
  // Create new config during setup process
  async createConfig(
    defaultNetworkId: string,
    platform: 'mobile' | 'node',
    keyStorePath: string
  ): Promise<NodeConfig> {
    // Initialize keysManager for the specified platform
    const keysManager = await this.initializeKeysManager(platform, keyStorePath);
    
    const config = new NodeConfig(
      defaultNetworkId,
      keysManager,
      platform,
      keyStorePath
    );
    
    // Save config to disk
    await this.saveConfig(config);
    
    return config;
  }
  
  // Initialize keysManager based on platform
  private async initializeKeysManager(platform: 'mobile' | 'node', keyStorePath: string): Promise<any> {
    const keys = new Keys(); // from runar-nodejs-api
    
    if (platform === 'mobile') {
      keys.initAsMobile();
      // Initialize mobile-specific features
      await keys.mobileInitializeUserRootKey();
    } else {
      keys.initAsNode();
      // Initialize node-specific features if needed
    }
    
    return keys;
  }
  
  // Save config to disk
  private async saveConfig(config: NodeConfig): Promise<void> {
    const configData = {
      default_network_id: config.default_network_id,
      network_ids: config.network_ids,
      platform: config.platform,
      keyStorePath: config.keyStorePath,
      request_timeout_ms: config.request_timeout_ms,
      // Note: keysManager instance is not serialized, only the path
    };
    
    await fs.writeFile(this.configPath, JSON.stringify(configData, null, 2));
  }
}
```

### **Step 3.2: Update KeysService to Use Delegate**
```typescript
// runar-ts-node/src/keys_service.ts
import { CommonKeysInterface } from 'runar-ts-common-keys';

export class KeysService implements AbstractService {
  constructor(
    private readonly delegate: KeysDelegate,
    private readonly keysDelegate?: CommonKeysInterface // NEW: Optional keys delegate
  ) {}

  async init(context: NodeLifecycleContext): Promise<Result<void, string>> {
    // Register existing symmetric key action
    const result = await context.registerAction(
      'ensure_symmetric_key',
      async (payload: Option<AnyValue>, context: RequestContext) => {
        // ... existing symmetric key logic ...
      }
    );
    
    // DO NOT register encryption actions - Node handles those directly via delegate
    // The serializer will get encryption context from Node.getKeysDelegate()
    
    return ok(undefined);
  }
}
```

## 📋 **Phase 4: Update Serializer Tests**

### **Step 4.1: Update Serialization Context**
```typescript
// runar-ts-serializer/src/index.ts
import { CommonKeysInterface } from 'runar-ts-common-keys';

export interface SerializationContext {
  keystore?: CommonKeysInterface; // Updated to use common interface
  resolver?: any;
}
```

### **Step 4.2: Update Serializer Tests**
```typescript
// runar-ts-serializer/test/encryption_envelope_roundtrip.test.ts
import { KeysManagerDelegate } from 'runar-ts-node/src/keys_manager_delegate';

describe('Encryption envelope roundtrip with common interface', () => {
  it('encrypts and decrypts using mobile keys', async () => {
    // Create keystore directly (like Node will do)
    const keys = new Keys(); // from runar-nodejs-api
    keys.initAsMobile();
    
    // Create delegate
    const keysDelegate = new KeysManagerDelegate(keys, 'mobile');
    
    // Initialize mobile-specific features
    await keys.mobileInitializeUserRootKey();
    const networkId = keys.mobileGenerateNetworkDataKey();
    const profileKey = keys.mobileDeriveUserProfileKey('test');
    
    const obj = { a: 1, b: 'envelope_test' };
    const data = Buffer.from(encode(obj));
    
    // Use common interface - no platform awareness needed!
    const encrypted = keysDelegate.encryptWithEnvelope(data, networkId, [profileKey]);
    const decrypted = keysDelegate.decryptEnvelope(encrypted);
    
    const decoded = decode(decrypted);
    expect(decoded).toEqual(obj);
  });

  it('encrypts and decrypts using node keys', async () => {
    // Create keystore directly (like Node will do)
    const keys = new Keys(); // from runar-nodejs-api
    keys.initAsNode();
    
    // Create delegate
    const keysDelegate = new KeysManagerDelegate(keys, 'node');
    
    const obj = { a: 2, b: 'local_test' };
    const body = encode(obj);
    
    // Use common interface - no platform awareness needed!
    const encrypted = keysDelegate.encryptWithEnvelope(Buffer.from(body), 'local', []);
    const decrypted = keysDelegate.decryptEnvelope(encrypted);
    
    const decoded = decode(decrypted);
    expect(decoded).toEqual(obj);
  });
});
```

## 📋 **Phase 5: Update Decorators Package**

### **Step 5.1: Update RunarKeysAdapter**
```typescript
// runar-ts-decorators/src/index.ts
import { CommonKeysInterface } from 'runar-ts-common-keys';

export class RunarKeysAdapter implements RunarKeysAdapter {
  private keysManager: CommonKeysInterface;

  constructor(keys: any, managerType: 'mobile' | 'node' = 'node') {
    // Create delegate that implements CommonKeysInterface
    this.keysManager = new KeysManagerDelegate(keys, managerType);
  }

  async encrypt(data: Uint8Array, keyInfo: LabelKeyInfo): Promise<Uint8Array> {
    // Use common interface - no platform awareness needed!
    if (keyInfo.networkId && keyInfo.profilePublicKeys.length > 0) {
      const profileKeys = keyInfo.profilePublicKeys.map(pk => Buffer.from(pk));
      return this.keysManager.encryptWithEnvelope(
        Buffer.from(data), 
        keyInfo.networkId, 
        profileKeys
      );
    } else {
      // For local encryption, use envelope encryption with no recipients
      return this.keysManager.encryptWithEnvelope(Buffer.from(data), 'local', []);
    }
  }

  async decrypt(data: Uint8Array, keyInfo: LabelKeyInfo): Promise<Uint8Array> {
    // Use common interface - no platform awareness needed!
    try {
      return this.keysManager.decryptEnvelope(Buffer.from(data));
    } catch (error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }
}
```

## 📋 **Phase 6: Integration Testing**

### **Step 6.1: Test Complete Lifecycle**
```typescript
// runar-ts-node/test/node_with_keys.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Node } from '../src';

describe('Node with keys integration', () => {
  it('should create mobile node with keys delegate', async () => {
    const node = Node.createMobile('mobile-network');
    const keysDelegate = node.getKeysDelegate();
    
    // Verify delegate implements CommonKeysInterface
    assert.ok(typeof keysDelegate.encryptWithEnvelope === 'function');
    assert.ok(typeof keysDelegate.decryptEnvelope === 'function');
    assert.ok(typeof keysDelegate.getKeystoreState === 'function');
    
    // Verify platform-specific routing works
    const state = keysDelegate.getKeystoreState();
    assert.ok(typeof state === 'number');
  });
  
  it('should create node with keys delegate', async () => {
    const node = Node.createNode('node-network');
    const keysDelegate = node.getKeysDelegate();
    
    // Verify delegate implements CommonKeysInterface
    assert.ok(typeof keysDelegate.encryptWithEnvelope === 'function');
    assert.ok(typeof keysDelegate.decryptEnvelope === 'function');
    assert.ok(typeof keysDelegate.getKeystoreState === 'function');
    
    // Verify platform-specific routing works
    const state = keysDelegate.getKeystoreState();
    assert.ok(typeof state === 'number');
  });
});
```

## 🎯 **Implementation Timeline**

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| **Phase 1** | 2 days | CommonKeysInterface package (truly common) |
| **Phase 2** | 2 days | KeysManagerDelegate implementation |
| **Phase 3** | 2 days | Node integration with keystore creation |
| **Phase 4** | 2 days | Serializer tests with keystore creation |
| **Phase 5** | 1 day | Decorators package integration |
| **Phase 6** | 1 day | Integration testing and validation |

**Total Estimated Time: 10 days**

## 🎉 **Key Benefits of This Corrected Design**

1. **Follows Proper Pattern**: Node creates keystore using FFI and provides delegate
2. **Truly Common Interface**: No platform-specific methods in CommonKeysInterface
3. **Clear Separation**: Common operations vs platform-specific operations
4. **Serializer Integration**: Gets keys context from Node's delegate
5. **Test Compatibility**: Serializer tests can create keystore directly
6. **Maintains Existing Patterns**: KeysService still works with KeysDelegate

## 📝 **Next Steps**

1. **Review and approve** the corrected design
2. **Start Phase 1** - Create CommonKeysInterface package (truly common)
3. **Continue** with KeysManagerDelegate implementation
4. **Update Node** to create keystore and provide delegate
5. **Update Serializer tests** to create keystore directly
6. **Integration testing** and validation

This corrected design follows the **proper pattern** where Node creates the keystore using FFI and provides a delegate that the serializer can use, while maintaining a truly common interface for platform-agnostic operations.
