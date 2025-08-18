import { v4 as uuidv4 } from 'uuid';
import { fromCbor, toCbor } from 'runar-ts-serializer';
import {
  ActionHandler,
  ActionRequest,
  ActionResponse,
  EventMessage,
  EventSubscriber,
  ServiceName,
  ServiceRegistration,
  PathTrie,
  TopicPath,
} from 'runar-ts-common';

type Subscription = { service: ServiceName; event: string | "*"; subscriber: EventSubscriber };

export class ServiceRegistry {
  private actionHandlers = new PathTrie<ActionHandler>();
  private eventSubscriptions = new PathTrie<Array<{ id: string; subscriber: EventSubscriber }>>();

  addLocalActionHandler(topic: TopicPath, handler: ActionHandler): void {
    this.actionHandlers.setValue(topic, handler);
  }

  findLocalActionHandlers(topic: TopicPath): ActionHandler[] {
    return this.actionHandlers.findMatches(topic).map((m) => m.content);
  }

  subscribe(topic: TopicPath, subscriber: EventSubscriber): string {
    const id = uuidv4();
    const existing = this.eventSubscriptions.findMatches(topic);
    // Use setValue to replace at leaf with list including our subscriber
    this.eventSubscriptions.setValue(topic, [{ id, subscriber }]);
    return id;
  }

  getSubscribers(topic: TopicPath): Array<{ id: string; subscriber: EventSubscriber }> {
    return this.eventSubscriptions.findMatches(topic).flatMap((m) => m.content);
  }
}

export class Node {
  private readonly networkId: string;
  private readonly registry = new ServiceRegistry();
  private running = false;

  constructor(networkId = 'default') {
    this.networkId = networkId;
  }

  addService(servicePath: string, handler: ActionHandler): void {
    const topic = TopicPath.newService(this.networkId, servicePath).newActionTopic("*");
    this.registry.addLocalActionHandler(topic, handler);
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
  }

  async stop(): Promise<void> {
    if (!this.running) return;
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

  async publish<T = unknown>(service: ServiceName, event: string, payload: T): Promise<void> {
    if (!this.running) throw new Error('Node not started');
    const evtTopic = TopicPath.newService(this.networkId, service).newEventTopic(event);
    const subs = this.registry.getSubscribers(evtTopic);
    const message: EventMessage = { service, event, payload: toCbor(payload), timestampMs: Date.now() };
    await Promise.all(subs.map((s) => s.subscriber(message)));
  }

  on(service: ServiceName, eventOrPattern: string, subscriber: EventSubscriber): string {
    const topic = TopicPath.newService(this.networkId, service).newEventTopic(eventOrPattern);
    return this.registry.subscribe(topic, subscriber);
  }
}


