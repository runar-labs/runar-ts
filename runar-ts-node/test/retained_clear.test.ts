import { describe, it, expect } from 'bun:test';
import { Node } from '../src';
import { fromCbor } from 'runar-ts-serializer';

describe('Retained events clearing', () => {
  it('clears retained by wildcard pattern and respects includePast ordering', async () => {
    const node = new Node('net');
    await node.start();

    await node.publish('svc', 'a', { n: 1 }, { retain: true });
    await node.publish('svc', 'b', { n: 2 }, { retain: true });

    let seen: number[] = [];
    node.on('svc', '>', (evt) => {
      const { n } = fromCbor<{ n: number }>(evt.payload);
      seen.push(n);
    }, { includePast: 10 });
    await new Promise((r) => setTimeout(r, 10));
    expect(seen).toEqual([1, 2]);

    const removed = node.clearRetainedEventsMatching('svc/>');
    expect(removed).toBe(2);

    let seen2: number[] = [];
    node.on('svc', '>', (evt) => {
      const { n } = fromCbor<{ n: number }>(evt.payload);
      seen2.push(n);
    }, { includePast: 10 });
    await new Promise((r) => setTimeout(r, 10));
    expect(seen2).toEqual([]);
  });
});


