import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NodeConfig, Node } from '../src';

describe('NodeConfig', () => {
  it('builds config with defaults and overrides', () => {
    const cfg = new NodeConfig('net-1')
      .withAdditionalNetworks(['x', 'y'])
      .withRequestTimeout(10_000);
    assert.equal(cfg.defaultNetworkId, 'net-1');
    assert.deepEqual(cfg.networkIds, ['x', 'y']);
    assert.equal(cfg.requestTimeoutMs, 10_000);
  });

  it('instantiates Node from config with keys', () => {
    // Create a mock keys manager for testing
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

    const cfg = new NodeConfig('net-2').withKeyManager(mockKeys as any);
    const n = new Node(cfg);
    assert.ok(n);
  });
});
