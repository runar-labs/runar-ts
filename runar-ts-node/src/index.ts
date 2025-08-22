import { v4 as uuidv4 } from 'uuid';
import { AnyValue } from 'runar-ts-serializer';
import { PathTrie, TopicPath } from 'runar-ts-common';

import {
  ActionHandler,
  ActionRequest,
  EventMessage,
  EventSubscriber,
  ServiceName,
  AbstractService,
  LifecycleContext,
  NodeLifecycleContext,
  ServiceState,
  RequestContext,
  EventContextImpl,
} from './core';
import { Logger, Component } from 'runar-ts-common';
import { Logger as LoggerClass, Component as ComponentEnum } from 'runar-ts-common/src/logging/logger.js';
import { SubscriptionMetadata } from 'runar-ts-schemas';
// REMOVED: RemoteAdapter - not in Rust API
import { isOk, unwrap, unwrapErr, Result, ok, err } from 'runar-ts-common';
export { NodeConfig } from './config';
// REMOVED: RemoteAdapter export - not in Rust API
import { RegistryService } from './registry_service';
export { RegistryService } from './registry_service';
export { NodeRegistryDelegate } from './registry_delegate';
export type { RegistryDelegate } from './registry_delegate';
// REMOVED: RemoteAdapter exports - not in Rust API
import { KeysService } from './keys_service';
export { KeysService } from './keys_service';
export { NapiKeysDelegate } from './keys_delegate';

type SubscriberKind = 'Local' | 'Remote';
type FullSubscriptionEntry = {
  id: string;
  kind: SubscriberKind;
  metadata: SubscriptionMetadata;
  serviceTopic: TopicPath;
  subscriber: EventSubscriber;
};

export class ServiceRegistry {
  private actionHandlers = new PathTrie<ActionHandler>();
  private eventSubscriptions = new PathTrie<FullSubscriptionEntry[]>();
  private subscriptionIdToTopic = new Map<string, TopicPath>();
  private subscriptionIdToServiceTopic = new Map<string, TopicPath>();
  private localServices = new Map<string, ServiceEntry>();
  private localServiceStates = new Map<string, ServiceState>();

  addLocalActionHandler(topic: TopicPath, handler: ActionHandler): void {
    this.actionHandlers.setValue(topic, handler);
  }

  findLocalActionHandlers(topic: TopicPath): ActionHandler[] {
    return this.actionHandlers.findMatches(topic).map(m => m.content);
  }

  subscribe(
    topic: TopicPath,
    serviceTopic: TopicPath,
    subscriber: EventSubscriber,
    metadata: SubscriptionMetadata,
    kind: SubscriberKind = 'Local'
  ): string {
    const id = uuidv4();
    const existingMatches = this.eventSubscriptions.findMatches(topic);
    const existing = existingMatches.length > 0 ? existingMatches[0]!.content : [];
    const entry: FullSubscriptionEntry = { id, kind, metadata, serviceTopic, subscriber };
    this.eventSubscriptions.setValue(topic, [...existing, entry]);
    this.subscriptionIdToTopic.set(id, topic);
    this.subscriptionIdToServiceTopic.set(id, serviceTopic);
    return id;
  }

  unsubscribe(subscriptionId: string): boolean {
    const topic = this.subscriptionIdToTopic.get(subscriptionId);
    if (!topic) return false;
    const existingMatches = this.eventSubscriptions.findMatches(topic);
    const existing = existingMatches.length > 0 ? existingMatches[0]!.content : [];
    const filtered = existing.filter(e => e.id !== subscriptionId);
    this.eventSubscriptions.setValue(topic, filtered);
    this.subscriptionIdToTopic.delete(subscriptionId);
    this.subscriptionIdToServiceTopic.delete(subscriptionId);
    return true;
  }

  getSubscribers(topic: TopicPath): FullSubscriptionEntry[] {
    const exact = this.eventSubscriptions.getExactValues(topic);
    return exact.flatMap(list => list);
  }

  addLocalService(entry: ServiceEntry): void {
    this.localServices.set(
      entry.serviceTopic.asString?.() ??
        `${entry.serviceTopic.networkId()}:${entry.serviceTopic.servicePath()}`,
      entry
    );
    this.localServiceStates.set(entry.service.path(), entry.serviceState);
  }

  getLocalServices(): ServiceEntry[] {
    return Array.from(this.localServices.values());
  }

  updateServiceState(servicePath: string, state: ServiceState): void {
    for (const [k, v] of this.localServices.entries()) {
      if (v.service.path() === servicePath) {
        v.serviceState = state;
        if (state === ServiceState.Running) v.lastStartTime = Date.now();
        this.localServices.set(k, v);
        this.localServiceStates.set(servicePath, state);
        break;
      }
    }
  }

  getLocalServiceState(serviceTopic: TopicPath): ServiceState | undefined {
    return this.localServiceStates.get(serviceTopic.servicePath());
  }

  validatePauseTransition(serviceTopic: TopicPath): void {
    const curr = this.getLocalServiceState(serviceTopic);
    if (curr !== ServiceState.Running) {
      throw new Error('Service must be Running to pause');
    }
  }

  validateResumeTransition(serviceTopic: TopicPath): void {
    const curr = this.getLocalServiceState(serviceTopic);
    if (curr !== ServiceState.Paused) {
      throw new Error('Service must be Paused to resume');
    }
  }
}

export interface PublishOptions {
  retain?: boolean;
}

export interface EventRegistrationOptions {
  includePast?: number;
}

export interface ServiceEntry {
  service: AbstractService;
  serviceTopic: TopicPath;
  serviceState: ServiceState;
  registrationTime: number;
  lastStartTime?: number;
}

export class Node {
  private readonly networkId: string;
  private readonly registry = new ServiceRegistry();
  private readonly logger: Logger;
  private running = false;
  private retainedEvents = new Map<
    string,
    Array<{ ts: number; event: string; payload: AnyValue }>
  >();
  private retainedIndex = new PathTrie<string>();
  private retainedKeyToTopic = new Map<string, TopicPath>();
  private readonly maxRetainedPerTopic = 100;
// REMOVED: remoteAdapter - not in Rust API

  constructor(networkId = 'default') {
    this.networkId = networkId;
    try {
      this.logger = LoggerClass.newRoot(ComponentEnum.Node).setNodeId(networkId);
    } catch (error) {
      console.error('Failed to create logger:', error);
      this.logger = console; // fallback
    }
  }

  static fromConfig(cfg: {
    defaultNetworkId: string;
    transportOptions?: unknown;
    discoveryOptions?: unknown;
    keys?: unknown;
  }): Node {
    const n = new Node(cfg.defaultNetworkId);
    return n;
  }

  private getLocalServicesSnapshot = (): ServiceEntry[] => {
    return this.registry.getLocalServices();
  };

  addService(service: AbstractService): void {
    const serviceTopic = TopicPath.newService(this.networkId, service.path());
    const entry: ServiceEntry = {
      service,
      serviceTopic,
      serviceState: ServiceState.Created,
      registrationTime: Date.now(),
      lastStartTime: undefined,
    };
    this.registry.addLocalService(entry);
  }

  addKeysService(delegate: { ensureSymmetricKey(name: string): Promise<Uint8Array> }): void {
    this.addService(new KeysService(delegate));
  }

  async start(): Promise<void> {
    if (this.running) return;

    // Start internal registry service first
    const reg = new RegistryService(this.getLocalServicesSnapshot);
    reg.setNetworkId(this.networkId);
    const regCtx = new NodeLifecycleContext(this.networkId, reg.path(), this.logger, this);
    try {
      this.logger?.info?.('About to call RegistryService.init()');
    await reg.init(regCtx);
      this.logger?.info?.('RegistryService.init() completed successfully');
    } catch (error) {
      this.logger?.error?.('RegistryService.init() failed:', error);
      throw error;
    }
    this.addService(reg);

    for (const entry of this.registry.getLocalServices()) {
      const svc = entry.service;
      if (svc === reg) continue; // already init
      svc.setNetworkId(this.networkId);
      const ctx = new NodeLifecycleContext(this.networkId, svc.path(), this.logger, this);
      await svc.init(ctx);
      this.registry.updateServiceState(svc.path(), ServiceState.Initialized);
    }
    for (const entry of this.registry.getLocalServices()) {
      const svc = entry.service;
      const ctx = new NodeLifecycleContext(this.networkId, svc.path(), this.logger, this);
      await svc.start(ctx);
      this.registry.updateServiceState(svc.path(), ServiceState.Running);
    }

    this.running = true;
    this.logger?.info?.(`Node.start() completed, node is now running: ${this.running}`);
  }

  async stop(): Promise<void> {
    if (!this.running) return;

    for (const entry of this.registry.getLocalServices()) {
      const svc = entry.service;
      const ctx = new NodeLifecycleContext(this.networkId, svc.path(), this.logger, this);
      await svc.stop(ctx);
      this.registry.updateServiceState(svc.path(), ServiceState.Stopped);
    }
    this.running = false;
  }













  clearRetainedEventsMatching(pattern: string): number {
    const fullPattern = pattern.includes(':') ? pattern : `${this.networkId}:${pattern}`;
    const topicPattern = TopicPath.new(fullPattern, this.networkId);
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

  // Helper method to get retained events for a topic
  private getRetainedEvents(topicPath: TopicPath): EventMessage[] {
    const matchedKeys = this.retainedIndex.findWildcardMatches(topicPath).map(m => m.content);
    const events: EventMessage[] = [];

    for (const key of matchedKeys) {
      const list = this.retainedEvents.get(key);
      if (list) {
        const topic = this.retainedKeyToTopic.get(key);
        if (topic) {
          events.push(...list.map(event => ({
            service: topic.servicePath(),
            event: event.event,
            payload: event.payload,
            timestampMs: event.ts,
          })));
        }
      }
    }

    return events;
  }

  // === Rust-compatible API methods ===

  /**
   * Rust-compatible request method - matches Rust API exactly
   */
  async request<P = unknown>(path: string, payload?: P): Promise<Result<AnyValue, string>> {
    this.logger?.debug?.(`request called with path: ${path}`);
    try {
      if (!this.running) return err('Node not started');

      const topicPath = TopicPath.new(path, this.networkId);
      if (!topicPath) {
        return err(`Invalid topic path: ${path}`);
      }

      const handlers = this.registry.findLocalActionHandlers(topicPath);
      if (handlers.length === 0) {
        // REMOVED: Remote fallback - not in Rust API (only local services)
        return err(`No handler for ${path}`);
      }

      // In-memory AnyValue path
      const payloadAv =
        payload !== undefined
          ? payload instanceof AnyValue
            ? payload
            : AnyValue.from(payload)
          : AnyValue.null();
      const service = topicPath.servicePath();
      const action = path.split('/').pop() || '';
      const requestId = uuidv4();

      // Extract path parameters from the action path (everything after service)
      const actionPath = path.substring(path.indexOf('/') + 1);
      const pathParams = this.extractPathParams(actionPath);

      // Create RequestContext for handler
      const requestContext: RequestContext = {
        networkId: this.networkId,
        servicePath: service,
        requestId: requestId,
        logger: this.logger?.withActionPath?.(`${service}/${action}`) || this.logger,
        pathParams,
      };

      // Call handler with new signature
      const res = await handlers[0]!(payloadAv, requestContext);
      if (res.ok && res.value) {
        return ok(res.value);
      }
      return err(res.error || 'Unknown error');
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  }

  // Helper method for publish with options (used by LifecycleContext)
  async publish_with_options(
    topic: string,
    data?: AnyValue,
    options?: any
  ): Promise<Result<void, string>> {
    try {
      if (!this.running) return err('Node not started');

      const topicPath = TopicPath.new(topic, this.networkId);
      if (!topicPath) {
        return err(`Invalid topic path: ${topic}`);
      }

      const subs = this.registry.getSubscribers(topicPath);
      const payload = data || AnyValue.null();
      const service = topicPath.servicePath();
      const event = topic.split('/').pop() || '';
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
            this.networkId,
            message.service,
            message.event,
            true, // isLocal
            this.logger?.withEventPath?.(`${topicPath.servicePath()}/${message.event}`) || this.logger,
            this
          );
          return s.subscriber(message.payload, eventContext);
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
        list.push({ ts: message.timestampMs, event, payload });
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

      const topicPath = TopicPath.new(topic, this.networkId);
      if (!topicPath) {
        return err(`Invalid topic path: ${topic}`);
      }

      const subs = this.registry.getSubscribers(topicPath);
      const payload = data || AnyValue.null();

      const service = topicPath.servicePath();
      const event = topic.split('/').pop() || '';
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
            this.networkId,
            message.service,
            message.event,
            true, // isLocal
            this.logger?.withEventPath?.(`${topicPath.servicePath()}/${message.event}`) || this.logger,
            this
          );
          return s.subscriber(message.payload, eventContext);
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
   */
  async subscribe(
    topic: string,
    callback: EventSubscriber,
    options?: { includePast?: boolean }
  ): Promise<Result<string, string>> {
    try {
      if (!this.running) return err('Node not started');

      const topicPath = TopicPath.new(topic, this.networkId);
      if (!topicPath) {
        return err(`Invalid topic path: ${topic}`);
      }

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
            this.networkId,
            event.service,
            event.event,
            true, // isLocal - retained events are always local
            this.logger?.withEventPath?.(`${event.service}/${event.event}`) || this.logger,
            this
          );
          callback(event.payload, eventContext);
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

      const callback = (event: EventMessage) => {
        if (!resolved) {
          resolved = true;
          resolve(ok(event.payload));
        }
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

  // Extract path parameters from action template
  private extractPathParams(actionPath: string): Map<string, string> {
    const pathParams = new Map<string, string>();
    this.logger?.debug?.(`extractPathParams called with actionPath: ${actionPath}`);

    // Match patterns like services/{service_path} or services/{service_path}/state
    const servicePathMatch = actionPath.match(/^services\/([^\/]+)(?:\/(.+))?$/);
    if (servicePathMatch) {
      const servicePath = servicePathMatch[1];
      if (servicePath) {
        pathParams.set('service_path', servicePath);
        this.logger?.debug?.(`extracted service_path: ${servicePath}`);
      }

      const actionType = servicePathMatch[2];
      if (actionType) {
        pathParams.set('action_type', actionType);
        this.logger?.debug?.(`extracted action_type: ${actionType}`);
      }
    } else {
      this.logger?.debug?.(`no match found for actionPath: ${actionPath}`);
    }

    this.logger?.debug?.(`final pathParams: ${Array.from(pathParams.entries()).map(([k, v]) => `${k}=${v}`).join(', ')}`);
    return pathParams;
  }
}
