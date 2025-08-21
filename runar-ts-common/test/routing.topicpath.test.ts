import { describe, it, expect } from 'bun:test';
import { TopicPath } from '../src/routing/TopicPath';

describe('TopicPath', () => {
  it('parses full path with network', () => {
    const tp = TopicPath.new('main:auth/login', 'default');
    expect(tp.networkId()).toBe('main');
    expect(tp.servicePath()).toBe('auth');
    expect(tp.actionPath()).toBe('auth/login');
    expect(tp.isPattern()).toBe(false);
  });

  it('parses shorthand without network', () => {
    const tp = TopicPath.new('auth/login', 'mynet');
    expect(tp.networkId()).toBe('mynet');
    expect(tp.servicePath()).toBe('auth');
    expect(tp.actionPath()).toBe('auth/login');
  });

  it('handles wildcards and template', () => {
    const wildcard = TopicPath.new('main:services/*/state', 'default');
    expect(wildcard.isPattern()).toBe(true);

    const multi = TopicPath.new('main:events/>', 'default');
    expect(multi.isPattern()).toBe(true);
    expect(multi.hasMultiWildcard()).toBe(true);

    const templ = TopicPath.new('main:users/{user_id}/profile', 'default');
    expect(templ.isPattern()).toBe(false);
    expect(templ.matches_template('users/{user_id}/profile')).toBe(true);
    const params = templ.extract_params('users/{user_id}/profile');
    expect(params.get('user_id')).toBe('{user_id}');
  });

  it('extracts template params correctly', () => {
    const templ = TopicPath.new('main:users/123/profile', 'default');
    const params = templ.extract_params('users/{user_id}/profile');
    expect(params.get('user_id')).toBe('123');
  });
});
