import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Node } from '../src';
import { AnyValue } from 'runar-ts-serializer';
import { AbstractService, LifecycleContext } from '../src/core';

class MathService implements AbstractService {
  private _networkId?: string;
  name(): string {
    return 'Math';
  }
  version(): string {
    return '1.0.0';
  }
  path(): string {
    return 'math';
  }
  description(): string {
    return 'Math operations';
  }
  networkId(): string | undefined {
    return this._networkId;
  }
  setNetworkId(networkId: string): void {
    this._networkId = networkId;
  }
  async init(context: LifecycleContext): Promise<void> {
    context.addActionHandler('add', async req => {
      const inRes = req.payload.as<{ a: number; b: number }>();
      const { a, b } = inRes.ok ? inRes.value : { a: 0, b: 0 };
      return { ok: true, requestId: req.requestId, payload: AnyValue.from({ sum: a + b }) };
    });
  }
  async start(_context: LifecycleContext): Promise<void> {}
  async stop(_context: LifecycleContext): Promise<void> {}
}

describe('Node local E2E', () => {
  it('handles request/response and events with retention', async () => {
    const node = new Node('testnet');
    node.addService(new MathService());
    await node.start();

    const res = await node.request<{ a: number; b: number }, { sum: number }>('math', 'add', {
      a: 2,
      b: 3,
    });
    assert.equal(res.sum, 5);

    // publish retained event before subscribe
    await node.publish('math', 'added', { sum: 5 }, { retain: true });

    const seen: number[] = [];
    const subId = node.on(
      'math',
      'added',
      evt => {
        const r = evt.payload.as<{ sum: number }>();
        if (r.ok) seen.push(r.value.sum);
      },
      { includePast: 1 }
    );

    // immediate retained replay enqueues delivery; wait a tick
    await new Promise(r => setTimeout(r, 10));
    assert.deepEqual(seen, [5]);

    await node.publish('math', 'added', { sum: 7 });
    await new Promise(r => setTimeout(r, 10));
    assert.deepEqual(seen, [5, 7]);

    assert.equal(node.unsubscribe(subId), true);

    await node.stop();
  });
});
