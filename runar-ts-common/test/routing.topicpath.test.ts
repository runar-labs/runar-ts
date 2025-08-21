import { describe, it, expect } from 'bun:test';
import { TopicPath } from '../src/routing/TopicPath';

describe('TopicPath', () => {
  describe('Constructor tests', () => {
    it('creates paths with network_id prefix', () => {
      const path = TopicPath.new('main:auth/login', 'default');
      expect(path.networkId()).toBe('main');
      expect(path.servicePath()).toBe('auth');
      const segments = path.getSegments();
      expect(segments[segments.length - 1]).toBe('login');
      expect(path.asString()).toBe('main:auth/login');
      expect(path.actionPath()).toBe('auth/login');
    });

    it('creates paths without network_id (uses default)', () => {
      const path = TopicPath.new('auth/login', 'default');
      expect(path.networkId()).toBe('default');
      expect(path.servicePath()).toBe('auth');
      const segments = path.getSegments();
      expect(segments[segments.length - 1]).toBe('login');
      expect(path.asString()).toBe('default:auth/login');
      expect(path.actionPath()).toBe('auth/login');
    });

    it('creates paths with just service name', () => {
      const path = TopicPath.new('auth', 'default');
      expect(path.networkId()).toBe('default');
      expect(path.servicePath()).toBe('auth');
      expect(path.asString()).toBe('default:auth');
      expect(path.actionPath()).toBe('');
    });

    it('creates paths with multiple path segments', () => {
      const path = TopicPath.new('main:auth/users/details', 'default');
      expect(path.networkId()).toBe('main');
      expect(path.servicePath()).toBe('auth');
      expect(path.asString()).toBe('main:auth/users/details');
      expect(path.actionPath()).toBe('auth/users/details');
    });
  });

  describe('Invalid path handling', () => {
    it('rejects empty paths', () => {
      expect(() => TopicPath.new('', 'default')).toThrow();
    });

    it('rejects multiple colons', () => {
      expect(() => TopicPath.new('main:auth:login', 'default')).toThrow();
    });

    it('rejects empty network ID', () => {
      expect(() => TopicPath.new(':auth/login', 'default')).toThrow();
    });
  });

  describe('Service constructor', () => {
    it('creates service-only paths', () => {
      const path = TopicPath.newService('main', 'auth');
      expect(path.networkId()).toBe('main');
      expect(path.servicePath()).toBe('auth');
      expect(path.asString()).toBe('main:auth');
      expect(path.actionPath()).toBe('');
      expect(path.getSegments().length).toBe(1);
    });
  });

  describe('Child path creation', () => {
    it('creates child paths', () => {
      const base = TopicPath.new('main:auth', 'default');
      const child = base.child('login');
      expect(child.asString()).toBe('main:auth/login');
      expect(child.networkId()).toBe('main');
      expect(child.servicePath()).toBe('auth');
      expect(child.actionPath()).toBe('auth/login');
    });

    it('creates nested child paths', () => {
      const base = TopicPath.new('main:auth', 'default');
      const child = base.child('login');
      const nestedChild = child.child('advanced');
      expect(nestedChild.asString()).toBe('main:auth/login/advanced');
    });

    it('rejects invalid child paths with slashes', () => {
      const base = TopicPath.new('main:auth', 'default');
      expect(() => base.child('invalid/segment')).toThrow();
    });
  });

  describe('Parent path creation', () => {
    it('creates parent paths', () => {
      const path = TopicPath.new('main:auth/users/details', 'default');
      const parent = path.parent();
      expect(parent.asString()).toBe('main:auth/users');
      expect(parent.servicePath()).toBe('auth');
    });

    it('creates grandparent paths', () => {
      const path = TopicPath.new('main:auth/users/details', 'default');
      const parent = path.parent();
      const grandparent = parent.parent();
      expect(grandparent.asString()).toBe('main:auth');
    });

    it('rejects parent of root path', () => {
      const serviceOnly = TopicPath.new('main:service', 'default');
      expect(() => serviceOnly.parent()).toThrow();
    });
  });

  describe('Path prefix matching', () => {
    it('matches path prefixes', () => {
      const path = TopicPath.new('main:auth/users/list', 'default');
      const prefix1 = TopicPath.new('main:auth', 'default');
      const prefix2 = TopicPath.new('main:auth/users', 'default');

      expect(path.startsWith(prefix1)).toBe(true);
      expect(path.startsWith(prefix2)).toBe(true);
    });

    it('rejects non-matching prefixes', () => {
      const path = TopicPath.new('main:auth/users/list', 'default');
      const differentNetwork = TopicPath.new('other:auth/users', 'default');
      const differentService = TopicPath.new('main:payments', 'default');

      expect(path.startsWith(differentNetwork)).toBe(false);
      expect(path.startsWith(differentService)).toBe(false);
    });
  });

  describe('Path segment extraction', () => {
    it('extracts segments from simple paths', () => {
      const path = TopicPath.new('main:auth/login', 'default');
      const segments = path.getSegments();
      expect(segments).toEqual(['auth', 'login']);
    });

    it('extracts segments from complex paths', () => {
      const path = TopicPath.new('main:auth/users/profile/edit', 'default');
      const segments = path.getSegments();
      expect(segments).toEqual(['auth', 'users', 'profile', 'edit']);
    });

    it('extracts segments from service-only paths', () => {
      const path = TopicPath.new('main:auth', 'default');
      const segments = path.getSegments();
      expect(segments).toEqual(['auth']);
    });
  });

  describe('Method consistency', () => {
    it('maintains consistency between methods', () => {
      const path = TopicPath.new('main:service/action', 'default');
      expect(path.servicePath()).toBe('service');

      const segments = path.getSegments();
      expect(segments.length).toBe(2);
      expect(segments[0]).toBe('service');
      expect(segments[1]).toBe('action');

      expect(path.actionPath()).toBe('service/action');
    });
  });

  describe('Unusual but valid paths', () => {
    it('handles network ID with special characters', () => {
      const path = TopicPath.new('test-network_01:service', 'default');
      expect(path.networkId()).toBe('test-network_01');
      expect(path.servicePath()).toBe('service');
    });

    it('handles service path with special characters', () => {
      const path = TopicPath.new('main:my-service_01', 'default');
      expect(path.servicePath()).toBe('my-service_01');
    });

    it('handles long paths with many segments', () => {
      const path = TopicPath.new('main:service/a/b/c/d/e/f', 'default');
      const segments = path.getSegments();
      expect(segments.length).toBe(7);
      expect(path.actionPath()).toBe('service/a/b/c/d/e/f');
    });
  });

  describe('Service paths with embedded slashes', () => {
    it('handles internal service paths with $ prefix', () => {
      const path = TopicPath.new('test_network:$registry/services/list', 'default');
      expect(path.servicePath()).toBe('$registry');
      expect(path.actionPath()).toBe('$registry/services/list');
    });

    it('handles template parameter extraction with path templates', () => {
      const template = 'services/{service_path}/state';
      const path = TopicPath.new('test_network:$registry/services/math/state', 'default');

      // This will fail because segment counts don't match:
      // - Path segments: ["$registry", "services", "math", "state"]
      // - Template segments: ["services", "{service_path}", "state"]
      expect(() => path.extractParams(template)).toThrow();
    });
  });

  describe('Registry service paths', () => {
    it('handles service with $ prefix path', () => {
      const servicePath = '$registry';
      const actionPath = 'services/list';
      const expectedFullPath = 'test_network:$registry/services/list';

      const path = TopicPath.new(`test_network:${servicePath}/${actionPath}`, 'default');

      expect(path.asString()).toBe(expectedFullPath);
    });

    it('handles template pattern for service state', () => {
      const template = 'services/{service_path}/state';
      const serviceStatePath = TopicPath.new('test_network:services/math/state', 'default');

      const params = serviceStatePath.extractParams(template);
      expect(params.get('service_path')).toBe('math');
    });
  });

  describe('Action topic creation', () => {
    it('creates action topics from service paths', () => {
      const servicePath = TopicPath.new('main:auth', 'default');
      const actionResult = servicePath.newActionTopic('login');

      expect(actionResult.isOk()).toBe(true);
      const actionPath = actionResult.unwrap();
      expect(actionPath.networkId()).toBe('main');
      expect(actionPath.servicePath()).toBe('auth');
      expect(actionPath.actionPath()).toBe('auth/login');
    });

    it('creates action topics with default network ID', () => {
      const servicePath = TopicPath.new('auth', 'test-network');
      const actionResult = servicePath.newActionTopic('login');

      expect(actionResult.isOk()).toBe(true);
      const actionPath = actionResult.unwrap();
      expect(actionPath.networkId()).toBe('test-network');
      expect(actionPath.servicePath()).toBe('auth');
      expect(actionPath.actionPath()).toBe('auth/login');
    });

    it('rejects invalid action names', () => {
      const servicePath = TopicPath.new('main:auth', 'default');
      const actionResult = servicePath.newActionTopic('invalid:name');
      expect(actionResult.isErr()).toBe(true);
      expect(actionResult.unwrapErr()).toContain('Invalid action name');
    });
  });

  describe('Event topic creation', () => {
    it('creates event topics from service paths', () => {
      const servicePath = TopicPath.new('main:auth', 'default');
      const eventResult = servicePath.newEventTopic('user_logged_in');

      expect(eventResult.isOk()).toBe(true);
      const eventPath = eventResult.unwrap();
      expect(eventPath.networkId()).toBe('main');
      expect(eventPath.servicePath()).toBe('auth');
      expect(eventPath.actionPath()).toBe('auth/user_logged_in');
    });
  });

  describe('Nested action paths', () => {
    it('creates nested action paths', () => {
      const servicePath = TopicPath.new('main:serviceX', 'default');
      const actionResult = servicePath.newActionTopic('verify_token');

      expect(actionResult.isOk()).toBe(true);

      const actionPath = actionResult.unwrap();
      expect(actionPath.networkId()).toBe('main');
      expect(actionPath.servicePath()).toBe('serviceX');
      expect(actionPath.actionPath()).toBe('serviceX/verify_token');
    });

    it('rejects nested service paths with existing actions', () => {
      const servicePath = TopicPath.new('main:services/auth', 'default');
      const actionResult = servicePath.newActionTopic('verify_token');

      expect(actionResult.isErr()).toBe(true);
      expect(actionResult.unwrapErr()).toContain(
        'cannot create an action path on top of another action path'
      );
    });
  });

  describe('Path parsing', () => {
    it('parses paths with network ID and action', () => {
      const path = TopicPath.new('default:auth/login', 'fallback');
      expect(path.networkId()).toBe('default');
      expect(path.servicePath()).toBe('auth');
      expect(path.actionPath()).toBe('auth/login');
      expect(path.asString()).toBe('default:auth/login');
    });

    it('parses paths with just service path and default network ID', () => {
      const path = TopicPath.new('auth/login', 'default');
      expect(path.networkId()).toBe('default');
      expect(path.servicePath()).toBe('auth');
      expect(path.actionPath()).toBe('auth/login');
    });
  });

  describe('Various path formats', () => {
    it('handles full path with network ID and action', () => {
      const path = TopicPath.new('network:auth/login', 'default');
      expect(path.networkId()).toBe('network');
      expect(path.servicePath()).toBe('auth');
      expect(path.actionPath()).toBe('auth/login');
    });

    it('handles network and service only', () => {
      const path = TopicPath.new('network:auth', 'default');
      expect(path.networkId()).toBe('network');
      expect(path.servicePath()).toBe('auth');
      expect(path.actionPath()).toBe('');
    });

    it('handles service and action without network (uses default)', () => {
      const path = TopicPath.new('auth/login', 'default');
      expect(path.networkId()).toBe('default');
      expect(path.servicePath()).toBe('auth');
      expect(path.actionPath()).toBe('auth/login');
    });
  });
});
