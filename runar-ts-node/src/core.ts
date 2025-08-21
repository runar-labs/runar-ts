import { AnyValue } from 'runar-ts-serializer';
import { ServiceState } from 'runar-ts-schemas';
import { Result, err } from 'runar-ts-common';

// Re-export ServiceState for convenience
export { ServiceState };

// Service lifecycle and interface mirroring Rust AbstractService
export interface LifecycleContext {
  networkId: string;
  servicePath: string;
  config?: AnyValue;
  logger: any; // Logger type to be imported

  // Action handling
  registerAction(actionName: string, handler: ActionHandler): Promise<Result<void, string>>;

  // Request/Response
  request<P = unknown>(topic: string, payload?: P): Promise<Result<AnyValue, string>>;

  // Event publishing
  publish(topic: string, data?: AnyValue): Promise<Result<void, string>>;
  publishWithOptions(topic: string, data: AnyValue | undefined, options: any): Promise<Result<void, string>>;

  // Event subscription
  on(topic: string, options?: { timeout?: number; includePast?: boolean }): Promise<Result<AnyValue | undefined, string>>;
  subscribe(topic: string, callback: EventSubscriber, options?: { includePast?: boolean }): Promise<Result<string, string>>;
  unsubscribe(subscriptionId: string): Promise<Result<void, string>>;
}

// Concrete implementation of LifecycleContext
export class LifecycleContextImpl implements LifecycleContext {
  networkId: string;
  servicePath: string;
  config?: AnyValue;
  logger: any;

  constructor(
    networkId: string,
    servicePath: string,
    logger: any,
    config?: AnyValue
  ) {
    this.networkId = networkId;
    this.servicePath = servicePath;
    this.logger = logger;
    this.config = config;
  }

  async registerAction(actionName: string, handler: ActionHandler): Promise<Result<void, string>> {
    try {
      // This will be implemented by the Node
      throw new Error('Not implemented - should be overridden by Node');
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  }

  async request<P = unknown>(topic: string, payload?: P): Promise<Result<AnyValue, string>> {
    try {
      // This will be implemented by the Node
      throw new Error('Not implemented - should be overridden by Node');
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  }

  async publish(topic: string, data?: AnyValue): Promise<Result<void, string>> {
    try {
      // This will be implemented by the Node
      throw new Error('Not implemented - should be overridden by Node');
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  }

  async publishWithOptions(topic: string, data: AnyValue | undefined, options: any): Promise<Result<void, string>> {
    try {
      // This will be implemented by the Node
      throw new Error('Not implemented - should be overridden by Node');
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  }

  async on(topic: string, options?: { timeout?: number; includePast?: boolean }): Promise<Result<AnyValue | undefined, string>> {
    try {
      // This will be implemented by the Node
      throw new Error('Not implemented - should be overridden by Node');
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  }

  async subscribe(topic: string, callback: EventSubscriber, options?: { includePast?: boolean }): Promise<Result<string, string>> {
    try {
      // This will be implemented by the Node
      throw new Error('Not implemented - should be overridden by Node');
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  }

  async unsubscribe(subscriptionId: string): Promise<Result<void, string>> {
    try {
      // This will be implemented by the Node
      throw new Error('Not implemented - should be overridden by Node');
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  }
}

// Node-specific implementation of LifecycleContext that delegates to Node
export class NodeLifecycleContext extends LifecycleContextImpl {
  private node: any; // Node instance

  constructor(networkId: string, servicePath: string, logger: any, node: any, config?: AnyValue) {
    super(networkId, servicePath, logger, config);
    this.node = node;
  }

  async registerAction(actionName: string, handler: ActionHandler): Promise<Result<void, string>> {
    try {
      const { TopicPath, isOk, unwrap, unwrapErr, err } = await import('runar-ts-common');
      const topicResult = TopicPath.newService(this.networkId, this.servicePath).newActionTopic(actionName);
      if (!isOk(topicResult)) {
        return err(unwrapErr(topicResult));
      }
      this.node.registry.addLocalActionHandler(unwrap(topicResult), handler);
      return { ok: true, value: undefined };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async request<P = unknown>(topic: string, payload?: P): Promise<Result<AnyValue, string>> {
    return this.node.request(topic, payload);
  }

  async publish(topic: string, data?: AnyValue): Promise<Result<void, string>> {
    return this.node.publish(topic, data);
  }

  async publishWithOptions(topic: string, data: AnyValue | undefined, options: any): Promise<Result<void, string>> {
    return this.node.publish_with_options(topic, data, options);
  }

  async on(topic: string, options?: { timeout?: number; includePast?: boolean }): Promise<Result<AnyValue | undefined, string>> {
    return this.node.on(topic, options);
  }

  async subscribe(topic: string, callback: EventSubscriber, options?: { includePast?: boolean }): Promise<Result<string, string>> {
    return this.node.subscribe(topic, callback, options);
  }

  async unsubscribe(subscriptionId: string): Promise<Result<void, string>> {
    return this.node.unsubscribe(subscriptionId);
  }
}

export interface AbstractService {
  name(): string;
  version(): string;
  path(): string; // service path (first segment)
  description(): string;
  networkId(): string | undefined;
  setNetworkId(networkId: string): void;
  init(context: LifecycleContext): Promise<void>;
  start(context: LifecycleContext): Promise<void>;
  stop(context: LifecycleContext): Promise<void>;
}

// Messaging primitives for local runtime
export type ServiceName = string;
export type ActionName = string;
export type EventName = string;

export interface ActionRequest {
  service: ServiceName;
  action: ActionName;
  // In-memory payload, no serialization
  payload: AnyValue;
  requestId: string;
}

export interface ActionResponseOk {
  ok: true;
  requestId: string;
  // In-memory payload, no serialization
  payload: AnyValue;
}

export interface ActionResponseErr {
  ok: false;
  requestId: string;
  error: string;
}

export type ActionResponse = ActionResponseOk | ActionResponseErr;

export interface EventMessage {
  service: ServiceName;
  event: EventName;
  // In-memory payload, no serialization
  payload: AnyValue;
  timestampMs: number;
}

export interface RequestContext {
  networkId: string;
  servicePath: string;
  requestId: string; // Internal - handlers don't use this
}

export type ActionHandler = (payload: AnyValue, context: RequestContext) => Promise<Result<AnyValue, string>>;
export type EventSubscriber = (evt: EventMessage) => void | Promise<void>;

export interface ServiceRegistration {
  service: ServiceName;
  handler: ActionHandler;
}
