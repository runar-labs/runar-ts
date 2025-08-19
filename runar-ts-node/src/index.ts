import { v4 as uuidv4 } from 'uuid';
import { AnyValue, fromCbor, toCbor } from 'runar-ts-serializer';
import {
  ActionHandler,
  ActionRequest,
  ActionResponse,
  EventMessage,
  EventSubscriber,
  ServiceName,
  PathTrie,
  TopicPath,
  AbstractService,
  LifecycleContext,
  ServiceState,
} from 'runar-ts-common';
import { SubscriptionMetadata } from 'runar-ts-schemas';
import { RegistryService } from './registry_service';

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

  addLocalActionHandler(topic: TopicPath, handler: ActionHandler): void {
    this.actionHandlers.setValue(topic, handler);
  }

  findLocalActionHandlers(topic: TopicPath): ActionHandler[] {
    return this.actionHandlers.findMatches(topic).map((m) => m.content);
  }

  subscribe(
    topic: TopicPath,
    serviceTopic: TopicPath,
    subscriber: EventSubscriber,
    metadata: SubscriptionMetadata,
    kind: SubscriberKind = 'Local',
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
    const filtered = existing.filter((e) => e.id !== subscriptionId);
    this.eventSubscriptions.setValue(topic, filtered);
    this.subscriptionIdToTopic.delete(subscriptionId);
    this.subscriptionIdToServiceTopic.delete(subscriptionId);
    return true;
  }

  getSubscribers(topic: TopicPath): FullSubscriptionEntry[] {
    const exact = this.eventSubscriptions.getExactValues(topic);
    return exact.flatMap((list) => list);
  }

  addLocalService(entry: ServiceEntry): void {
    this.localServices.set(entry.serviceTopic.asString?.() ?? `${entry.serviceTopic.networkId()}:${entry.service.path()}`, entry);
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
        break;
      }
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
  private running = false;
  private retainedEvents = new Map<string, Array<{ ts: number; data: Uint8Array | null }>>();
  private retainedIndex = new PathTrie<string>();
  private retainedKeyToTopic = new Map<string, TopicPath>();
  private readonly maxRetainedPerTopic = 100;

  constructor(networkId = 'default') {
    this.networkId = networkId;
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

  async start(): Promise<void> {
    if (this.running) return;

    // Start internal registry service first
    const reg = new RegistryService(this.getLocalServicesSnapshot);
    reg.setNetworkId(this.networkId);
    const regCtx: LifecycleContext = {
      networkId: this.networkId,
      addActionHandler: (actionName: string, handler: ActionHandler) => {
        const topic = TopicPath.newService(this.networkId, reg.path()).newActionTopic(actionName);
        this.registry.addLocalActionHandler(topic, handler);
      },
      publish: async (eventName: string, payload: Uint8Array) => {
        await this.publish(reg.path(), eventName, payload);
      },
    };
    await reg.init(regCtx);
    this.addService(reg);

    for (const entry of this.registry.getLocalServices()) {
      const svc = entry.service;
      if (svc === reg) continue; // already init
      svc.setNetworkId(this.networkId);
      const ctx: LifecycleContext = {
        networkId: this.networkId,
        addActionHandler: (actionName: string, handler: ActionHandler) => {
          const topic = TopicPath.newService(this.networkId, svc.path()).newActionTopic(actionName);
          this.registry.addLocalActionHandler(topic, handler);
        },
        publish: async (eventName: string, payload: Uint8Array) => {
          await this.publish(svc.path(), eventName, payload);
        },
      };
      await svc.init(ctx);
    }
    for (const entry of this.registry.getLocalServices()) {
      const svc = entry.service;
      const ctx: LifecycleContext = {
        networkId: this.networkId,
        addActionHandler: (actionName: string, handler: ActionHandler) => {
          const topic = TopicPath.newService(this.networkId, svc.path()).newActionTopic(actionName);
          this.registry.addLocalActionHandler(topic, handler);
        },
        publish: async (eventName: string, payload: Uint8Array) => {
          await this.publish(svc.path(), eventName, payload);
        },
      };
      await svc.start(ctx);
      this.registry.updateServiceState(svc.path(), ServiceState.Running);
    }
    this.running = true;
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    for (const entry of this.registry.getLocalServices()) {
      const svc = entry.service;
      const ctx: LifecycleContext = {
        networkId: this.networkId,
        addActionHandler: () => {},
        publish: async () => {},
      } as LifecycleContext;
      await svc.stop(ctx);
      this.registry.updateServiceState(svc.path(), ServiceState.Stopped);
    }
    this.running = false;
  }

  async request<TReq = unknown, TRes = unknown>(service: ServiceName, action: string, payload: TReq): Promise<TRes> {
    if (!this.running) throw new Error('Node not started');
    const actionTopic = TopicPath.newService(this.networkId, service).newActionTopic(action);
    const handlers = this.registry.findLocalActionHandlers(actionTopic);
    if (handlers.length === 0) throw new Error(`No handler for ${actionTopic.asString?.() ?? `${this.networkId}:${service}/${action}`}`);
    // Use ArcValue in-memory for local call; serialize only to satisfy ActionRequest shape
    const inArc = AnyValue.from(payload);
    const ser = inArc.serialize();
    if (!ser.ok) throw ser.error;
    const req: ActionRequest = { service, action, payload: ser.value, requestId: uuidv4() };
    const res = await handlers[0]!(req);
    if (res.ok) {
      const outArc = AnyValue.fromBytes<TRes>(res.payload);
      const out = outArc.as<TRes>();
      if (!out.ok) throw out.error;
      return out.value;
    }
    throw new Error(res.error);
  }

  async publish<T = unknown>(service: ServiceName, event: string, payload: T, options?: PublishOptions): Promise<void> {
    if (!this.running) throw new Error('Node not started');
    const evtTopic = TopicPath.newService(this.networkId, service).newEventTopic(event);
    const subs = this.registry.getSubscribers(evtTopic);
    const inArc = AnyValue.from(payload);
    const bytesRes = inArc.serialize();
    if (!bytesRes.ok) throw bytesRes.error;
    const message: EventMessage = { service, event, payload: bytesRes.value, timestampMs: Date.now() };
    if (options?.retain) {
      const key = `${this.networkId}:${service}/${event}`;
      const list = this.retainedEvents.get(key) ?? [];
      list.push({ ts: message.timestampMs, data: message.payload });
      if (list.length > this.maxRetainedPerTopic) {
        list.splice(0, list.length - this.maxRetainedPerTopic);
      }
      this.retainedEvents.set(key, list);
      this.retainedIndex.setValue(evtTopic, key);
      this.retainedKeyToTopic.set(key, evtTopic);
    }
    await Promise.allSettled(subs.map((s) => s.subscriber(message)));
  }

  on(service: ServiceName, eventOrPattern: string, subscriber: EventSubscriber, options?: EventRegistrationOptions): string {
    const topic = TopicPath.newService(this.networkId, service).newEventTopic(eventOrPattern);
    const serviceTopic = TopicPath.newService(this.networkId, service);
    const metadata: SubscriptionMetadata = { path: topic.asString?.() ?? `${this.networkId}:${service}/${eventOrPattern}` };
    const id = this.registry.subscribe(topic, serviceTopic, subscriber, metadata, 'Local');
    if (options?.includePast && options.includePast > 0) {
      const matched = this.retainedIndex.findWildcardMatches(topic).map((m) => m.content);
      const history: Array<{ ts: number; data: Uint8Array | null }> = [];
      for (const key of matched) {
        const list = this.retainedEvents.get(key) ?? [];
        history.push(...list);
      }
      history.sort((a, b) => a.ts - b.ts);
      const deliver = history.slice(-options.includePast);
      void Promise.allSettled(
        deliver.map((e) => subscriber({ service, event: eventOrPattern, payload: e.data ?? new Uint8Array(), timestampMs: e.ts })),
      );
    }
    return id;
  }

  unsubscribe(subscriptionId: string): boolean {
    return this.registry.unsubscribe(subscriptionId);
  }

  onOnce(service: ServiceName, eventOrPattern: string, timeoutMs = 5000): Promise<EventMessage | undefined> {
    const topic = TopicPath.newService(this.networkId, service).newEventTopic(eventOrPattern);
    return new Promise((resolve) => {
      let resolved = false;
      const serviceTopic = TopicPath.newService(this.networkId, service);
      const metadata: SubscriptionMetadata = { path: topic.asString?.() ?? `${this.networkId}:${service}/${eventOrPattern}` };
      const id = this.registry.subscribe(topic, serviceTopic, async (evt) => {
        if (resolved) return;
        resolved = true;
        this.registry.unsubscribe(id);
        resolve(evt);
      }, metadata, 'Local');
      setTimeout(() => {
        if (resolved) return;
        resolved = true;
        this.registry.unsubscribe(id);
        resolve(undefined);
      }, timeoutMs);
    });
  }

  clearRetainedEventsMatching(pattern: string): number {
    const fullPattern = pattern.includes(':') ? pattern : `${this.networkId}:${pattern}`;
    const topicPattern = TopicPath.new(fullPattern, this.networkId);
    const matchedKeys = this.retainedIndex.findWildcardMatches(topicPattern).map((m) => m.content);
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
}


