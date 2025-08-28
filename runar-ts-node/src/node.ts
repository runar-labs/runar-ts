import { v4 as uuidv4 } from 'uuid';
import { AnyValue } from 'runar-ts-serializer';
import { PathTrie, TopicPath, Logger } from 'runar-ts-common';
import type { Keys } from 'runar-nodejs-api';
import { KeysManagerWrapper } from './keys_manager_wrapper';
import { SerializationContext } from 'runar-ts-serializer';
import { KeysService } from './keys_service';
import { RegistryService } from './registry_service';
import { NodeConfig } from './config';
import { ServiceRegistry } from './registry';
import {
  AbstractService,
  ServiceEntry,
  ServiceState,
  NodeDelegate,
  RequestContext,
  EventContext,
} from './service';
import { EventMessage, EventSubscriber } from './events';
import { NodeLifecycleContextImpl, RequestContextImpl, EventContextImpl } from './context';
import { PublishOptions, EventRegistrationOptions } from './events';
import { SubscriptionMetadata } from 'runar-ts-schemas';
import { Result, err, ok } from 'runar-ts-common';

// Import logger components
const { Logger: LoggerClass, Component: ComponentEnum } = require('runar-ts-common');

// Helper function to check if result is ok
function isOk<T, E>(result: Result<T, E>): result is Result<T, E> & { ok: true } {
  return result.ok;
}

// Helper function to unwrap error
function unwrapErr<T, E>(result: Result<T, E>): E {
  if (result.ok) {
    throw new Error('Called unwrapErr on Ok result');
  }
  return result.error;
}

// Helper function to unwrap value
function unwrap<T, E>(result: Result<T, E>): T {
  if (!result.ok) {
    throw new Error(`Called unwrap on Err result: ${result.error}`);
  }
  return result.value;
}

/**
 * The Node class is the primary entry point for the Runar system.
 * It manages the service registry, handles requests, and coordinates
 * event publishing and subscriptions.
 */
export class Node {
  private readonly networkId: string;
  private readonly registry = new ServiceRegistry();
  private readonly logger: Logger;
  private readonly keysManager: Keys; // Store the extracted keys manager
  private readonly keysWrapper: KeysManagerWrapper; // Wrapper for serializer
  private readonly config: NodeConfig;
  private running = false;
  private retainedEvents = new Map<
    string,
    Array<{ ts: number; event: string; payload: AnyValue }>
  >();
  private retainedIndex = new PathTrie<string>();
  private retainedKeyToTopic = new Map<string, TopicPath>();
  private readonly maxRetainedPerTopic = 100;

  constructor(config: NodeConfig) {
    // Extract the key manager from config (matching Rust)
    const keysManager = config.getKeyManager();
    if (!keysManager) {
      throw new Error('Failed to load node credentials. Use withKeyManager() method.');
    }

    this.config = config;
    this.networkId = config.defaultNetworkId;
    this.keysManager = keysManager;

    // Create wrapper for serializer (matching Rust NodeKeyManagerWrapper)
    this.keysWrapper = new KeysManagerWrapper(this.keysManager);

    this.logger = LoggerClass.newRoot(ComponentEnum.Node).setNodeId(this.networkId) as any;
  }

  // Method to get keys wrapper for serializer (matching Rust pattern)
  getKeysWrapper(): KeysManagerWrapper {
    return this.keysWrapper;
  }

  // Method to create serialization context (matching Rust pattern)
  createSerializationContext(): SerializationContext {
    return {
      keystore: this.keysWrapper,
      resolver: undefined, // Would need to implement this
    };
  }

  private getLocalServicesSnapshot = (): ServiceEntry[] => {
    return this.registry.getLocalServices();
  };

  addService(service: AbstractService): void {
    const serviceTopicResult = TopicPath.newService(this.networkId, service.path());
    if (!serviceTopicResult.ok) {
      throw new Error(`Failed to create service topic: ${serviceTopicResult.error}`);
    }
    const serviceTopic = serviceTopicResult.value;
    const entry: ServiceEntry = {
      service,
      serviceTopic,
      serviceState: ServiceState.Created,
      registrationTime: Date.now(),
      lastStartTime: undefined,
    };
    this.registry.addLocalService(entry);
  }

  addKeysService(delegate: KeysManagerWrapper): void {
    this.addService(new KeysService(delegate));
  }

  async start(): Promise<void> {
    this.logger?.info?.('Starting node...');

    if (this.running) {
      this.logger?.warn?.('Node already running');
      return;
    }

    // First, add the RegistryService as an internal service
    const reg = new RegistryService(this.getLocalServicesSnapshot);
    reg.setNetworkId(this.networkId);
    this.addService(reg);

    // Get all services including the newly added RegistryService
    const localServices = this.registry.getLocalServices();

    // Categorize services into internal and non-internal
    const internalServices = localServices.filter(entry =>
      this.isInternalService(entry.service.path())
    );
    const nonInternalServices = localServices.filter(
      entry => !this.isInternalService(entry.service.path())
    );

    // Start internal services first
    for (const serviceEntry of internalServices) {
      await this.startService(serviceEntry.serviceTopic, serviceEntry, false);
    }

    // TODO: Start networking if enabled (when networking is implemented)
    // if (this.supports_networking) {
    //   if let Err(e) = self.start_networking().await {
    //     log_error!(self.logger, "Failed to start networking components: {e}");
    //     return Err(e);
    //   }
    // }

    this.logger?.info?.('Node started successfully - it will start all services now');
    this.running = true;

    // Start non-internal services in parallel to avoid blocking the loop
    const serviceStartTimeout = 30000; // 30 seconds timeout
    const serviceTasks: Array<{ serviceTopic: TopicPath; task: Promise<void> }> = [];

    for (const serviceEntry of nonInternalServices) {
      const task = this.startServiceWithTimeout(
        serviceEntry.serviceTopic,
        serviceEntry,
        serviceStartTimeout
      );
      serviceTasks.push({ serviceTopic: serviceEntry.serviceTopic, task });
    }

    // Wait for all service tasks to complete
    await Promise.allSettled(serviceTasks.map(({ task }) => task));
  }

  private async startServiceWithTimeout(
    serviceTopic: TopicPath,
    serviceEntry: ServiceEntry,
    timeoutMs: number
  ): Promise<void> {
    try {
      await Promise.race([
        this.startService(serviceTopic, serviceEntry, true),
        new Promise((_, reject) =>
          setTimeout(
            () =>
              reject(new Error(`Service start timed out after ${timeoutMs}ms: ${serviceTopic}`)),
            timeoutMs
          )
        ),
      ]);
    } catch (error) {
      this.logger?.error?.(`Service start failed for ${serviceTopic}: ${error}`);
    }
  }

  private async startService(
    serviceTopic: TopicPath,
    serviceEntry: ServiceEntry,
    updateNodeVersion: boolean
  ): Promise<void> {
    this.logger?.info?.(`[startService] Starting service: ${serviceTopic}`);

    // Create lifecycle context for the service
    const stopContext = new NodeLifecycleContextImpl(
      serviceTopic.networkId(),
      serviceTopic.servicePath(),
      this.logger,
      this
    );

    // Initialize the service
    await serviceEntry.service.init(stopContext);
    this.registry.updateServiceState(serviceEntry.service.path(), ServiceState.Initialized);

    // Start the service
    await serviceEntry.service.start(stopContext);
    this.registry.updateServiceState(serviceEntry.service.path(), ServiceState.Running);

    this.logger?.info?.(`Service start completed: ${serviceTopic}`);
  }

  private isInternalService(servicePath: string): boolean {
    // Internal services are $registry and $keys (matching Rust INTERNAL_SERVICES)
    const internalServices = ['$registry', '$keys'];

    // Check if it starts with an internal service directly (exact match or followed by /)
    for (const internal of internalServices) {
      if (servicePath === internal || servicePath.startsWith(`${internal}/`)) {
        return true;
      }
    }

    // Check if it has the pattern <network_id>:<internal_service>/...
    const colonIndex = servicePath.indexOf(':');
    if (colonIndex !== -1) {
      const afterColon = servicePath.substring(colonIndex + 1);
      for (const internal of internalServices) {
        if (afterColon === internal || afterColon.startsWith(`${internal}/`)) {
          return true;
        }
      }
    }

    return false;
  }

  async stop(): Promise<void> {
    this.logger?.info?.('Stopping node...');

    if (!this.running) {
      this.logger?.warn?.('Node already stopped');
      return;
    }

    this.running = false;

    // Get services directly and stop them
    const localServices = this.registry.getLocalServices();

    this.logger?.info?.('Stopping services...');
    // Stop each service
    for (const serviceEntry of localServices) {
      this.logger?.info?.(`Stopping service: ${serviceEntry.serviceTopic}`);

      // Create a lifecycle context for stopping
      const stopContext = new NodeLifecycleContextImpl(
        serviceEntry.serviceTopic.networkId(),
        serviceEntry.serviceTopic.servicePath(),
        this.logger,
        this
      );

      // Stop the service using the context
      try {
        await serviceEntry.service.stop(stopContext);
        this.registry.updateServiceState(serviceEntry.service.path(), ServiceState.Stopped);
      } catch (error) {
        this.logger?.error?.(
          `Failed to stop service: ${serviceEntry.serviceTopic}, error: ${error}`
        );
      }
    }

    // TODO: Stop networking if enabled (when networking is implemented)
    // if (this.supports_networking) {
    //   self.shutdown_network().await?;
    // }

    // TODO: Stop all service tasks (when service tasks are implemented)
    // let mut service_tasks = self.service_tasks.write().await;
    // for (_, task) in service_tasks.drain(..) {
    //   task.abort();
    // }

    this.logger?.info?.('Node stopped successfully');
  }

  // Helper method to get retained events for a topic
  private getRetainedEvents(topicPath: TopicPath): EventMessage[] {
    const matchedKeys = this.retainedIndex.findWildcardMatches(topicPath).map(m => m.content);
    const events: EventMessage[] = [];

    for (const key of matchedKeys) {
      const list = this.retainedEvents.get(key);
      if (list) {
        const topic = this.retainedKeyToTopic.get(key);
        if (topic) {
          events.push(
            ...list.map(event => ({
              service: topic.servicePath(),
              event: event.event,
              payload: event.payload,
              timestampMs: event.ts,
            }))
          );
        }
      }
    }

    return events;
  }

  /**
   * TEST UTILITY METHOD - Only for testing purposes
   * Clears retained events matching a pattern
   * @param pattern Topic pattern to match
   * @returns Number of events removed
   */
  clearRetainedEventsMatching(pattern: string): number {
    // Use TopicPath constructor which handles default networkId automatically
    const topicPatternResult = TopicPath.new(pattern, this.networkId);
    if (!topicPatternResult.ok) {
      return 0; // No matches if pattern is invalid
    }
    const topicPattern = topicPatternResult.value;
    const matchedKeys = this.retainedIndex.findWildcardMatches(topicPattern).map(m => m.content);
    let removed = 0;
    for (const key of matchedKeys) {
      const topic = this.retainedKeyToTopic.get(key);
      if (topic) {
        // Remove exact mapping from index
        this.retainedIndex.removeValues(topic);
        this.retainedKeyToTopic.delete(key);
      }
      if (this.retainedEvents.delete(key)) removed++;
    }
    return removed;
  }

  // === Rust-compatible API methods ===

  /**
   * Local request method - only tries local handlers, matches Rust local_request
   */
  async local_request<P = unknown>(path: string, payload?: P): Promise<Result<AnyValue, string>> {
    this.logger?.debug?.(`local_request called with path: ${path}`);
    try {
      if (!this.running) return err('Node not started');

      const topicPathResult = TopicPath.new(path, this.networkId);
      if (!topicPathResult.ok) {
        return err(`Invalid topic path: ${topicPathResult.error}`);
      }
      const topicPath = topicPathResult.value;

      const handlers = this.registry.findLocalActionHandlers(topicPath);
      if (handlers.length === 0) {
        return err(`No local handler for ${path}`);
      }

      // In-memory AnyValue path
      const payloadAv =
        payload !== undefined
          ? payload instanceof AnyValue
            ? payload
            : AnyValue.from(payload)
          : AnyValue.null();
      const service = topicPath.servicePath();
      const actionPath = topicPath.actionPath();
      const action = this.getLastPathSegment(actionPath);
      const requestId = uuidv4();

      // Extract path parameters from the action path (everything after service)
      const pathParams = this.extractPathParams(topicPath);

      // Create RequestContext for handler
      const requestContext: RequestContext = {
        topicPath,
        node: this,
        networkId: this.networkId,
        logger: this.logger?.withActionPath?.(`${service}/${action}`) || this.logger,
        pathParams,
        request: this.request.bind(this),
        publish: this.publish.bind(this),
        debug: (message: string) => this.logger?.debug?.(message),
        info: (message: string) => this.logger?.info?.(message),
        warn: (message: string) => this.logger?.warn?.(message),
        error: (message: string) => this.logger?.error?.(message),
      };

      // Call handler with new signature
      const res = await handlers[0]!(payloadAv, requestContext);
      if (res.ok && res.value) {
        return ok(res.value);
      }
      return err(!res.ok ? res.error : 'Unknown error');
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Remote request method - only tries remote handlers, matches Rust remote_request
   */
  async remote_request<P = unknown>(path: string, payload?: P): Promise<Result<AnyValue, string>> {
    // TODO: Implement remote request functionality when remote services are added
    // For now, this is a stub that matches the Rust API signature
    this.logger?.debug?.(`remote_request called with path: ${path} (not yet implemented)`);
    return err(`Remote request not yet implemented: ${path}`);
  }

  /**
   * Rust-compatible request method - matches Rust API exactly with smart routing
   */
  async request<P = unknown>(path: string, payload?: P): Promise<Result<AnyValue, string>> {
    this.logger?.debug?.(`request called with path: ${path}`);
    try {
      if (!this.running) return err('Node not started');

      const topicPathResult = TopicPath.new(path, this.networkId);
      if (!topicPathResult.ok) {
        return err(`Invalid topic path: ${topicPathResult.error}`);
      }
      const topicPath = topicPathResult.value;

      // First check local service state - if no state exists, no local service exists
      const serviceTopic = TopicPath.newService(this.networkId, topicPath.servicePath());
      if (!serviceTopic.ok) {
        return err(`Failed to create service topic: ${serviceTopic.error}`);
      }

      const serviceState = this.registry.getLocalServiceState(serviceTopic.value);
      this.logger?.debug?.(`Service ${topicPath.servicePath()} state: ${serviceState}`);

      // If service state exists, check if it's running
      if (serviceState !== undefined) {
        if (serviceState !== ServiceState.Running) {
          this.logger?.debug?.(
            `Service ${topicPath.servicePath()} is in ${serviceState} state, trying remote handlers`
          );
          // Try remote handlers instead
          const remoteResult = await this.remote_request(path, payload);
          if (remoteResult.ok) {
            return remoteResult;
          } else {
            // Remote request failed - return state-specific error since we know local service exists but is not running
            return err(`Service is not Running - it is in ${serviceState} state`);
          }
        }
      }

      // Service is either running or doesn't exist locally - check for local handler
      const handlers = this.registry.findLocalActionHandlers(topicPath);
      this.logger?.debug?.(`Found ${handlers.length} local handlers for ${topicPath}`);
      if (handlers.length === 0) {
        // No local handler found - try remote handlers
        this.logger?.debug?.(`No local handlers found for ${topicPath}, trying remote`);
        return await this.remote_request(path, payload);
      }

      // In-memory AnyValue path
      const payloadAv =
        payload !== undefined
          ? payload instanceof AnyValue
            ? payload
            : AnyValue.from(payload)
          : AnyValue.null();
      const service = topicPath.servicePath();
      const actionPath = topicPath.actionPath();
      const action = actionPath.split('/').pop() || '';
      const requestId = uuidv4();

      // Extract path parameters from the action path (everything after service)
      const pathParams = this.extractPathParams(topicPath);

      // Create RequestContext for handler
      const requestContext: RequestContext = {
        topicPath,
        node: this,
        networkId: this.networkId,
        logger: this.logger?.withActionPath?.(`${service}/${action}`) || this.logger,
        pathParams,
        request: this.request.bind(this),
        publish: this.publish.bind(this),
        debug: (message: string) => this.logger?.debug?.(message),
        info: (message: string) => this.logger?.info?.(message),
        warn: (message: string) => this.logger?.warn?.(message),
        error: (message: string) => this.logger?.error?.(message),
      };

      // Call handler with new signature
      const res = await handlers[0]!(payloadAv, requestContext);
      if (res.ok && res.value) {
        return ok(res.value);
      }
      return err(!res.ok ? res.error : 'Unknown error');
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  }

  // Helper method for publish with options (used by LifecycleContext)
  async publish_with_options(
    topic: string,
    data?: AnyValue,
    options?: PublishOptions
  ): Promise<Result<void, string>> {
    try {
      if (!this.running) return err('Node not started');

      const topicPathResult = TopicPath.new(topic, this.networkId);
      if (!topicPathResult.ok) {
        return err(`Invalid topic path: ${topicPathResult.error}`);
      }
      const topicPath = topicPathResult.value;

      const subs = this.registry.getSubscribers(topicPath);
      const payload = data || AnyValue.null();
      const service = topicPath.servicePath();
      const eventPath = topicPath.actionPath();
      const event = this.getLastPathSegment(eventPath);
      const message: EventMessage = {
        service,
        event,
        payload,
        timestampMs: Date.now(),
      };

      // Always deliver locally first
      await Promise.allSettled(
        subs.map(s => {
          const eventContext = new EventContextImpl(
            topicPath,
            this,
            this.logger?.withEventPath?.(`${topicPath.servicePath()}/${message.event}`) ||
              this.logger
          );
          return s.subscriber(eventContext, message.payload);
        })
      );

      // Handle retained events if requested
      if (options?.retain) {
        const key = `${this.networkId}:${topicPath.servicePath()}/${topicPath.actionPath()}`;
        this.logger?.debug?.(
          `Storing retained event for key: ${key}, service: ${service}, event: ${event}`
        );
        this.logger?.debug?.(
          `topicPath.servicePath(): ${topicPath.servicePath()}, topicPath.actionPath(): ${topicPath.actionPath()}`
        );
        const list = this.retainedEvents.get(key) ?? [];
        list.push({ ts: message.timestampMs || Date.now(), event, payload });
        if (list.length > this.maxRetainedPerTopic) {
          list.splice(0, list.length - this.maxRetainedPerTopic);
        }
        this.retainedEvents.set(key, list);
        this.retainedIndex.setValue(topicPath, key);
        this.retainedKeyToTopic.set(key, topicPath);
        this.logger?.debug?.(`Retained events for key ${key}: ${list.length} events`);
      }

      // REMOVED: Remote forwarding - not in Rust API (only local events)

      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Rust-compatible publish method - matches Rust API exactly
   */
  async publish(topic: string, data?: AnyValue): Promise<Result<void, string>> {
    try {
      if (!this.running) return err('Node not started');

      const topicPathResult = TopicPath.new(topic, this.networkId);
      if (!topicPathResult.ok) {
        return err(`Invalid topic path: ${topicPathResult.error}`);
      }
      const topicPath = topicPathResult.value;

      const subs = this.registry.getSubscribers(topicPath);
      const payload = data || AnyValue.null();

      const service = topicPath.servicePath();
      const eventPath = topicPath.actionPath();
      const event = this.getLastPathSegment(eventPath);
      const message: EventMessage = {
        service,
        event,
        payload,
        timestampMs: Date.now(),
      };

      // Always deliver locally first
      await Promise.allSettled(
        subs.map(s => {
          const eventContext = new EventContextImpl(
            topicPath,
            this,
            this.logger?.withEventPath?.(`${topicPath.servicePath()}/${message.event}`) ||
              this.logger
          );
          return s.subscriber(eventContext, message.payload);
        })
      );

      // REMOVED: Remote forwarding - not in Rust API (only local events)

      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Rust-compatible subscribe method - matches Rust API exactly
   * Only handles local subscriptions (matching Rust implementation)
   */
  async subscribe(
    topic: string,
    callback: EventSubscriber,
    options?: EventRegistrationOptions
  ): Promise<Result<string, string>> {
    try {
      if (!this.running) return err('Node not started');

      const topicPathResult = TopicPath.new(topic, this.networkId);
      if (!topicPathResult.ok) {
        return err(`Invalid topic path: ${topicPathResult.error}`);
      }
      const topicPath = topicPathResult.value;

      const metadata: SubscriptionMetadata = {
        path: topic,
      };

      const subscriptionId = this.registry.subscribe(
        topicPath,
        topicPath,
        callback,
        metadata,
        'Local'
      );

      // Deliver past events if requested
      if (options?.includePast) {
        const pastEvents = this.getRetainedEvents(topicPath);
        for (const event of pastEvents) {
          const eventContext = new EventContextImpl(
            topicPath,
            this,
            this.logger?.withEventPath?.(`${event.service}/${event.event}`) || this.logger
          );
          callback(eventContext, event.payload);
        }
      }

      return ok(subscriptionId);
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Rust-compatible unsubscribe method - matches Rust API exactly
   */
  async unsubscribe(subscriptionId: string): Promise<Result<void, string>> {
    try {
      const success = this.registry.unsubscribe(subscriptionId);
      if (!success) {
        return err(`Subscription not found: ${subscriptionId}`);
      }
      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Rust-compatible on method - matches Rust API exactly
   * Waits for a single event and returns it
   */
  async on(
    topic: string,
    options?: { timeout?: number; includePast?: boolean }
  ): Promise<Result<AnyValue | undefined, string>> {
    if (!this.running) {
      return err('Node not started');
    }

    return new Promise(resolve => {
      let resolved = false;
      let timeoutId: NodeJS.Timeout | undefined;

      const cleanup = (subscriptionId?: string) => {
        if (subscriptionId) {
          this.registry.unsubscribe(subscriptionId);
        }
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      };

      const callback: EventSubscriber = async (context: EventContext, data?: AnyValue) => {
        if (!resolved) {
          resolved = true;
          resolve(ok(data));
        }
        return ok(undefined);
      };

      // Set up timeout
      if (options?.timeout) {
        timeoutId = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            resolve(ok(undefined)); // Timeout with no event
          }
        }, options.timeout);
      }

      // Subscribe (this is the only await in the Promise constructor)
      (async () => {
        const subscribeResult = await this.subscribe(topic, callback, {
          includePast: options?.includePast,
        });
        if (!isOk(subscribeResult)) {
          resolve(err(unwrapErr(subscribeResult)));
          return;
        }

        const subscriptionId = unwrap(subscribeResult);

        // Clean up subscription after timeout or event
        setImmediate(() => {
          if (resolved) {
            cleanup(subscriptionId as string);
          }
        });
      })();
    });
  }

  // Extract path parameters from action template using TopicPath
  private extractPathParams(topicPath: TopicPath): Map<string, string> {
    const pathParams = new Map<string, string>();
    this.logger?.debug?.(`extractPathParams called with topicPath: ${topicPath}`);

    // Extract service path from TopicPath
    const servicePath = topicPath.servicePath();
    if (servicePath) {
      pathParams.set('service_path', servicePath);
      this.logger?.debug?.(`extracted service_path: ${servicePath}`);
    }

    // Extract action type from TopicPath action path
    const actionPath = topicPath.actionPath();
    if (actionPath && actionPath !== '') {
      // Get the last segment of the action path using helper method
      const actionType = this.getLastPathSegment(actionPath);
      if (actionType) {
        pathParams.set('action_type', actionType);
        this.logger?.debug?.(`extracted action_type: ${actionType}`);
      }
    }

    this.logger?.debug?.(
      `final pathParams: ${Array.from(pathParams.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join(', ')}`
    );
    return pathParams;
  }

  // Helper method to get the last segment of a path (avoids string manipulation)
  private getLastPathSegment(path: string): string {
    if (!path || path === '') return '';
    const segments = path.split('/');
    return segments[segments.length - 1] || '';
  }
}
