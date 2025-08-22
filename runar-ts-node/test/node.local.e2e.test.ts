import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Node } from '../src';
import { AnyValue } from 'runar-ts-serializer';
import { AbstractService, LifecycleContext, RequestContext, EventContext, EventContextImpl } from '../src/core';
import { ok, err } from 'runar-ts-common';

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
    const result = await context.registerAction('add', async (payload: AnyValue, context: RequestContext) => {
      const inRes = payload.as<{ a: number; b: number }>();
      if (!inRes.ok) {
        return err('Expected object with a and b properties');
      }
      const { a, b } = inRes.value;
      return ok(AnyValue.from({ sum: a + b }));
    });

    if (!result.ok) {
      throw new Error(`Failed to register action: ${result.error}`);
    }
  }
  async start(_context: LifecycleContext): Promise<void> {}
  async stop(_context: LifecycleContext): Promise<void> {}
}

describe('Node local E2E', () => {
  it('handles request/response and events with retention', async () => {
    const node = new Node('testnet');
    node.addService(new MathService());
    await node.start();

    const result = await node.request('math/add', { a: 2, b: 3 });
    assert.ok(result.ok, `Request failed: ${result.error}`);
    const res = result.value.as<{ sum: number }>();
    assert.ok(res.ok, `Failed to parse response: ${res.error}`);
    assert.equal(res.value.sum, 5);

    // publish retained event before subscribe
    const publishResult = await node.publish_with_options('math/added', AnyValue.from({ sum: 5 }), { retain: true });
    assert.ok(publishResult.ok, `Publish failed: ${publishResult.error}`);

    const seen: number[] = [];
    const subResult = await node.subscribe(
      'math/added',
      async (payload: AnyValue, context: EventContext) => {
        const r = payload.as<{ sum: number }>();
        if (r.ok) {
          seen.push(r.value.sum);
        }
        return ok(undefined);
      },
      { includePast: true }
    );
    assert.ok(subResult.ok, `Subscribe failed: ${subResult.error}`);
    const subId = subResult.value;

    // immediate retained replay enqueues delivery; wait a tick
    await new Promise(r => setTimeout(r, 10));
    assert.deepEqual(seen, [5]);

    const publishResult2 = await node.publish('math/added', AnyValue.from({ sum: 7 }));
    assert.ok(publishResult2.ok, `Publish failed: ${publishResult2.error}`);
    await new Promise(r => setTimeout(r, 10));
    assert.deepEqual(seen, [5, 7]);

    const unsubResult = await node.unsubscribe(subId);
    assert.ok(unsubResult.ok, `Unsubscribe failed: ${unsubResult.error}`);

    await node.stop();
  });
});
