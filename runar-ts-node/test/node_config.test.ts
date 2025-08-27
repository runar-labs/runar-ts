import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NodeConfig } from '../src/config.js';

describe('NodeConfig', () => {
  it('should create config with default values', () => {
    const config = new NodeConfig('test-network');

    assert.equal(config.defaultNetworkId, 'test-network');
    assert.deepEqual(config.networkIds, []);
    assert.equal(config.requestTimeoutMs, 30000);
    assert.equal(config.getKeyManager(), undefined);
  });

  it('should set additional networks using withAdditionalNetworks', () => {
    const config = new NodeConfig('test-network').withAdditionalNetworks(['network1', 'network2']);

    assert.deepEqual(config.networkIds, ['network1', 'network2']);
  });

  it('should set keysManager using withKeyManager', () => {
    const mockKeys = {
      initAsNode() {},
      nodeEncryptWithEnvelope: (data: Buffer) => data,
      nodeDecryptEnvelope: (data: Buffer) => data,
      ensureSymmetricKey: (name: string) => Buffer.from(name),
      setLabelMapping: () => {},
      setLocalNodeInfo: () => {},
      setPersistenceDir: () => {},
      enableAutoPersist: () => {},
      wipePersistence: async () => {},
      flushState: async () => {},
      nodeGetKeystoreState: () => 1,
      getKeystoreCaps: () => ({}),
    };

    const config = new NodeConfig('test-network').withKeyManager(mockKeys as any);

    assert.equal(config.getKeyManager(), mockKeys);
  });

  it('should set requestTimeout using withRequestTimeout', () => {
    const config = new NodeConfig('test-network').withRequestTimeout(60000);

    assert.equal(config.requestTimeoutMs, 60000);
  });

  it('should support method chaining', () => {
    const mockKeys = {
      initAsNode() {},
      nodeEncryptWithEnvelope: (data: Buffer) => data,
      nodeDecryptEnvelope: (data: Buffer) => data,
      ensureSymmetricKey: (name: string) => Buffer.from(name),
      setLabelMapping: () => {},
      setLocalNodeInfo: () => {},
      setPersistenceDir: () => {},
      enableAutoPersist: () => {},
      wipePersistence: async () => {},
      flushState: async () => {},
      nodeGetKeystoreState: () => 1,
      getKeystoreCaps: () => ({}),
    };

    const config = new NodeConfig('test-network')
      .withKeyManager(mockKeys as any)
      .withRequestTimeout(45000)
      .withAdditionalNetworks(['network1', 'network2']);

    assert.equal(config.defaultNetworkId, 'test-network');
    assert.equal(config.getKeyManager(), mockKeys);
    assert.equal(config.requestTimeoutMs, 45000);
    assert.deepEqual(config.networkIds, ['network1', 'network2']);
  });
});
