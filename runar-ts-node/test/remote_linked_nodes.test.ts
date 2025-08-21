import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Node } from '../src';
import { LinkedNodesRemoteAdapter } from '../src/remote';
import { AbstractService, LifecycleContext } from 'runar-ts-common';
import { AnyValue } from 'runar-ts-serializer';

class MulService implements AbstractService {
  private _net?: string;
  name() { return 'Mul'; }
  version() { return '1.0.0'; }
  path() { return 'mul'; }
  description() { return 'Multiply'; }
  networkId() { return this._net; }
  setNetworkId(n: string) { this._net = n; }
  async init(ctx: LifecycleContext): Promise<void> {
    ctx.addActionHandler('times', async (req) => {
      const r = AnyValue.fromBytes<{ a: number; b: number }>(req.payload).as<{ a: number; b: number }>();
      const { a, b } = r.ok ? r.value : { a: 0, b: 0 };
      const out = AnyValue.from({ p: a * b }).serialize();
      return { ok: true, requestId: req.requestId, payload: out.ok ? out.value : new Uint8Array() };
    });
  }
  async start(): Promise<void> {}
  async stop(): Promise<void> {}
}

describe('LinkedNodesRemoteAdapter', () => {
  it('routes requests and publishes via linked nodes', async () => {
    const a = new Node('net');
    const b = new Node('net');
    b.addService(new MulService());

    a.setRemoteAdapter(new LinkedNodesRemoteAdapter({
      requestPath: (path: string, payload: any) => b.requestPath(path, payload),
      publishPath: (path: string, payload: any) => b.publishPath(path, payload),
    }));

    await a.start();
    await b.start();

    const r = await a.requestPath<{ a: number; b: number }, { p: number }>('mul/times', { a: 3, b: 4 });
    assert.equal(r.p, 12);

    await a.stop();
    await b.stop();
  });
});


