import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NodeConfig } from '../src/config.js';
import { Keys } from 'runar-nodejs-api';

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
    const keys = new Keys();
    keys.setPersistenceDir('/tmp/runar-keys-test-config');
    keys.enableAutoPersist(true);
    keys.initAsNode();

    const config = new NodeConfig('test-network').withKeyManager(keys);

    assert.equal(config.getKeyManager(), keys);
  });

  it('should set requestTimeout using withRequestTimeout', () => {
    const config = new NodeConfig('test-network').withRequestTimeout(60000);

    assert.equal(config.requestTimeoutMs, 60000);
  });

  it('should support method chaining', () => {
    const keys = new Keys();
    keys.setPersistenceDir('/tmp/runar-keys-test-config-2');
    keys.enableAutoPersist(true);
    keys.initAsNode();

    const config = new NodeConfig('test-network')
      .withKeyManager(keys)
      .withRequestTimeout(45000)
      .withAdditionalNetworks(['network1', 'network2']);

    assert.equal(config.defaultNetworkId, 'test-network');
    assert.equal(config.getKeyManager(), keys);
    assert.equal(config.requestTimeoutMs, 45000);
    assert.deepEqual(config.networkIds, ['network1', 'network2']);
  });
});
