import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NodeConfig, Node } from '../src';

describe('NodeConfig', () => {
  it('builds config with defaults and overrides', () => {
    const cfg = NodeConfig.new('net-1')
      .withNetworkIds(['x', 'y'])
      .withRequestTimeoutMs(10_000)
      .withTransportOptions({ a: 1 })
      .withDiscoveryOptions({ b: 2 });
    assert.equal(cfg.defaultNetworkId, 'net-1');
    assert.deepEqual(cfg.networkIds, ['x', 'y']);
    assert.equal(cfg.requestTimeoutMs, 10_000);
    assert.deepEqual(cfg.transportOptions, { a: 1 });
    assert.deepEqual(cfg.discoveryOptions, { b: 2 });
  });

  it('instantiates Node from config without keys', () => {
    const cfg = NodeConfig.new('net-2').withTransportOptions({});
    const n = Node.fromConfig({
      defaultNetworkId: cfg.defaultNetworkId,
      transportOptions: cfg.transportOptions,
    });
    assert.ok(n);
  });
});
