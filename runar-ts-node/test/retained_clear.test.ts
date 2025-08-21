import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Node } from '../src';
import { AnyValue } from 'runar-ts-serializer';

describe('Retained events clearing', () => {
  it('clears retained by wildcard pattern and respects includePast ordering', async () => {
    const node = new Node('net');
    await node.start();

    await node.publish('svc', 'a', { n: 1 }, { retain: true });
    await node.publish('svc', 'b', { n: 2 }, { retain: true });

    let seen: number[] = [];
    node.on('svc', '>', (evt) => {
      const av = AnyValue.fromBytes<{ n: number }>(evt.payload);
      const r = av.as<{ n: number }>();
      if (r.ok) seen.push(r.value.n);
    }, { includePast: 10 });
    await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(seen, [1, 2]);

    const removed = node.clearRetainedEventsMatching('svc/>');
    assert.equal(removed, 2);

    let seen2: number[] = [];
    node.on('svc', '>', (evt) => {
      const av = AnyValue.fromBytes<{ n: number }>(evt.payload);
      const r = av.as<{ n: number }>();
      if (r.ok) seen2.push(r.value.n);
    }, { includePast: 10 });
    await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(seen2, []);
  });
});


