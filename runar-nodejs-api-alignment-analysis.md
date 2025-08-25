# Runar NodeJS API Alignment Analysis

## Executive Summary

This document provides a comprehensive analysis of the alignment between the updated `runar-nodejs-api` package and the TypeScript packages that depend on it. The analysis reveals several critical gaps, missing methods, and architectural changes that need to be addressed to ensure full compatibility.

## Current State Analysis

### 1. Updated NodeJS API Package

The `runar-nodejs-api` package has been significantly updated with:

- **New API Structure**: Three main classes: `Keys`, `Transport`, and `Discovery`
- **Enhanced Type Definitions**: Comprehensive TypeScript definitions in `index.d.ts`
- **Modern Architecture**: Support for both mobile and node key management modes
- **Network Capabilities**: Full transport and discovery functionality

### 2. Affected TypeScript Packages

The following packages directly depend on `runar-nodejs-api`:

1. **`runar-ts-serializer`** - Uses Keys for encryption/decryption
2. **`runar-ts-node`** - Uses Keys, Transport, and Discovery for core functionality
3. **`runar-ts-decorators`** - Indirectly affected through encryption mechanisms

## Critical Gaps and Issues

### 1. Missing Methods in Current API

#### A. Removed/Deprecated Methods

- ❌ `encryptWithEnvelope()` - Referenced in `index.ts` but not in type definitions
- ❌ `registerLinuxDeviceKeystore()` - Used in tests but not in current API

#### B. Method Signature Changes

- ❌ Envelope encryption methods now require specific manager initialization
- ❌ Some methods now return `Promise<void>` instead of synchronous results

### 2. API Architecture Changes

#### A. Manager Type Initialization

- **Before**: Single key manager with mixed functionality
- **After**: Separate mobile and node managers with `initAsMobile()` and `initAsNode()`

#### B. Enhanced Error Handling

- **Before**: Basic error handling
- **After**: Comprehensive error states and validation

#### C. Network Integration

- **Before**: Basic key management
- **After**: Full network discovery and transport capabilities

## Detailed Impact Analysis

### 1. `runar-ts-serializer` Package

#### Current Usage

```typescript
// Test file uses deprecated methods
keys.registerLinuxDeviceKeystore(svc, acc);
keys.encryptLocalData(Buffer.from(body));
keys.decryptLocalData(Buffer.from(eedBytes));
```

#### Required Changes

1. **Update test files** to use new API structure
2. **Replace deprecated methods** with new envelope encryption
3. **Update encryption context** to use new key manager patterns

#### Specific Issues

- Test `encryption_envelope_roundtrip.test.ts` uses removed methods
- Encryption context expects old API patterns
- CBOR utilities may need updates for new key formats

### 2. `runar-ts-node` Package

#### Current Usage

```typescript
// Config expects Keys interface
import type { Keys } from 'runar-nodejs-api';

// KeysService uses delegate pattern
export class KeysService implements AbstractService {
  constructor(private readonly delegate: KeysDelegate) {}
}
```

#### Required Changes

1. **Update NodeConfig** to support new key manager types
2. **Enhance KeysService** to use new encryption methods
3. **Integrate Transport and Discovery** for network functionality
4. **Update NapiKeysDelegate** to match new API

#### Specific Issues

- `NodeConfig` only supports basic `Keys` interface
- `KeysService` doesn't leverage new envelope encryption
- Missing integration with `Transport` and `Discovery` classes
- No support for mobile vs node key manager modes

### 3. `runar-ts-decorators` Package

#### Current Usage

```typescript
// Uses generic keystore interface
encryptWithKeystore(keystore: any, resolver: any)
decryptWithKeystore(keystore: any)
```

#### Required Changes

1. **Update keystore interface** to support new API patterns
2. **Enhance encryption methods** to use envelope encryption
3. **Support mobile vs node modes** for different encryption strategies

## Required Implementation Changes

### 1. Immediate Fixes (Critical)

#### A. Update Type Definitions

```typescript
// Add missing method signatures
export declare class Keys {
  // ... existing methods ...

  // Add missing methods used in tests
  registerLinuxDeviceKeystore(service: string, account: string): void;

  // Update method signatures to match usage
  encryptWithEnvelope(
    data: Buffer,
    networkId: string | undefined | null,
    profilePublicKeys: Array<Buffer>
  ): Buffer;
}
```

#### B. Fix Test Dependencies

```typescript
// Update encryption_envelope_roundtrip.test.ts
// Replace deprecated methods with new API
const keys = new Keys();
keys.initAsNode(); // or initAsMobile()
// Use new envelope encryption methods
```

### 2. Architectural Updates (High Priority)

#### A. Enhanced Node Configuration

```typescript
export class NodeConfig {
  // ... existing properties ...

  // Add support for different key manager types
  keyManagerType?: 'mobile' | 'node';
  mobileOptions?: MobileKeyManagerOptions;
  nodeOptions?: NodeKeyManagerOptions;
}
```

#### B. Updated Keys Service

```typescript
export class KeysService implements AbstractService {
  // Support both mobile and node modes
  private keyManager: Keys;
  private managerType: 'mobile' | 'node';

  async init(context: NodeLifecycleContext): Promise<Result<void, string>> {
    // Initialize appropriate key manager type
    if (this.managerType === 'mobile') {
      this.keyManager.initAsMobile();
      await this.keyManager.mobileInitializeUserRootKey();
    } else {
      this.keyManager.initAsNode();
    }
  }
}
```

#### C. Transport Integration

```typescript
export class Node {
  private transport?: Transport;
  private discovery?: Discovery;

  async start(): Promise<void> {
    // Initialize transport and discovery if configured
    if (this.config.transportOptions) {
      this.transport = new Transport(this.keys, this.config.transportOptions);
      await this.transport.start();
    }

    if (this.config.discoveryOptions) {
      this.discovery = new Discovery(this.keys, this.config.discoveryOptions);
      await this.discovery.init(this.config.discoveryOptions);
      if (this.transport) {
        await this.discovery.bindEventsToTransport(this.transport);
        await this.discovery.startAnnouncing();
      }
    }
  }
}
```

### 3. Long-term Enhancements (Medium Priority)

#### A. Mobile Key Manager Support

```typescript
// Add mobile-specific functionality
export class MobileKeyManager {
  async deriveUserProfileKey(label: string): Promise<Buffer> {
    return this.keys.mobileDeriveUserProfileKey(label);
  }

  async generateNetworkDataKey(): Promise<string> {
    return this.keys.mobileGenerateNetworkDataKey();
  }
}
```

#### B. Network Discovery Integration

```typescript
// Integrate discovery for service registration
export class ServiceRegistry {
  async registerWithDiscovery(service: AbstractService): Promise<void> {
    if (this.discovery) {
      const peerInfo = this.buildPeerInfo(service);
      await this.discovery.updateLocalPeerInfo(peerInfo);
    }
  }
}
```

## Testing and Validation Requirements

### 1. Test Coverage Updates

#### A. New Test Suites Needed

- **Key Manager Mode Tests**: Mobile vs Node initialization
- **Transport Integration Tests**: Network communication
- **Discovery Tests**: Service discovery and registration
- **Envelope Encryption Tests**: Using new API methods

#### B. Updated Existing Tests

- **Encryption Tests**: Use new envelope encryption methods
- **Key Service Tests**: Support both manager types
- **Node Tests**: Include transport and discovery scenarios

### 2. Cross-Platform Validation

#### A. Platform-Specific Tests

- **Linux**: Device keystore integration
- **macOS**: Apple keystore integration
- **Windows**: Windows keystore integration

#### B. Network Transport Tests

- **QUIC Transport**: Basic connectivity
- **Peer Discovery**: Service registration
- **Message Routing**: Request/response patterns

## Migration Strategy

### Phase 1: Critical Fixes (Week 1)

1. Update type definitions to include missing methods
2. Fix failing tests with new API usage
3. Ensure basic functionality works

### Phase 2: Core Integration (Week 2-3)

1. Update Node configuration for new key manager types
2. Enhance Keys service with envelope encryption
3. Integrate basic transport functionality

### Phase 3: Full Feature Integration (Week 4-6)

1. Complete discovery integration
2. Add mobile key manager support
3. Implement comprehensive network capabilities

### Phase 4: Testing and Validation (Week 7-8)

1. Comprehensive test coverage
2. Cross-platform validation
3. Performance testing and optimization

## Risk Assessment

### High Risk

- **Breaking Changes**: New API structure may break existing code
- **Platform Dependencies**: Different keystore backends may behave differently
- **Async Operations**: New Promise-based APIs may require significant refactoring

### Medium Risk

- **Performance Impact**: New network layers may add overhead
- **Memory Usage**: Enhanced functionality may increase memory footprint
- **Testing Complexity**: More complex integration requires more comprehensive testing

### Low Risk

- **Type Safety**: Enhanced TypeScript definitions improve type safety
- **Error Handling**: Better error states improve debugging
- **Extensibility**: New architecture is more extensible

## Recommendations

### 1. Immediate Actions

1. **Freeze current development** until API alignment is complete
2. **Create migration branch** for implementing changes
3. **Update documentation** to reflect new API structure

### 2. Development Priorities

1. **Focus on core functionality** first (Keys, basic Transport)
2. **Implement discovery features** after core is stable
3. **Add mobile support** as final enhancement

### 3. Testing Strategy

1. **Unit tests** for each component
2. **Integration tests** for key workflows
3. **End-to-end tests** for complete scenarios
4. **Performance tests** for network operations

## Conclusion

The updated `runar-nodejs-api` represents a significant architectural improvement that provides enhanced security, network capabilities, and platform support. However, the migration requires careful planning and implementation to ensure compatibility and maintain functionality.

The analysis shows that while the changes are substantial, they are necessary for long-term maintainability and feature parity with the Rust implementation. The recommended phased approach will minimize disruption while ensuring a robust and feature-complete implementation.

## Appendix

### A. Current API Methods (Available)

- `Keys` class: 25+ methods for key management
- `Transport` class: 10+ methods for network communication
- `Discovery` class: 6+ methods for service discovery

### B. Missing/Deprecated Methods

- `encryptWithEnvelope()` - Needs replacement with new envelope methods
- `registerLinuxDeviceKeystore()` - Platform-specific, may need alternative

### C. New Capabilities

- Mobile key manager mode
- Node key manager mode
- Network transport layer
- Service discovery
- Enhanced encryption (envelope encryption)
- Platform-specific keystore backends
