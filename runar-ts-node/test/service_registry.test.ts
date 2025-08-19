import { describe, it, expect } from 'bun:test';
import { ServiceRegistry } from '../src';
import { TopicPath } from 'runar-ts-common';

describe('ServiceRegistry subscriptions', () => {
  it('subscribe and unsubscribe', () => {
    const registry = new ServiceRegistry();
    const topic = TopicPath.new('net1:test/event', 'net1');
    const serviceTopic = TopicPath.newService('net1', 'svc');
    const subscriber = () => {};
    const id = registry.subscribe(topic, serviceTopic, subscriber, { path: topic.asString?.() ?? 'net1:test/event' }, 'Local');
    const handlers = registry.getSubscribers(topic);
    expect(handlers.length).toBe(1);
    expect(handlers[0]?.id).toBe(id);
    const ok = registry.unsubscribe(id);
    expect(ok).toBe(true);
    const after = registry.getSubscribers(topic);
    expect(after.length).toBe(0);
  });

  it('wildcard subscriptions register and can be unsubscribed independently', () => {
    const registry = new ServiceRegistry();
    const wc1 = TopicPath.new('net1:test/>', 'net1');
    const wc2 = TopicPath.new('net1:test/events/>', 'net1');
    const serviceTopic = TopicPath.newService('net1', 'svc');
    const cb = () => {};
    const id1 = registry.subscribe(wc1, serviceTopic, cb, { path: wc1.asString?.() ?? '' }, 'Local');
    const id2 = registry.subscribe(wc2, serviceTopic, cb, { path: wc2.asString?.() ?? '' }, 'Local');
    const h1 = registry.getSubscribers(wc1);
    const h2 = registry.getSubscribers(wc2);
    expect(h1.length).toBe(1);
    expect(h2.length).toBe(1);
    registry.unsubscribe(id2);
    const h2After = registry.getSubscribers(wc2);
    expect(h2After.length).toBe(0);
    const h1After = registry.getSubscribers(wc1);
    expect(h1After.length).toBe(1);
    registry.unsubscribe(id1);
  });
});


