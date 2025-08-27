# Current Lifecycle Analysis: Serializer, Node, and Keys Manager

## 🎯 **Overview**

This document analyzes the current lifecycle and architecture of how the **serializer**, **node**, and **keys manager** components interact and are wired together in the `runar-ts` ecosystem.

## 🏗️ **Current Architecture**

### **Component Hierarchy**
```
runar-ts-node (Main Node)
├── ServiceRegistry (Manages all services)
├── KeysService (Uses KeysDelegate)
│   └── KeysDelegate (Interface to native Keys)
├── RegistryService (Internal service)
└── Other Services (MathService, etc.)

runar-ts-serializer (Serialization Engine)
├── AnyValue (Core serialization class)
├── TypeRegistry (Type registration system)
└── Wire Format (CBOR + encryption)

runar-ts-decorators (Encryption Decorators)
├── @Plain (No-op encryption)
├── @Encrypt (Real encryption)
└── RunarKeysAdapter (Encryption adapter)
```

## 🔄 **Current Lifecycle Flow**

### **1. Node Initialization**
```typescript
// runar-ts-node/src/index.ts
export class Node {
  private readonly registry = new ServiceRegistry();
  
  constructor(networkId = 'default') {
    this.networkId = networkId;
    this.logger = LoggerClass.newRoot(ComponentEnum.Node).setNodeId(networkId);
  }

  addKeysService(delegate: { ensureSymmetricKey(name: string): Promise<Uint8Array> }): void {
    this.addService(new KeysService(delegate));
  }

  async start(): Promise<void> {
    // 1. Start internal registry service first
    const reg = new RegistryService(this.getLocalServicesSnapshot);
    reg.setNetworkId(this.networkId);
    const regCtx = new NodeLifecycleContextImpl(this.networkId, reg.path(), this.logger, this);
    await reg.init(regCtx);
    this.addService(reg);

    // 2. Initialize all other services
    for (const entry of this.registry.getLocalServices()) {
      const svc = entry.service;
      if (svc === reg) continue; // already init
      svc.setNetworkId(this.networkId);
      const ctx = new NodeLifecycleContextImpl(this.networkId, svc.path(), this.logger, this);
      await svc.init(ctx);
      this.registry.updateServiceState(svc.path(), ServiceState.Initialized);
    }

    // 3. Start all services
    for (const entry of this.registry.getLocalServices()) {
      const svc = entry.service;
      const ctx = new NodeLifecycleContextImpl(this.networkId, svc.path(), this.logger, this);
      await svc.start(ctx);
      this.registry.updateServiceState(svc.path(), ServiceState.Running);
    }

    this.running = true;
  }
}
```

### **2. Keys Service Lifecycle**
```typescript
// runar-ts-node/src/keys_service.ts
export class KeysService implements AbstractService {
  constructor(private readonly delegate: KeysDelegate) {}

  async init(context: NodeLifecycleContext): Promise<Result<void, string>> {
    const result = await context.registerAction(
      'ensure_symmetric_key',
      async (payload: Option<AnyValue>, context: RequestContext) => {
        if (!payload) {
          return err('Expected payload for symmetric key label');
        }

        const stringResult = payload.as<string>();
        if (!stringResult.ok) {
          return err('Expected string payload for symmetric key label');
        }

        const label = stringResult.value;
        const outBytes = await this.delegate.ensureSymmetricKey(label);
        return ok(AnyValue.from(outBytes));
      }
    );

    if (!result.ok) {
      return err(`Failed to register action: ${result.error}`);
    }

    return ok(undefined);
  }
}
```

### **3. Keys Delegate Pattern**
```typescript
// runar-ts-node/src/keys_delegate.ts
export interface KeysDelegate {
  ensureSymmetricKey(keyName: string): Promise<Uint8Array>;
}

export class NapiKeysDelegate implements KeysDelegate {
  private readonly keys: NapiKeys; // Native Keys instance
  
  constructor(keys: NapiKeys) {
    this.keys = keys;
  }

  async ensureSymmetricKey(keyName: string): Promise<Uint8Array> {
    const out: Buffer = this.keys.ensureSymmetricKey(keyName);
    return new Uint8Array(out);
  }
}
```

### **4. Serializer Registry System**
```typescript
// runar-ts-serializer/src/registry.ts
const typeNameToEntry = new Map<string, TypeEntry>();

export function registerType(typeName: string, entry: TypeEntry): void {
  typeNameToEntry.set(typeName, entry);
}

export function resolveType(typeName: string): TypeEntry | undefined {
  return typeNameToEntry.get(typeName);
}

// Wire name registry (Rust type name -> wire name)
const rustTypeToWireName = new Map<string, string>();

export function registerWireName(rustTypeName: string, wireName: string): void {
  rustTypeToWireName.set(rustTypeName, wireName);
}
```

### **5. Serializer Encryption Integration**
```typescript
// runar-ts-serializer/src/index.ts
export class AnyValue<T = unknown> {
  serialize(context?: any): Result<Uint8Array> | Promise<Result<Uint8Array>> {
    // Check if we need async serialization (has encryption methods)
    const hasEncryptionMethods =
      this.value && typeof this.value === 'object' && 'encryptWithKeystore' in this.value;

    if (hasEncryptionMethods && context?.keystore) {
      // Return a promise for async encryption
      return this.serializeAsync(context);
    } else {
      // Return synchronous result
      return this.serializeSync(context);
    }
  }

  private async serializeAsync(context?: any): Promise<Result<Uint8Array>> {
    // ... async encryption logic
    const bytesResult = this.serializeFn(this.value, context?.keystore, context?.resolver);
    const bytes = bytesResult instanceof Promise ? await bytesResult : bytesResult;
    // ... build wire format
  }
}
```

## 🔗 **Current Wiring Points**

### **A. Node → Keys Service → Keys Delegate**
```typescript
// Current usage pattern
const node = new Node('net');
const delegate = new MockKeysDelegate(); // or NapiKeysDelegate
node.addService(new KeysService(delegate));
await node.start();

// Keys service registers action: '$keys/ensure_symmetric_key'
const result = await node.request('$keys/ensure_symmetric_key', 'label');
```

### **B. Serializer → Encryption Context**
```typescript
// Serializer expects encryption context with keystore
const context = {
  keystore: someKeystore, // Must have encryptWithEnvelope/decryptEnvelope methods
  resolver: someResolver
};

const serialized = await anyValue.serialize(context);
```

### **C. Decorators → RunarKeysAdapter**
```typescript
// runar-ts-decorators/src/index.ts
export class RunarKeysAdapter implements RunarKeysAdapter {
  constructor(private keys: any, private managerType: 'mobile' | 'node' = 'node') {}

  async encrypt(data: Uint8Array, keyInfo: LabelKeyInfo): Promise<Uint8Array> {
    if (keyInfo.networkId && keyInfo.profilePublicKeys.length > 0) {
      // Use envelope encryption
      return this.keys.encryptWithEnvelope(data, keyInfo.networkId, keyInfo.profilePublicKeys);
    } else {
      // Fall back to local encryption
      return this.keys.encryptLocalData(data);
    }
  }
}
```

## ⚠️ **Current Gaps and Issues**

### **1. Missing Keys Manager Integration**
- **Node** creates `KeysService` with `KeysDelegate`
- **KeysDelegate** only exposes `ensureSymmetricKey`
- **No integration** with the new `mobileEncryptWithEnvelope`/`nodeEncryptWithEnvelope` methods
- **No platform initialization** (`initAsMobile`/`initAsNode`)

### **2. Serializer Context Mismatch**
- **Serializer** expects `context.keystore` with encryption methods
- **Current KeysService** doesn't provide encryption context
- **No connection** between node's keys and serializer's encryption needs

### **3. Platform Awareness Missing**
- **Node** doesn't know if it's mobile or node platform
- **KeysService** doesn't initialize platform-specific key manager
- **No routing** to mobile vs node encryption methods

### **4. Lifecycle Disconnect**
- **Node** starts services but doesn't initialize keys manager
- **Serializer** needs encryption context but node doesn't provide it
- **Decorators** need keys manager but aren't connected to node

## 🎯 **Required Changes for Simplified Keys Manager**

### **1. Update Node to Create Keys Manager**
```typescript
// runar-ts-node/src/index.ts
export class Node {
  private readonly keysManager?: CommonKeysInterface; // NEW
  
  constructor(networkId = 'default', keysManager?: CommonKeysInterface) {
    this.networkId = networkId;
    this.keysManager = keysManager; // NEW
    // ... existing code
  }

  // NEW: Method to get keys manager for services
  getKeysManager(): CommonKeysInterface | undefined {
    return this.keysManager;
  }

  // NEW: Method to create keys manager from native API
  static withKeysManager(networkId: string, platform: 'mobile' | 'node'): Node {
    const keysManager = createKeysManager(platform);
    return new Node(networkId, keysManager);
  }
}
```

### **2. Update KeysService to Use Keys Manager**
```typescript
// runar-ts-node/src/keys_service.ts
export class KeysService implements AbstractService {
  constructor(
    private readonly delegate: KeysDelegate,
    private readonly keysManager?: CommonKeysInterface // NEW
  ) {}

  async init(context: NodeLifecycleContext): Promise<Result<void, string>> {
    // Register existing symmetric key action
    const result = await context.registerAction(
      'ensure_symmetric_key',
      async (payload: Option<AnyValue>, context: RequestContext) => {
        // ... existing code
      }
    );

    // NEW: Register encryption actions if keys manager is available
    if (this.keysManager) {
      const encryptResult = await context.registerAction(
        'encrypt_with_envelope',
        async (payload: Option<AnyValue>, context: RequestContext) => {
          // ... encryption logic using keysManager
        }
      );

      const decryptResult = await context.registerAction(
        'decrypt_envelope',
        async (payload: Option<AnyValue>, context: RequestContext) => {
          // ... decryption logic using keysManager
        }
      );
    }

    return ok(undefined);
  }
}
```

### **3. Update Node Factory Methods**
```typescript
// runar-ts-node/src/index.ts
export class Node {
  // NEW: Factory method for mobile platform
  static createMobile(networkId: string): Node {
    const keysManager = createKeysManager('mobile');
    return new Node(networkId, keysManager);
  }

  // NEW: Factory method for node platform
  static createNode(networkId: string): Node {
    const keysManager = createKeysManager('node');
    return new Node(networkId, keysManager);
  }

  // NEW: Factory method with custom keys manager
  static withCustomKeys(networkId: string, keysManager: CommonKeysInterface): Node {
    return new Node(networkId, keysManager);
  }
}
```

### **4. Update Serialization Context**
```typescript
// runar-ts-serializer/src/index.ts
export interface SerializationContext {
  keystore?: CommonKeysInterface; // Updated to use common interface
  resolver?: any;
}

// Update AnyValue to use CommonKeysInterface
export class AnyValue<T> {
  serialize(context?: SerializationContext): Result<Uint8Array> | Promise<Result<Uint8Array>> {
    // Check if we need async serialization (has encryption methods)
    const hasEncryptionMethods = this.value && 
      typeof this.value === 'object' && 
      'encryptWithKeystore' in this.value;

    if (hasEncryptionMethods && context?.keystore) {
      // Return a promise for async encryption
      return this.serializeAsync(context);
    } else {
      // Return synchronous result
      return this.serializeSync(context);
    }
  }
}
```

## 🔄 **New Lifecycle Flow**

### **1. Node Creation with Keys Manager**
```typescript
// Option A: Create with platform-specific keys manager
const mobileNode = Node.createMobile('mobile-network');
const nodeNode = Node.createNode('node-network');

// Option B: Create with custom keys manager
const customKeys = createKeysManager('mobile');
const customNode = Node.withCustomKeys('custom-network', customKeys);

// Option C: Create with native API for platform-specific code
const nativeKeys = createNativeKeys();
nativeKeys.initAsNode();
const nativeNode = new Node('native-network');
nativeNode.addKeysService(new NapiKeysDelegate(nativeKeys));
```

### **2. Service Initialization with Keys Context**
```typescript
// KeysService now has access to keys manager
export class KeysService implements AbstractService {
  constructor(
    private readonly delegate: KeysDelegate,
    private readonly keysManager?: CommonKeysInterface
  ) {}

  async init(context: NodeLifecycleContext): Promise<Result<void, string>> {
    // Register encryption actions if keys manager available
    if (this.keysManager) {
      await context.registerAction('encrypt_with_envelope', async (payload, ctx) => {
        // Use keysManager.encryptWithEnvelope()
      });
      
      await context.registerAction('decrypt_envelope', async (payload, ctx) => {
        // Use keysManager.decryptEnvelope()
      });
    }

    // Register existing actions
    await context.registerAction('ensure_symmetric_key', async (payload, ctx) => {
      // Use delegate.ensureSymmetricKey()
    });
  }
}
```

### **3. Serialization with Keys Context**
```typescript
// Serializer gets keys context from node
const node = Node.createMobile('mobile-network');
const keysManager = node.getKeysManager();

// Create serialization context
const context: SerializationContext = {
  keystore: keysManager, // CommonKeysInterface
  resolver: someResolver
};

// Serialize with encryption
const serialized = await anyValue.serialize(context);
```

### **4. Platform-Specific Code with Native API**
```typescript
// For platform-specific functionality, use native API directly
const nativeKeys = createNativeKeys();
nativeKeys.initAsNode();

// Platform-specific operations
const csr = nativeKeys.nodeGenerateCsr();
const nodeId = nativeKeys.nodeGetNodeId();
const agreementKey = nativeKeys.nodeGetAgreementPublicKey();

// Send CSR to mobile for certificate
await sendCSRToMobile(csr, nodeId, agreementKey);
```

## 📋 **Implementation Steps**

### **Phase 1: Update Node Package**
1. **Add keys manager support** to Node class
2. **Create factory methods** for mobile/node platforms
3. **Update KeysService** to use keys manager when available
4. **Maintain backward compatibility** with existing KeysDelegate

### **Phase 2: Update Serializer Package**
1. **Update SerializationContext** to use CommonKeysInterface
2. **Ensure AnyValue** works with new interface
3. **Test encryption integration** with keys manager

### **Phase 3: Update Decorators Package**
1. **Update RunarKeysAdapter** to use CommonKeysInterface
2. **Test encryption/decryption** with keys manager
3. **Ensure compatibility** with existing decorators

### **Phase 4: Integration Testing**
1. **Test complete lifecycle** from node creation to serialization
2. **Verify platform-specific** vs common functionality
3. **Test backward compatibility** with existing code

## 🎯 **Key Benefits of This Approach**

1. **Clear Separation**: Common interface for serialization, native API for platform-specific code
2. **Lifecycle Integration**: Keys manager created by node, available to all services
3. **Backward Compatibility**: Existing KeysDelegate pattern still works
4. **Platform Awareness**: Node knows its platform and provides appropriate keys manager
5. **Serialization Integration**: Serializer gets encryption context from node's keys manager
6. **Flexible Usage**: Can use common interface or native API as needed

## 🔍 **Current State vs Required State**

| Component | Current State | Required State |
|-----------|---------------|----------------|
| **Node** | Creates KeysService with KeysDelegate | Creates KeysService with KeysManager + KeysDelegate |
| **KeysService** | Only symmetric key operations | Encryption + symmetric key operations |
| **Serializer** | Expects keystore context | Gets keystore context from node |
| **Decorators** | Uses RunarKeysAdapter | Uses RunarKeysAdapter with CommonKeysInterface |
| **Platform** | No platform awareness | Platform-aware with appropriate keys manager |

This analysis shows that the current architecture is **close but missing key integration points** between the node's keys management and the serializer's encryption needs. The simplified keys manager design will bridge these gaps while maintaining the existing patterns.
