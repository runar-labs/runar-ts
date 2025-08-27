import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NodeConfig } from '../src/config.js';
import type { Keys } from 'runar-nodejs-api';

// Mock Keys class for testing
class MockKeys {
  constructor() {}
}

describe('NodeConfig', () => {
  it('should create config with default values', () => {
    const config = NodeConfig.new();
    
    assert.equal(config.defaultNetworkId, undefined);
    assert.deepEqual(config.networkIds, []);
    assert.equal(config.requestTimeoutMs, 30000);
    assert.equal(config.keysManager, undefined);
    assert.equal(config.platform, undefined);
    assert.equal(config.keyStorePath, undefined);
  });

  it('should set defaultNetworkId using withDefaultNetworkId', () => {
    const config = NodeConfig.new()
      .withDefaultNetworkId('test-network');
    
    assert.equal(config.defaultNetworkId, 'test-network');
  });

  it('should set keysManager using withKeysManager', () => {
    const mockKeys = new MockKeys();
    const config = NodeConfig.new()
      .withDefaultNetworkId('test-network')
      .withKeysManager(mockKeys as any);
    
    assert.equal(config.keysManager, mockKeys);
  });

  it('should set platform using withPlatform', () => {
    const config = NodeConfig.new()
      .withDefaultNetworkId('test-network')
      .withPlatform('mobile');
    
    assert.equal(config.platform, 'mobile');
  });

  it('should set keyStorePath using withKeyStorePath', () => {
    const config = NodeConfig.new()
      .withDefaultNetworkId('test-network')
      .withKeyStorePath('/path/to/keystore');
    
    assert.equal(config.keyStorePath, '/path/to/keystore');
  });

  it('should set requestTimeoutMs using withRequestTimeoutMs', () => {
    const config = NodeConfig.new()
      .withDefaultNetworkId('test-network')
      .withRequestTimeoutMs(60000);
    
    assert.equal(config.requestTimeoutMs, 60000);
  });

  it('should set networkIds using withNetworkIds', () => {
    const config = NodeConfig.new()
      .withDefaultNetworkId('test-network')
      .withNetworkIds(['network1', 'network2']);
    
    assert.deepEqual(config.networkIds, ['network1', 'network2']);
  });

  it('should add networkId using addNetworkId', () => {
    const config = NodeConfig.new()
      .withDefaultNetworkId('test-network')
      .addNetworkId('network1')
      .addNetworkId('network2');
    
    assert.deepEqual(config.networkIds, ['network1', 'network2']);
  });

  it('should support method chaining', () => {
    const mockKeys = new MockKeys();
    const config = NodeConfig.new()
      .withDefaultNetworkId('test-network')
      .withKeysManager(mockKeys as any)
      .withPlatform('node')
      .withKeyStorePath('/path/to/keystore')
      .withRequestTimeoutMs(45000)
      .withNetworkIds(['network1', 'network2']);
    
    assert.equal(config.defaultNetworkId, 'test-network');
    assert.equal(config.keysManager, mockKeys);
    assert.equal(config.platform, 'node');
    assert.equal(config.keyStorePath, '/path/to/keystore');
    assert.equal(config.requestTimeoutMs, 45000);
    assert.deepEqual(config.networkIds, ['network1', 'network2']);
  });

  it('should set transport and discovery options', () => {
    const transportOpts = { port: 8080 };
    const discoveryOpts = { multicast: true };
    
    const config = NodeConfig.new()
      .withDefaultNetworkId('test-network')
      .withTransportOptions(transportOpts)
      .withDiscoveryOptions(discoveryOpts);
    
    assert.deepEqual(config.transportOptions, transportOpts);
    assert.deepEqual(config.discoveryOptions, discoveryOpts);
  });
});
