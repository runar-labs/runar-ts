import { describe, it, expect } from 'bun:test';
import { TopicPath } from '../src/routing/TopicPath';

describe('TopicPath Templates', () => {
  describe('Parameter extraction', () => {
    it('extracts parameters from template patterns', () => {
      // A template pattern for our Registry Service paths
      const template = 'services/{service_path}/state';

      // An actual path that matches the template
      const path = TopicPath.new('services/math/state', 'main');

      // Extract parameters from the path
      const params = path.extractParams(template);
      expect(params.get('service_path')).toBe('math');

      // Try another path
      const path2 = TopicPath.new('main:services/auth/state', 'default');
      const params2 = path2.extractParams(template);
      expect(params2.get('service_path')).toBe('auth');
    });

    it("rejects paths that don't match segment count", () => {
      const template = 'services/{service_path}/state';
      const nonMatching1 = TopicPath.new('main:services/math', 'default');
      expect(() => nonMatching1.extractParams(template)).toThrow();
    });

    it("rejects paths that don't match literal segments", () => {
      const template = 'services/{service_path}/state';
      const nonMatching2 = TopicPath.new('main:users/math/profile', 'default');
      expect(() => nonMatching2.extractParams(template)).toThrow();
    });
  });

  describe('Template matching', () => {
    it('matches paths against templates', () => {
      const template = 'services/{service_path}/state';

      // Paths that should match
      const path1 = TopicPath.new('main:services/math/state', 'default');
      const path2 = TopicPath.new('main:services/auth/state', 'default');

      expect(path1.matchesTemplate(template)).toBe(true);
      expect(path2.matchesTemplate(template)).toBe(true);

      // Paths that shouldn't match
      const path3 = TopicPath.new('main:services/math', 'default');
      const path4 = TopicPath.new('main:users/auth/profile', 'default');

      expect(path3.matchesTemplate(template)).toBe(false);
      expect(path4.matchesTemplate(template)).toBe(false);
    });
  });

  describe('Template creation', () => {
    it('creates paths from templates and parameters', () => {
      const template = 'services/{service_path}/state';

      // Create parameters
      const params = new Map<string, string>();
      params.set('service_path', 'math');

      // Create a path from the template
      const path = TopicPath.fromTemplate(template, params, 'main');
      expect(path.asString()).toBe('main:services/math/state');
      expect(path.servicePath()).toBe('services');
      expect(path.networkId()).toBe('main');
    });

    it('handles multiple parameters', () => {
      const template2 = '{service_type}/{service_name}/{action}';

      const params2 = new Map<string, string>();
      params2.set('service_type', 'internal');
      params2.set('service_name', 'registry');
      params2.set('action', 'list');

      const path2 = TopicPath.fromTemplate(template2, params2, 'main');
      expect(path2.asString()).toBe('main:internal/registry/list');
    });
  });

  describe('Registry service use cases', () => {
    it('handles registry service path templates', () => {
      // Template for our registry service paths
      const listTemplate = 'services/list';
      const serviceTemplate = 'services/{service_path}';
      const stateTemplate = 'services/{service_path}/state';
      const actionsTemplate = 'services/{service_path}/actions';

      // Test matching for various paths
      const listPath = TopicPath.new('main:services/list', 'default');
      expect(listPath.matchesTemplate(listTemplate)).toBe(true);

      const servicePath = TopicPath.new('main:services/math', 'default');
      expect(servicePath.matchesTemplate(serviceTemplate)).toBe(true);

      const statePath = TopicPath.new('main:services/math/state', 'default');
      expect(statePath.matchesTemplate(stateTemplate)).toBe(true);
    });

    it('extracts service path from requests', () => {
      const stateTemplate = 'services/{service_path}/state';
      const statePath = TopicPath.new('main:services/math/state', 'default');

      const params = statePath.extractParams(stateTemplate);
      expect(params.get('service_path')).toBe('math');
    });

    it('creates paths for specific service actions', () => {
      const actionsTemplate = 'services/{service_path}/actions';
      const params = new Map<string, string>();
      params.set('service_path', 'auth');

      const actionsPath = TopicPath.fromTemplate(actionsTemplate, params, 'main');
      expect(actionsPath.asString()).toBe('main:services/auth/actions');
    });
  });

  describe('Template path keys', () => {
    it('handles template path key behavior', () => {
      // Create a template path and a concrete path
      const template = 'services/{service_path}';
      const matchValue = 'services/math';
      const networkId = 'main';

      const templatePath = TopicPath.new(template, networkId);
      const matchValuePath = TopicPath.new(matchValue, networkId);

      // A template path doesn't match a concrete path in this direction
      expect(templatePath.matches(matchValuePath)).toBe(false);

      // But a concrete path should match a template via the matchesTemplate method
      expect(matchValuePath.matchesTemplate('services/{service_path}')).toBe(true);
    });
  });

  describe('Template path with wildcards', () => {
    it('handles wildcard pattern matching', () => {
      // Create test paths
      const networkId = 'main';

      // Single-segment wildcard
      const wildcardPath = TopicPath.new('services/*/state', networkId);
      const matchPath1 = TopicPath.new('services/math/state', networkId);
      const matchPath2 = TopicPath.new('services/auth/state', networkId);
      const nonMatch = TopicPath.new('services/math/config', networkId);

      // For the current implementation, we verify matching using matches() not equality
      expect(wildcardPath.matches(matchPath1)).toBe(true);
      expect(wildcardPath.matches(matchPath2)).toBe(true);
      expect(wildcardPath.matches(nonMatch)).toBe(false);
    });
  });

  describe('Normalized template matching', () => {
    it('handles normalized template matching', () => {
      const templatePath = TopicPath.new('main:services/{service_path}', 'default');
      const concretePath = TopicPath.new('main:services/math', 'default');

      const templateMatches = templatePath.matches(concretePath);
      const concreteMatchesTemplate = concretePath.matchesTemplate('services/{service_path}');

      // A template path shouldn't match a concrete path in this direction
      expect(templateMatches).toBe(false);

      // But a concrete path should match a template via the matchesTemplate method
      expect(concreteMatchesTemplate).toBe(true);
    });
  });

  describe('Parameter extraction edge cases', () => {
    it('extracts parameters from nested paths', () => {
      const path = TopicPath.new('main:services/math/users/admin', 'default');

      // Test with multiple parameters
      const nestedParams = path.extractParams('services/{service}/users/{user_id}');
      expect(nestedParams.get('service')).toBe('math');
      expect(nestedParams.get('user_id')).toBe('admin');
    });

    it('rejects non-matching templates', () => {
      const path = TopicPath.new('main:services/math/state', 'default');
      expect(() => path.extractParams('services/{service_path}/config')).toThrow();
    });

    it('rejects templates with different segment count', () => {
      const path = TopicPath.new('main:services/math/state', 'default');
      expect(() => path.extractParams('services/{service_path}')).toThrow();
    });
  });

  describe('Template matching edge cases', () => {
    it('matches various template patterns', () => {
      const path = TopicPath.new('main:services/math/state', 'default');

      // Test with matching templates
      expect(path.matchesTemplate('services/{service_path}/state')).toBe(true);
      expect(path.matchesTemplate('services/math/state')).toBe(true);
      expect(path.matchesTemplate('services/{service_path}/{action}')).toBe(true);

      // Test with non-matching templates
      expect(path.matchesTemplate('services/{service_path}/config')).toBe(false);
      expect(path.matchesTemplate('users/{user_id}')).toBe(false);
      expect(path.matchesTemplate('services/{service_path}')).toBe(false);
      expect(path.matchesTemplate('services/{service_path}/state/details')).toBe(false);
    });
  });

  describe('Template creation edge cases', () => {
    it('handles missing parameters', () => {
      const mutParams = new Map<string, string>();
      mutParams.set('service_path', 'math');
      mutParams.set('action', 'add');

      const path = TopicPath.fromTemplate('services/{service_path}/{action}', mutParams, 'main');
      expect(path.asString()).toBe('main:services/math/add');

      // Test with missing parameter
      expect(() =>
        TopicPath.fromTemplate('services/{service_path}/{missing_param}', mutParams, 'main')
      ).toThrow();
    });
  });

  describe('Path with templates', () => {
    it('identifies paths with templates', () => {
      const pathStr = 'main:services/{service_path}/state';
      const path = TopicPath.new(pathStr, 'default');

      expect(path.hasTemplates()).toBe(true);
      expect(path.asString()).toBe(pathStr);

      // A path with templates is not a wildcard pattern
      expect(path.isPattern()).toBe(false);
    });
  });

  describe('Template path action path extraction', () => {
    it('extracts action paths from template paths', () => {
      const path = TopicPath.new('main:services/{service_path}/actions/{action_name}', 'default');

      expect(path.servicePath()).toBe('services');
      expect(path.actionPath()).toBe('services/{service_path}/actions/{action_name}');

      // Test with specific values
      const mutParams = new Map<string, string>();
      mutParams.set('service_path', 'math');
      mutParams.set('action_name', 'add');

      const concretePath = TopicPath.fromTemplate(
        'services/{service_path}/actions/{action_name}',
        mutParams,
        'main'
      );

      expect(concretePath.servicePath()).toBe('services');
      expect(concretePath.actionPath()).toBe('services/math/actions/add');
    });
  });

  describe('Complex template usage', () => {
    it('handles complex template patterns', () => {
      const template = 'services/{service_path}/users/{user_id}/profile';

      const mutParams = new Map<string, string>();
      mutParams.set('service_path', 'auth');
      mutParams.set('user_id', '12345');

      const path = TopicPath.fromTemplate(template, mutParams, 'main');
      expect(path.asString()).toBe('main:services/auth/users/12345/profile');

      // Now extract params back from the path
      const extracted = path.extractParams(template);
      expect(extracted.get('service_path')).toBe('auth');
      expect(extracted.get('user_id')).toBe('12345');
    });
  });

  describe('Template edge cases', () => {
    it('handles empty parameter names', () => {
      const path = TopicPath.new('main:services/{}/state', 'default');
      expect(path.hasTemplates()).toBe(true);
    });

    it('handles template at beginning of path', () => {
      const path = TopicPath.new('main:{service}/actions/list', 'default');
      expect(path.hasTemplates()).toBe(true);
    });

    it('handles template at end of path', () => {
      const path = TopicPath.new('main:services/actions/{name}', 'default');
      expect(path.hasTemplates()).toBe(true);
    });

    it('handles multiple templates in a single path', () => {
      const path = TopicPath.new('main:{service}/{action}/{id}', 'default');
      expect(path.hasTemplates()).toBe(true);

      const mutParams = new Map<string, string>();
      mutParams.set('service', 'auth');
      mutParams.set('action', 'login');
      mutParams.set('id', '12345');

      const concrete = TopicPath.fromTemplate('{service}/{action}/{id}', mutParams, 'main');
      expect(concrete.asString()).toBe('main:auth/login/12345');
    });
  });

  describe('Service versus action templates', () => {
    it('handles service templates', () => {
      const servicePath = TopicPath.new('main:services/{service_type}', 'default');
      expect(servicePath.hasTemplates()).toBe(true);
      expect(servicePath.servicePath()).toBe('services');
    });

    it('handles action path templates', () => {
      const actionPathStr = 'main:services/{service_type}/list';
      const actionPath = TopicPath.new(actionPathStr, 'default');
      expect(actionPath.asString()).toBe(actionPathStr);
      expect(actionPath.hasTemplates()).toBe(true);
    });
  });

  describe('Event path creation with templates', () => {
    it('handles event paths with templates', () => {
      const servicePath = TopicPath.new('main:services/{service_type}', 'default');

      // Instead of using new_event_topic, create the event path manually
      const eventPathStr = 'main:services/{service_type}/updated';
      const eventPath = TopicPath.new(eventPathStr, 'default');

      expect(eventPath.asString()).toBe(eventPathStr);
      expect(eventPath.hasTemplates()).toBe(true);

      const eventsTemplate = 'services/{service_path}/events';
      // This would be used for matching
    });
  });

  describe('Registry service use case comprehensive', () => {
    it('handles real-world registry service scenarios', () => {
      // Test with a real-world use case: registry service

      // Template paths for registry service
      const listServicesTemplate = 'services/list';
      const serviceInfoTemplate = 'services/{service_path}';
      const serviceStateTemplate = 'services/{service_path}/state';

      // Create actual request paths
      const listPath = TopicPath.new('main:services/list', 'default');
      const infoPath = TopicPath.new('main:services/math', 'default');
      const statePath = TopicPath.new('main:services/math/state', 'default');

      // Create template path objects for testing matches() in both directions
      const templatePath = TopicPath.new(serviceInfoTemplate, 'default');

      // These should match their respective templates using matchesTemplate
      expect(listPath.matchesTemplate(listServicesTemplate)).toBe(true);
      expect(infoPath.matchesTemplate(serviceInfoTemplate)).toBe(true);
      expect(statePath.matchesTemplate(serviceStateTemplate)).toBe(true);

      // A template path shouldn't match a concrete path in this direction
      expect(templatePath.matches(infoPath)).toBe(false);

      // Extract parameters
      const infoParams = infoPath.extractParams(serviceInfoTemplate);
      expect(infoParams.get('service_path')).toBe('math');

      const stateParams = statePath.extractParams(serviceStateTemplate);
      expect(stateParams.get('service_path')).toBe('math');
    });
  });
});
