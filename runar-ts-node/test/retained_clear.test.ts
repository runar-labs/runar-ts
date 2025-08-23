import { describe, it, expect } from 'bun:test';
import { Node } from '../src';
import { AnyValue } from 'runar-ts-serializer';
import { EventContext } from '../src/core';
import { ok } from 'runar-ts-common';

describe('Retained events clearing', () => {
  it('clears retained by wildcard pattern and respects includePast ordering', async () => {
    const node = new Node('net');
    await node.start();

    await node.publish_with_options('svc/a', AnyValue.from({ n: 1 }), { retain: true });
    await node.publish_with_options('svc/b', AnyValue.from({ n: 2 }), { retain: true });

    const seen: number[] = [];
    await node.subscribe(
      'svc/>',
      async (context: EventContext, payload?: AnyValue) => {
        if (payload) {
          const r = payload.as<{ n: number }>();
          if (r.ok) seen.push(r.value.n);
        }
        return ok(undefined);
      },
      { includePast: true }
    );
    await new Promise(r => setTimeout(r, 10));
    expect(seen).toEqual([1, 2]);

    const removed = node.clearRetainedEventsMatching('svc/>');
    expect(removed).toBe(2);

    const seen2: number[] = [];
    await node.subscribe(
      'svc/>',
      async (payload: AnyValue, context: EventContext) => {
        const r = payload.as<{ n: number }>();
        if (r.ok) seen2.push(r.value.n);
        return ok(undefined);
      },
      { includePast: true }
    );
    await new Promise(r => setTimeout(r, 10));
    expect(seen2).toEqual([]);
  });
});
