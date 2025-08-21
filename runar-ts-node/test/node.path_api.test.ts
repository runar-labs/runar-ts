import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Node } from '../src';
import { AnyValue } from 'runar-ts-serializer';
import { AbstractService, LifecycleContext } from 'runar-ts-common';
import { LoopbackRemoteAdapter } from '../src/remote';

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
  async init(ctx: LifecycleContext): Promise<void> {
    ctx.addActionHandler('ping', async req => {
      const av = AnyValue.fromBytes<{ msg: string }>(req.payload);
      const r = av.as<{ msg: string }>();
      const out = AnyValue.from({ pong: r.ok ? r.value.msg : '' }).serialize();
      return { ok: true, requestId: req.requestId, payload: out.ok ? out.value : new Uint8Array() };
    });
  }
  async start(): Promise<void> {}
  async stop(): Promise<void> {}
}

describe('Node path-based APIs', () => {
  it('handles requestPath locally', async () => {
    const n = new Node('net');
    n.addService(new EchoService());
    await n.start();
    const resp = await n.requestPath<{ msg: string }, { pong: string }>('echo/ping', { msg: 'hi' });
    assert.equal(resp.pong, 'hi');
    await n.stop();
  });

  it('handles requestPath via remote fallback', async () => {
    const n = new Node('net');
    n.setRemoteAdapter(
      new LoopbackRemoteAdapter(async (_path, payload) => {
        const r = AnyValue.fromBytes<{ msg: string }>(payload).as<{ msg: string }>();
        const out = AnyValue.from({ pong: r.ok ? r.value.msg.toUpperCase() : '' }).serialize();
        return out.ok ? out.value : new Uint8Array();
      })
    );
    await n.start();
    const resp = await n.requestPath<{ msg: string }, { pong: string }>('echo/ping', { msg: 'hi' });
    assert.equal(resp.pong, 'HI');
    await n.stop();
  });
});
