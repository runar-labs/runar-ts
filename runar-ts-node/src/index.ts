import { v4 as uuidv4 } from 'uuid';
import { fromCbor, toCbor } from 'runar-ts-serializer';
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

type SubscriptionEntry = { id: string; subscriber: EventSubscriber };

export class ServiceRegistry {
  private actionHandlers = new PathTrie<ActionHandler>();
  private eventSubscriptions = new PathTrie<SubscriptionEntry[]>();
  private subscriptionIdToTopic = new Map<string, TopicPath>();
  private localServices = new Map<string, ServiceEntry>();

  addLocalActionHandler(topic: TopicPath, handler: ActionHandler): void {
    this.actionHandlers.setValue(topic, handler);
  }

  findLocalActionHandlers(topic: TopicPath): ActionHandler[] {
    return this.actionHandlers.findMatches(topic).map((m) => m.content);
  }

  subscribe(topic: TopicPath, subscriber: EventSubscriber): string {
    const id = uuidv4();
    const existingMatches = this.eventSubscriptions.findMatches(topic);
    const existing = existingMatches.length > 0 ? existingMatches[0]!.content : [];
    this.eventSubscriptions.setValue(topic, [...existing, { id, subscriber }]);
    this.subscriptionIdToTopic.set(id, topic);
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
    return true;
  }

  getSubscribers(topic: TopicPath): SubscriptionEntry[] {
    return this.eventSubscriptions.findMatches(topic).flatMap((m) => m.content);
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

  constructor(networkId = 'default') {
    this.networkId = networkId;
  }

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
    for (const entry of this.registry.getLocalServices()) {
      const svc = entry.service;
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
    const req: ActionRequest = { service, action, payload: toCbor(payload), requestId: uuidv4() };
    const res = await handlers[0]!(req);
    if (res.ok) return fromCbor<TRes>(res.payload);
    throw new Error(res.error);
  }

  async publish<T = unknown>(service: ServiceName, event: string, payload: T, options?: PublishOptions): Promise<void> {
    if (!this.running) throw new Error('Node not started');
    const evtTopic = TopicPath.newService(this.networkId, service).newEventTopic(event);
    const subs = this.registry.getSubscribers(evtTopic);
    const bytes = payload instanceof Uint8Array ? payload : toCbor(payload);
    const message: EventMessage = { service, event, payload: bytes, timestampMs: Date.now() };
    if (options?.retain) {
      const key = `${this.networkId}:${service}/${event}`;
      const list = this.retainedEvents.get(key) ?? [];
      list.push({ ts: message.timestampMs, data: message.payload });
      this.retainedEvents.set(key, list);
      this.retainedIndex.setValue(evtTopic, key);
    }
    await Promise.all(subs.map((s) => s.subscriber(message)));
  }

  on(service: ServiceName, eventOrPattern: string, subscriber: EventSubscriber, options?: EventRegistrationOptions): string {
    const topic = TopicPath.newService(this.networkId, service).newEventTopic(eventOrPattern);
    const id = this.registry.subscribe(topic, subscriber);
    if (options?.includePast && options.includePast > 0) {
      const matched = this.retainedIndex.findWildcardMatches(topic).map((m) => m.content);
      const history: Array<{ ts: number; data: Uint8Array | null }> = [];
      for (const key of matched) {
        const list = this.retainedEvents.get(key) ?? [];
        history.push(...list);
      }
      history.sort((a, b) => a.ts - b.ts);
      const deliver = history.slice(-options.includePast);
      void Promise.all(
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
      const id = this.registry.subscribe(topic, async (evt) => {
        if (resolved) return;
        resolved = true;
        this.registry.unsubscribe(id);
        resolve(evt);
      });
      setTimeout(() => {
        if (resolved) return;
        resolved = true;
        this.registry.unsubscribe(id);
        resolve(undefined);
      }, timeoutMs);
    });
  }
}


