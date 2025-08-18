import { describe, it, expect } from 'bun:test';
import { TopicPath } from '../src';

describe('TopicPath extras', () => {
  it('parent/child/from_full_path/negatives', () => {
    const base = TopicPath.new('main:auth', 'default');
    const child = base.child('login');
    expect(child.asString()).toBe('main:auth/login');
    const parent = child.parent();
    expect(parent.asString()).toBe('main:auth');
    const full = TopicPath.fromFullPath('net:svc/action');
    expect(full.networkId()).toBe('net');
    expect(full.actionPath()).toBe('svc/action');

    expect(() => TopicPath.new('net:events/a/>/bad', 'default')).toThrow();
    expect(() => TopicPath.new(':bad', 'default')).toThrow();
    expect(() => TopicPath.new('', 'default')).toThrow();
  });
});


