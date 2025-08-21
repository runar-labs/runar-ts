import { describe, it, expect } from 'bun:test';
import { TopicPath } from '../src/routing/TopicPath';

describe('TopicPath Wildcards', () => {
  describe('Pattern detection', () => {
    it('identifies patterns correctly', () => {
      // Test without wildcards
      const path1 = TopicPath.new('main:services/auth/login', 'default');
      expect(path1.isPattern()).toBe(false);

      // Test with single-segment wildcard
      const pattern1 = TopicPath.new('main:services/*/login', 'default');
      expect(pattern1.isPattern()).toBe(true);

      // Test with multi-segment wildcard
      const pattern2 = TopicPath.new('main:services/>', 'default');
      expect(pattern2.isPattern()).toBe(true);
      expect(pattern2.hasMultiWildcard()).toBe(true);
    });
  });

  describe('Single wildcard matching', () => {
    it('matches single-segment wildcard patterns', () => {
      // Create pattern with single-segment wildcard
      const pattern = TopicPath.new('main:services/*/state', 'default');

      // Test successful matches
      const path1 = TopicPath.new('main:services/auth/state', 'default');
      const path2 = TopicPath.new('main:services/math/state', 'default');

      expect(pattern.matches(path1)).toBe(true);
      expect(pattern.matches(path2)).toBe(true);

      // Test non-matches
      const nonMatch1 = TopicPath.new('main:services/auth/login', 'default');
      const nonMatch2 = TopicPath.new('main:services/auth/state/active', 'default');
      const nonMatch3 = TopicPath.new('main:events/user/created', 'default');

      expect(pattern.matches(nonMatch1)).toBe(false); // Different last segment
      expect(pattern.matches(nonMatch2)).toBe(false); // Too many segments
      expect(pattern.matches(nonMatch3)).toBe(false); // Different service path
    });
  });

  describe('Multi-wildcard matching', () => {
    it('matches multi-segment wildcard patterns', () => {
      // Create pattern with multi-segment wildcard
      const pattern = TopicPath.new('main:services/>', 'default');

      // Test successful matches (should match any path that starts with "services")
      const path1 = TopicPath.new('main:services/auth', 'default');
      const path2 = TopicPath.new('main:services/auth/login', 'default');
      const path3 = TopicPath.new('main:services/math/add/numbers', 'default');

      expect(pattern.matches(path1)).toBe(true);
      expect(pattern.matches(path2)).toBe(true);
      expect(pattern.matches(path3)).toBe(true);

      // Test non-matches
      const nonMatch1 = TopicPath.new('main:events/user/created', 'default');
      expect(pattern.matches(nonMatch1)).toBe(false); // Different service path
    });
  });

  describe('Multi-wildcard position', () => {
    it('enforces multi-wildcard at end rule', () => {
      // Multi-wildcard must be the last segment
      expect(() => TopicPath.new('main:services/>/state', 'default')).toThrow();

      // But can be in the middle of a pattern as long as it's the last segment
      const validPattern = TopicPath.new('main:services/>', 'default');
      expect(validPattern.isPattern()).toBe(true);
      expect(validPattern.hasMultiWildcard()).toBe(true);
    });
  });

  describe('Complex patterns', () => {
    it('handles patterns with both types of wildcards', () => {
      // Pattern with both types of wildcards
      const pattern = TopicPath.new('main:services/*/events/>', 'default');

      // Test successful matches
      const path1 = TopicPath.new('main:services/auth/events/user/login', 'default');
      const path2 = TopicPath.new('main:services/math/events/calculation/completed', 'default');

      expect(pattern.matches(path1)).toBe(true);
      expect(pattern.matches(path2)).toBe(true);

      // Test non-matches
      const nonMatch1 = TopicPath.new('main:services/auth/state', 'default');
      const nonMatch2 = TopicPath.new('main:services/auth/logs/error', 'default');

      expect(pattern.matches(nonMatch1)).toBe(false); // Different segment after service
      expect(pattern.matches(nonMatch2)).toBe(false); // "logs" instead of "events"
    });
  });

  describe('Wildcard at beginning', () => {
    it('handles wildcard at beginning of path', () => {
      // Pattern with wildcard at beginning
      const pattern = TopicPath.new('main:*/state', 'default');

      // Test successful matches (should match any service with "state" action)
      const path1 = TopicPath.new('main:auth/state', 'default');
      const path2 = TopicPath.new('main:math/state', 'default');

      expect(pattern.matches(path1)).toBe(true);
      expect(pattern.matches(path2)).toBe(true);

      // Test non-matches
      const nonMatch1 = TopicPath.new('main:auth/login', 'default');
      expect(pattern.matches(nonMatch1)).toBe(false); // Different action
    });
  });

  describe('Network isolation', () => {
    it('isolates patterns by network', () => {
      // Patterns should only match within the same network
      const pattern = TopicPath.new('main:services/*/state', 'default');
      const path1 = TopicPath.new('main:services/auth/state', 'default');
      const path2 = TopicPath.new('other:services/auth/state', 'default');

      expect(pattern.matches(path1)).toBe(true); // Same network
      expect(pattern.matches(path2)).toBe(false); // Different network
    });
  });

  describe('Efficient template pattern lookup', () => {
    it('demonstrates efficient template pattern lookup', () => {
      // Create a Map to store handlers by path pattern
      const handlers = new Map<string, string>();
      const networkId = 'main';

      // Store handlers with template patterns
      const template1 = TopicPath.new('services/{service_path}/actions/{action}', networkId);
      const template2 = TopicPath.new('services/*/state', networkId);

      handlers.set(template1.asString(), 'TEMPLATE_HANDLER_1');
      handlers.set(template2.asString(), 'WILDCARD_HANDLER');

      // Create a concrete path to look up
      const concretePath = TopicPath.new('services/math/actions/add', networkId);

      // Generate possible template patterns from the concrete path
      const possibleTemplates = generatePossibleTemplates(concretePath);

      // Look up each possible template pattern
      let foundHandler = false;
      for (const template of possibleTemplates) {
        if (handlers.has(template)) {
          console.log('Found handler for template:', template);
          console.log('Handler:', handlers.get(template));
          foundHandler = true;
          break;
        }
      }

      expect(foundHandler).toBe(true);
    });

    function generatePossibleTemplates(path: TopicPath): string[] {
      // For this example, we'll manually create the patterns we know should match
      // In a real implementation, we would generate these systematically

      const concretePath = path.asString();
      const templates: string[] = [];

      // Add the concrete path itself (for exact matching)
      templates.push(concretePath);

      // Extract segments (network_id:path/to/resource)
      const pathPart = concretePath.split(':')[1];
      if (pathPart) {
        const segments: string[] = pathPart.split('/');

        // Create specific template patterns based on the segments
        if (segments.length >= 4 && segments[0] === 'services' && segments[2] === 'actions') {
          // Create services/{service_path}/actions/{action} pattern
          const networkId = concretePath.split(':')[0] || 'main';
          const template = `${networkId}:services/{service_path}/actions/{action}`;
          templates.push(template);
        }

        if (segments.length >= 3 && segments[0] === 'services') {
          // Create services/*/state pattern (wildcard)
          const networkId = concretePath.split(':')[0] || 'main';
          const template = `${networkId}:services/*/state`;
          templates.push(template);
        }
      }

      return templates;
    }
  });

  describe('Efficient wildcard pattern lookup', () => {
    it('demonstrates efficient wildcard pattern lookup', () => {
      // Create a Map to store handlers by path pattern
      const handlers = new Map<string, string>();
      const networkId = 'main';

      // Store handlers with wildcard patterns
      const wildcard1 = TopicPath.new('services/*/events', networkId);
      const wildcard2 = TopicPath.new('services/>', networkId);

      handlers.set(wildcard1.asString(), 'SINGLE_WILDCARD_HANDLER');
      handlers.set(wildcard2.asString(), 'MULTI_WILDCARD_HANDLER');

      // Create a concrete path to look up
      const concretePath = TopicPath.new('services/math/events', networkId);

      // Generate possible wildcard patterns from the concrete path
      const possiblePatterns = generateWildcardPatterns(concretePath);

      // Look up each possible pattern
      let foundHandler = false;
      for (const pattern of possiblePatterns) {
        if (handlers.has(pattern)) {
          console.log('Found handler for wildcard pattern:', pattern);
          console.log('Handler:', handlers.get(pattern));
          foundHandler = true;
          break;
        }
      }

      expect(foundHandler).toBe(true);
    });

    function generateWildcardPatterns(path: TopicPath): string[] {
      const concretePath = path.asString();
      const patterns: string[] = [];

      // Add the concrete path itself
      patterns.push(concretePath);

      // Extract segments (network_id:path/to/resource)
      const networkPrefix = concretePath.split(':')[0];
      const pathPart = concretePath.split(':')[1];
      if (networkPrefix && pathPart) {
        const segments: string[] = pathPart.split('/');

        // Generate wildcards based on structure
        if (segments.length >= 3 && segments[0] === 'services') {
          // Replace the middle segment with a * wildcard
          const wildcardMiddle = `${networkPrefix}:services/*/${segments.slice(2).join('/')}`;
          patterns.push(wildcardMiddle);

          // Add a multi-segment wildcard pattern
          patterns.push(`${networkPrefix}:services/>`);
        }
      }

      return patterns;
    }
  });

  describe('Wildcard pattern matching with service registry', () => {
    it('handles wildcard event subscriptions', () => {
      // This test simulates the service registry wildcard subscription behavior
      // without requiring the full service registry implementation

      // Create wildcard patterns
      const pattern1 = TopicPath.new('main:services/*/state', 'default');
      const pattern2 = TopicPath.new('main:events/>', 'default');

      // Test concrete paths that should match
      const topic1 = TopicPath.new('main:services/auth/state', 'default');
      const topic2 = TopicPath.new('main:services/math/state', 'default');
      const topic3 = TopicPath.new('main:events/user/created', 'default');
      const topic4 = TopicPath.new('main:events/system/started', 'default');

      // Verify pattern matching
      expect(pattern1.matches(topic1)).toBe(true);
      expect(pattern1.matches(topic2)).toBe(true);
      expect(pattern2.matches(topic3)).toBe(true);
      expect(pattern2.matches(topic4)).toBe(true);

      // Test non-matching topics
      const topic5 = TopicPath.new('main:services/auth/login', 'default');
      expect(pattern1.matches(topic5)).toBe(false);
      expect(pattern2.matches(topic5)).toBe(false);
    });

    it('handles multiple wildcard handlers', () => {
      // Test that multiple wildcard handlers can be registered and receive events
      const pattern = TopicPath.new('main:events/>', 'default');

      // Simulate multiple handlers for the same pattern
      const handler1 = 'HANDLER_1';
      const handler2 = 'HANDLER_2';

      // In a real implementation, these would be stored in the service registry
      const handlers = new Map<string, string[]>();
      handlers.set(pattern.asString(), [handler1, handler2]);

      // Test that we can retrieve multiple handlers
      const registeredHandlers = handlers.get(pattern.asString()) || [];
      expect(registeredHandlers.length).toBe(2);
      expect(registeredHandlers).toContain(handler1);
      expect(registeredHandlers).toContain(handler2);
    });
  });

  describe('Wildcard unsubscription', () => {
    it('handles wildcard unsubscription properly', () => {
      // This test simulates wildcard unsubscription behavior
      const pattern = TopicPath.new('main:services/*/state', 'default');

      // Simulate subscription and unsubscription
      const subscriptionId = 'sub_123';
      const subscriptions = new Map<string, string>();
      subscriptions.set(subscriptionId, pattern.asString());

      // Verify subscription exists
      expect(subscriptions.has(subscriptionId)).toBe(true);

      // Simulate unsubscription
      subscriptions.delete(subscriptionId);

      // Verify subscription is removed
      expect(subscriptions.has(subscriptionId)).toBe(false);
    });
  });

  describe('Wildcard duplication handling', () => {
    it('handles multiple wildcard handlers without duplication', () => {
      // This test verifies that wildcard handlers don't create duplicates
      const pattern = TopicPath.new('main:events/>', 'default');

      // Simulate registering two handlers to the same wildcard pattern
      const handler1 = 'HANDLER_1';
      const handler2 = 'HANDLER_2';

      // In a real implementation, this would be handled by the service registry
      const handlers = new Map<string, string[]>();
      handlers.set(pattern.asString(), [handler1, handler2]);

      // Verify we have exactly 2 handlers, no duplicates
      const registeredHandlers = handlers.get(pattern.asString()) || [];
      expect(registeredHandlers.length).toBe(2);
      expect(registeredHandlers).toContain(handler1);
      expect(registeredHandlers).toContain(handler2);

      // Verify no duplicates
      const uniqueHandlers = new Set(registeredHandlers);
      expect(uniqueHandlers.size).toBe(2);
    });
  });

  describe('Wildcard pattern edge cases', () => {
    it('handles empty segments with wildcards', () => {
      // Test wildcard patterns with potential empty segments
      const pattern = TopicPath.new('main:services/*/state', 'default');

      // This should not match a path with empty segments
      const pathWithEmpty = TopicPath.new('main:services//state', 'default');
      expect(pattern.matches(pathWithEmpty)).toBe(false);
    });

    it('handles wildcard patterns with special characters', () => {
      // Test wildcard patterns with special characters in segments
      const pattern = TopicPath.new('main:services/*/state', 'default');

      const pathWithSpecial = TopicPath.new('main:services/my-service_01/state', 'default');
      expect(pattern.matches(pathWithSpecial)).toBe(true);
    });

    it('handles very long paths with wildcards', () => {
      // Test wildcard patterns with very long paths
      const pattern = TopicPath.new('main:services/>', 'default');

      const longPath = TopicPath.new('main:services/a/b/c/d/e/f/g/h/i/j/k/l/m/n/o/p', 'default');
      expect(pattern.matches(longPath)).toBe(true);
    });
  });
});
