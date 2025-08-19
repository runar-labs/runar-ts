import { describe, it, expect } from 'bun:test';
import { Node } from '../src';
import { AnyValue } from 'runar-ts-serializer';
import { AbstractService, LifecycleContext } from 'runar-ts-common';

class MathService implements AbstractService {
  private _networkId?: string;
  name(): string { return 'Math'; }
  version(): string { return '1.0.0'; }
  path(): string { return 'math'; }
  description(): string { return 'Math operations'; }
  networkId(): string | undefined { return this._networkId; }
  setNetworkId(networkId: string): void { this._networkId = networkId; }
  async init(context: LifecycleContext): Promise<void> {
    context.addActionHandler('add', async (req) => {
      const input = AnyValue.fromBytes<{ a: number; b: number }>(req.payload);
      const inRes = input.as<{ a: number; b: number }>();
      const { a, b } = inRes.ok ? inRes.value : { a: 0, b: 0 };
      const outRes = AnyValue.from({ sum: a + b }).serialize();
      const out = outRes.ok ? outRes.value : new Uint8Array();
      return { ok: true, requestId: req.requestId, payload: out };
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

    const res = await node.request<{ a: number; b: number }, { sum: number }>('math', 'add', { a: 2, b: 3 });
    expect(res.sum).toBe(5);

    // publish retained event before subscribe
    await node.publish('math', 'added', { sum: 5 }, { retain: true });

    let seen: number[] = [];
    const subId = node.on('math', 'added', (evt) => {
      const av = AnyValue.fromBytes<{ sum: number }>(evt.payload);
      const r = av.as<{ sum: number }>();
      if (r.ok) seen.push(r.value.sum);
    }, { includePast: 1 });

    // immediate retained replay enqueues delivery; wait a tick
    await new Promise((r) => setTimeout(r, 10));
    expect(seen).toEqual([5]);

    await node.publish('math', 'added', { sum: 7 });
    await new Promise((r) => setTimeout(r, 10));
    expect(seen).toEqual([5, 7]);

    expect(node.unsubscribe(subId)).toBe(true);

    await node.stop();
  });
});


