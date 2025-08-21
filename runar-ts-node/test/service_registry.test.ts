import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ServiceRegistry } from '../src';
import { TopicPath } from 'runar-ts-common';

describe('ServiceRegistry subscriptions', () => {
  it('subscribe and unsubscribe', () => {
    const registry = new ServiceRegistry();
    const topic = TopicPath.new('net1:test/event', 'net1');
    const serviceTopic = TopicPath.newService('net1', 'svc');
    const subscriber = () => {};
    const id = registry.subscribe(
      topic,
      serviceTopic,
      subscriber,
      { path: topic.asString?.() ?? 'net1:test/event' },
      'Local'
    );
    const handlers = registry.getSubscribers(topic);
    assert.equal(handlers.length, 1);
    assert.equal(handlers[0]?.id, id);
    const ok = registry.unsubscribe(id);
    assert.equal(ok, true);
    const after = registry.getSubscribers(topic);
    assert.equal(after.length, 0);
  });

  it('wildcard subscriptions register and can be unsubscribed independently', () => {
    const registry = new ServiceRegistry();
    const wc1 = TopicPath.new('net1:test/>', 'net1');
    const wc2 = TopicPath.new('net1:test/events/>', 'net1');
    const serviceTopic = TopicPath.newService('net1', 'svc');
    const cb = () => {};
    const id1 = registry.subscribe(
      wc1,
      serviceTopic,
      cb,
      { path: wc1.asString?.() ?? '' },
      'Local'
    );
    const id2 = registry.subscribe(
      wc2,
      serviceTopic,
      cb,
      { path: wc2.asString?.() ?? '' },
      'Local'
    );
    const h1 = registry.getSubscribers(wc1);
    const h2 = registry.getSubscribers(wc2);
    assert.equal(h1.length, 1);
    assert.equal(h2.length, 1);
    registry.unsubscribe(id2);
    const h2After = registry.getSubscribers(wc2);
    assert.equal(h2After.length, 0);
    const h1After = registry.getSubscribers(wc1);
    assert.equal(h1After.length, 1);
    registry.unsubscribe(id1);
  });
});
