# Runar TypeScript Node

This package provides the TypeScript implementation of the Runar Node, which manages services, handles requests and events, and provides key management capabilities.

## NodeConfig Usage

The `NodeConfig` class follows a builder pattern with `with___` methods for configuration:

```typescript
import { NodeConfig } from 'runar-ts-node';
import { Keys } from 'runar-nodejs-api';

// Create a new configuration
const config = NodeConfig.new()
  .withDefaultNetworkId('primary-network') // Set the default network ID
  .withKeysManager(keysManager) // Set the initialized Keys instance
  .withPlatform('node') // Set platform (mobile or node)
  .withKeyStorePath('./keystore') // Set key store path
  .withRequestTimeoutMs(30000) // Set request timeout
  .withNetworkIds(['network1', 'network2']) // Add additional networks
  .withTransportOptions({ port: 8080 }) // Set transport options
  .withDiscoveryOptions({ multicast: true }); // Set discovery options

// Create Node with the configuration
const node = new Node(config);
```

## Key Features

- **Builder Pattern**: Use `with___` methods to configure the node
- **Platform Support**: Supports both 'mobile' and 'node' platforms
- **Key Management**: Integrates with the Runar Keys system
- **Service Registry**: Manages local and remote services
- **Event Handling**: Supports publish/subscribe patterns

## Required Fields

All of these fields must be set before creating a Node:

- `defaultNetworkId`: The primary network ID for the node
- `keysManager`: Must be an already initialized `Keys` instance from `runar-nodejs-api`
- `platform`: Must be either 'mobile' or 'node'
- `keyStorePath`: Path to the key store file

## Example: CLI Setup Flow

```typescript
// CLI would typically do this:
const keysManager = new Keys();
keysManager.initAsNode(); // or initAsMobile()

const config = NodeConfig.new()
  .withDefaultNetworkId('primary-network')
  .withKeysManager(keysManager)
  .withPlatform('node')
  .withKeyStorePath('./keystore');

const node = new Node(config);
```

## Migration from Old API

If you were using the old `Node` constructor:

```typescript
// Old way
const node = new Node('network-id');

// New way
const config = NodeConfig.new()
  .withDefaultNetworkId('network-id')
  .withKeysManager(keysManager)
  .withPlatform('node')
  .withKeyStorePath('./keystore');
const node = new Node(config);
```
