import { describe, it, expect } from 'bun:test';
import { Node, NodeConfig } from '../src';
import { AnyValue } from 'runar-ts-serializer';
import { AbstractService, LifecycleContext } from '../src/core';
// REMOVED: LoopbackRemoteAdapter import - not in Rust API
import { ok, err } from 'runar-ts-common';

class EchoService implements AbstractService {
  private _net?: string;
  name() {
    return 'Echo';
  }
  version() {
    return '1.0.0';
  }
  path() {
    return 'echo';
  }
  description() {
    return 'Echo';
  }
  networkId() {
    return this._net;
  }
  setNetworkId(n: string) {
    this._net = n;
  }
  async init(ctx: LifecycleContext): Promise<Result<void, string>> {
    const result = await ctx.registerAction('ping', async (payload, context) => {
      const r = payload.as<{ msg: string }>();
      if (!r.ok) {
        return err('Expected object with msg property');
      }
      return ok(AnyValue.from({ pong: r.value.msg }));
    });

    if (!result.ok) {
      throw new Error(`Failed to register action: ${result.error}`);
    }
    return ok(undefined);
  }
  async start(): Promise<Result<void, string>> {
    return ok(undefined);
  }
  async stop(): Promise<Result<void, string>> {
    return ok(undefined);
  }
}

describe('Node path-based APIs', () => {
  it('handles requestPath locally', async () => {
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
    const config = new NodeConfig('net').withKeyManager(mockKeys as any);
    const n = new Node(config);
    n.addService(new EchoService());
    await n.start();
    const result = await n.request('echo/ping', { msg: 'hi' });
    expect(result.ok).toBe(true);
    const resp = result.value.as<{ pong: string }>();
    expect(resp.ok).toBe(true);
    expect(resp.value.pong).toBe('hi');
    await n.stop();
  });

  // REMOVED: Remote fallback test - not in Rust API (only local services)
});
