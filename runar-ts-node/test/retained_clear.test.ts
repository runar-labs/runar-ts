import { describe, it, expect } from 'bun:test';
import { Node } from '../src';
import { ServiceRegistry } from '../src/index';
import { TopicPath } from 'runar-ts-common';
import { SubscriptionMetadata } from 'runar-ts-schemas';

describe('Retained events clearing', () => {
  it('clears retained by wildcard pattern and respects includePast ordering', async () => {
    const node = new Node('net');
    await node.start();

    await node.publish('svc', 'a', { n: 1 }, { retain: true });
    await node.publish('svc', 'b', { n: 2 }, { retain: true });

    const seen: number[] = [];
    node.on(
      'svc',
      '>',
      evt => {
        const r = evt.payload.as<{ n: number }>();
        if (r.ok) seen.push(r.value.n);
      },
      { includePast: 10 }
    );
    await new Promise(r => setTimeout(r, 10));
    expect(seen).toEqual([1, 2]);

    const removed = node.clearRetainedEventsMatching('svc/>');
    expect(removed).toBe(2);

    const seen2: number[] = [];
    node.on(
      'svc',
      '>',
      evt => {
        const r = evt.payload.as<{ n: number }>();
        if (r.ok) seen2.push(r.value.n);
      },
      { includePast: 10 }
    );
    await new Promise(r => setTimeout(r, 10));
    expect(seen2).toEqual([]);
  });
});
