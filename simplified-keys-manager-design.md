# Simplified Keys Manager Design for TypeScript (Aligned with Rust)

## 🎯 **Design Philosophy (Aligned with Rust)**

Following the **exact Rust pattern** where:

1. **NodeConfig receives initialized keystore** via `with_key_manager()` method
2. **Node extracts keystore from config** and stores it internally
3. **Node creates a wrapper** that implements the encryption interface for serializer
4. **Serializer gets encryption context** from Node's wrapper through SerializationContext
5. **Common interface** for serialization operations that work on both platforms

## 🔍 **Rust Implementation Analysis**

### **Rust NodeConfig Structure**
```rust
pub struct NodeConfig {
    // ... other fields ...
    key_manager: Option<Arc<StdRwLock<NodeKeyManager>>>,
    // ... other fields ...
}

impl NodeConfig {
    pub fn with_key_manager(mut self, key_manager: Arc<StdRwLock<NodeKeyManager>>) -> Self {
        self.key_manager = Some(key_manager);
        self
    }
}
```

### **Rust Node Constructor**
```rust
pub async fn new(config: NodeConfig) -> Result<Self> {
    // Extract the key manager from config before moving config
    let keys_manager = config
        .key_manager
        .clone()
        .ok_or_else(|| anyhow::anyhow!("Failed to load node credentials."))?;

    // ... other initialization ...

    let node = Self {
        // ... other fields ...
        keys_manager, // Store the extracted keys manager
        // ... other fields ...
    };
}
```

### **Rust Wrapper for Serializer**
```rust
// Wrapper to implement EnvelopeCrypto for Arc<RwLock<NodeKeyManager>>
struct NodeKeyManagerWrapper(Arc<StdRwLock<NodeKeyManager>>);

impl EnvelopeCrypto for NodeKeyManagerWrapper {
    fn encrypt_with_envelope(
        &self,
        data: &[u8],
        network_id: Option<&str>,
        _profile_public_keys: Vec<Vec<u8>>,
    ) -> KeyResult<runar_keys::mobile::EnvelopeEncryptedData> {
        let keys_manager = self.0.read().unwrap();
        // Use the original working approach: nodes only support network-wide encryption
        keys_manager.create_envelope_for_network(data, network_id)
    }

    fn decrypt_envelope_data(
        &self,
        env: &runar_keys::mobile::EnvelopeEncryptedData,
    ) -> KeyResult<Vec<u8>> {
        let keys_manager = self.0.read().unwrap();
        keys_manager.decrypt_envelope_data(env)
    }
}
```

### **Rust Serialization Context Creation**
```rust
// Create serialization context for encryption
let serialization_context = runar_serializer::traits::SerializationContext {
    keystore: Arc::new(NodeKeyManagerWrapper(self.keys_manager.clone())),
    resolver: self.label_resolver.clone(),
    network_id,
    profile_public_key: Some(profile_public_key.clone()),
};
```

### **Rust CLI Flow**
```rust
// CLI loads existing keys from OS keystore
fn load_node_keys(&self, config: &CliNodeConfig) -> Result<NodeKeyManager> {
    let key_store = OsKeyStore::new(self.logger.clone());
    let serialized_state = key_store.retrieve_node_keys(&config.keys_name)?;
    let node_state = serde_cbor::from_slice(&serialized_state)?;
    let node_key_manager = NodeKeyManager::from_state(node_state, key_logger)?;
    Ok(node_key_manager)
}

// CLI creates Runar config with loaded keys
fn create_runar_config(
    &self,
    config: &CliNodeConfig,
    node_key_manager: NodeKeyManager,
) -> Result<NodeConfig> {
    let mut runar_config = NodeConfig::new(config.default_network_id.clone());
    runar_config = runar_config
        .with_key_manager(Arc::new(RwLock::new(node_key_manager)));
    Ok(runar_config)
}
```

## 🏗️ **Corrected TypeScript Design (Matching Rust)**

### **1. NodeConfig (Matching Rust Structure)**

```typescript
// runar-ts-node/src/config.ts
import type { Keys } from 'runar-nodejs-api';

export class NodeConfig {
  public readonly defaultNetworkId: string;
  public readonly networkIds: string[];
  public readonly requestTimeoutMs: number;
  private keyManager?: Keys; // Already initialized Keys instance from FFI

  constructor(defaultNetworkId: string) {
    this.defaultNetworkId = defaultNetworkId;
    this.networkIds = [];
    this.requestTimeoutMs = 30000;
  }

  // Match Rust with_key_manager() method
  withKeyManager(keyManager: Keys): this {
    this.keyManager = keyManager;
    return this;
  }

  withAdditionalNetworks(networkIds: string[]): this {
    this.networkIds = [...networkIds];
    return this;
  }

  withRequestTimeout(timeoutMs: number): this {
    this.requestTimeoutMs = timeoutMs;
    return this;
  }

  // Getter for key manager (used by Node constructor)
  getKeyManager(): Keys | undefined {
    return this.keyManager;
  }
}
```

### **2. Node (Matching Rust Constructor)**

```typescript
// runar-ts-node/src/index.ts
import { KeysManagerWrapper } from './keys_manager_wrapper';
import { SerializationContext } from 'runar-ts-serializer';

export class Node {
  private readonly networkId: string;
  private readonly registry = new ServiceRegistry();
  private readonly logger: Logger;
  private readonly keysManager: Keys; // Store the extracted keys manager
  private readonly keysWrapper: KeysManagerWrapper; // Wrapper for serializer
  private readonly config: NodeConfig;
  private running = false;

  constructor(config: NodeConfig) {
    // Extract the key manager from config (matching Rust)
    const keysManager = config.getKeyManager();
    if (!keysManager) {
      throw new Error('Failed to load node credentials. Use withKeyManager() method.');
    }

    this.config = config;
    this.networkId = config.defaultNetworkId;
    this.keysManager = keysManager;
    
    // Create wrapper for serializer (matching Rust NodeKeyManagerWrapper)
    this.keysWrapper = new KeysManagerWrapper(this.keysManager);
    
    this.logger = LoggerClass.newRoot(ComponentEnum.Node).setNodeId(this.networkId);
  }

  // Method to get keys wrapper for serializer (matching Rust pattern)
  getKeysWrapper(): KeysManagerWrapper {
    return this.keysWrapper;
  }

  // Method to create serialization context (matching Rust pattern)
  createSerializationContext(
    networkId: string, 
    profilePublicKey?: Buffer
  ): SerializationContext {
    return {
      keystore: this.keysWrapper,
      resolver: this.labelResolver, // Would need to implement this
      networkId,
      profilePublicKey
    };
  }

  // ... rest of Node implementation
}
```

### **3. Keys Manager Wrapper (Matching Rust Wrapper)**

```typescript
// runar-ts-node/src/keys_manager_wrapper.ts
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
    data: Buffer, 
    networkId: string | null, 
    profilePublicKeys: Buffer[]
  ): Buffer {
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
```

### **4. CLI Configuration Manager (Matching Rust CLI)**

```typescript
// runar-ts-node/src/cli_config_manager.ts
import { NodeConfig } from './config';
import type { Keys } from 'runar-nodejs-api';

export class NodeConfigManager {
  private configPath: string;
  
  constructor(configPath: string) {
    this.configPath = configPath;
  }
  
  // Load existing config from disk (matching Rust CLI pattern)
  async loadConfig(): Promise<NodeConfig | null> {
    try {
      const configData = await fs.readFile(this.configPath, 'utf8');
      const config = JSON.parse(configData);
      
      // Load and initialize keysManager based on platform
      const keysManager = await this.loadNodeKeys(config.keysName);
      
      const nodeConfig = new NodeConfig(config.defaultNetworkId)
        .withKeyManager(keysManager)
        .withAdditionalNetworks(config.networkIds || [])
        .withRequestTimeout(config.requestTimeoutMs || 30000);
      
      return nodeConfig;
    } catch (error) {
      // No existing config found
      return null;
    }
  }
  
  // Create new config during setup process (matching Rust CLI pattern)
  async createConfig(
    defaultNetworkId: string,
    platform: 'mobile' | 'node',
    keysName: string
  ): Promise<NodeConfig> {
    // Initialize keysManager for the specified platform
    const keysManager = await this.initializeKeysManager(platform, keysName);
    
    const config = new NodeConfig(defaultNetworkId)
      .withKeyManager(keysManager);
    
    // Save config to disk
    await this.saveConfig(config, keysName);
    
    return config;
  }
  
  // Load node keys from OS keystore (matching Rust load_node_keys)
  private async loadNodeKeys(keysName: string): Promise<Keys> {
    // This would use the OS keystore equivalent in TypeScript
    // For now, we'll assume keys are already initialized
    const keys = new Keys(); // from runar-nodejs-api
    
    // Load existing state from OS keystore
    // This matches Rust: OsKeyStore::new().retrieve_node_keys()
    const serializedState = await this.retrieveFromOSKeystore(keysName);
    
    // Deserialize the node state (CBOR)
    // This matches Rust: serde_cbor::from_slice(&serialized_state)
    const nodeState = this.deserializeNodeState(serializedState);
    
    // Create keys manager from state
    // This matches Rust: NodeKeyManager::from_state(node_state, key_logger)
    keys.loadFromState(nodeState);
    
    return keys;
  }
  
  // Initialize keysManager based on platform (matching Rust pattern)
  private async initializeKeysManager(platform: 'mobile' | 'node', keysName: string): Promise<Keys> {
    const keys = new Keys(); // from runar-nodejs-api
    
    if (platform === 'mobile') {
      keys.initAsMobile();
      // Initialize mobile-specific features
      await keys.mobileInitializeUserRootKey();
    } else {
      keys.initAsNode();
      // Initialize node-specific features if needed
    }
    
    // Save to OS keystore
    await this.saveToOSKeystore(keysName, keys);
    
    return keys;
  }
  
  // Save config to disk (matching Rust pattern)
  private async saveConfig(config: NodeConfig, keysName: string): Promise<void> {
    const configData = {
      defaultNetworkId: config.defaultNetworkId,
      networkIds: config.networkIds,
      keysName,
      requestTimeoutMs: config.requestTimeoutMs,
      // Note: keysManager instance is not serialized, only the keysName
    };
    
    await fs.writeFile(this.configPath, JSON.stringify(configData, null, 2));
  }
  
  // Helper methods for OS keystore operations
  private async retrieveFromOSKeystore(keysName: string): Promise<Buffer> {
    // Implementation would depend on OS keystore library
    throw new Error('OS keystore integration not implemented yet');
  }
  
  private async saveToOSKeystore(keysName: string, keys: Keys): Promise<void> {
    // Implementation would depend on OS keystore library
    throw new Error('OS keystore integration not implemented yet');
  }
  
  private deserializeNodeState(serializedState: Buffer): any {
    // Implementation would depend on CBOR library
    throw new Error('CBOR deserialization not implemented yet');
  }
}
```

### **5. Usage Patterns (Matching Rust)**

#### **A. CLI Flow: Load/Create Config with Initialized KeysManager**

```typescript
// CLI Configuration Manager handles loading/creating config (matching Rust CLI)
const configManager = new NodeConfigManager('./node-config.json');

// Try to load existing config
let config = await configManager.loadConfig();

if (!config) {
  // No existing config - run setup process (matching Rust CLI)
  logger.info('No existing configuration found. Running setup...');
  
  const defaultNetworkId = 'primary-network';
  const platform = 'node'; // or 'mobile' based on user choice
  const keysName = 'my-node-keys';
  
  // Create new config with initialized keysManager (matching Rust CLI)
  config = await configManager.createConfig(
    defaultNetworkId,
    platform,
    keysName
  );
  
  logger.info('Configuration created successfully!');
} else {
  logger.info('Existing configuration loaded.');
}

// Now create Node with ready-to-use config (matching Rust Node::new)
const node = new Node(config);

// Node already has initialized keysManager and wrapper
const keysWrapper = node.getKeysWrapper(); // KeysManagerWrapper

// Create serialization context (matching Rust pattern)
const context: SerializationContext = node.createSerializationContext(
  'network-id',
  profilePublicKey
);

// Serialize with encryption
const serialized = await anyValue.serialize(context);
```

#### **B. Serializer Tests Create Keystore Directly**

```typescript
// For serializer tests - create keystore directly like CLI will do
describe('Serializer encryption tests', () => {
  it('encrypts and decrypts using node keys', async () => {
    // Create keystore directly (like CLI will do)
    const keys = new Keys(); // from runar-nodejs-api
    keys.initAsNode();
    
    // Create wrapper (matching Rust NodeKeyManagerWrapper)
    const keysWrapper = new KeysManagerWrapper(keys);
    
    // Initialize node-specific features
    const networkId = 'test-network';
    const profileKey = Buffer.from('test-profile-key');
    
    // Use common interface - no platform awareness needed!
    const encrypted = keysWrapper.encryptWithEnvelope(data, networkId, [profileKey]);
    const decrypted = keysWrapper.decryptEnvelope(encrypted);
    
    expect(decrypted).toEqual(data);
  });
});
```

#### **C. Platform-Specific Code Uses Native API Directly**

```typescript
// For platform-specific functionality, use native API directly (matching Rust pattern)
const nativeKeys = new Keys(); // Direct native API
nativeKeys.initAsNode();

// Platform-specific operations (matching Rust direct calls)
const csr = nativeKeys.nodeGenerateCsr();
const nodeId = nativeKeys.nodeGetNodeId();
const agreementKey = nativeKeys.nodeGetAgreementPublicKey();

// Send CSR to mobile for certificate
await sendCSRToMobile(csr, nodeId, agreementKey);
```

## 🎯 **Key Benefits of This Rust-Aligned Design**

1. **Exact Rust Pattern**: Follows the exact same structure and flow as Rust
2. **Proper Separation**: NodeConfig receives keys, Node extracts and wraps them
3. **Wrapper Pattern**: Uses the same wrapper approach as Rust for serializer integration
4. **CLI Integration**: Matches the Rust CLI pattern for loading/creating configs
5. **Serialization Context**: Creates SerializationContext exactly like Rust
6. **Platform Awareness**: Maintains platform-specific vs common functionality separation

## 📝 **Implementation Steps (Aligned with Rust)**

### **Phase 1: Update NodeConfig (Match Rust Structure)**
1. **Add withKeyManager() method** matching Rust `with_key_manager()`
2. **Store keyManager privately** with getter method
3. **Update constructor** to match Rust pattern

### **Phase 2: Create KeysManagerWrapper (Match Rust Wrapper)**
1. **Implement CommonKeysInterface** for native Keys instance
2. **Route to appropriate native methods** based on platform
3. **Match Rust wrapper behavior** exactly

### **Phase 3: Update Node (Match Rust Constructor)**
1. **Extract keysManager from config** like Rust does
2. **Create KeysManagerWrapper** for serializer use
3. **Provide createSerializationContext method** matching Rust pattern

### **Phase 4: Create CLI Config Manager (Match Rust CLI)**
1. **Implement loadConfig/createConfig** methods matching Rust CLI
2. **Handle OS keystore integration** for loading/saving keys
3. **Match Rust CLI flow** exactly

### **Phase 5: Update Serializer Integration**
1. **Ensure SerializationContext** works with KeysManagerWrapper
2. **Test encryption integration** with the wrapper
3. **Verify Rust compatibility** in serialization flow

This corrected design now **exactly matches the Rust implementation** where NodeConfig receives initialized keys, Node extracts and wraps them, and the serializer uses the wrapper through SerializationContext - maintaining the same data flow and architecture as the Rust codebase.
