import { describe, it, expect } from 'bun:test';
import { TopicPath } from '../src';

describe('TopicPath templates', () => {
  it('matches registry service templates', () => {
    const listTemplate = 'services/list';
    const serviceTemplate = 'services/{service_path}';
    const stateTemplate = 'services/{service_path}/state';

    const list = TopicPath.new('main:services/list', 'default');
    expect(list.matches_template(listTemplate)).toBe(true);

    const svc = TopicPath.new('main:services/math', 'default');
    expect(svc.matches_template(serviceTemplate)).toBe(true);

    const state = TopicPath.new('main:services/math/state', 'default');
    expect(state.matches_template(stateTemplate)).toBe(true);
  });
});


