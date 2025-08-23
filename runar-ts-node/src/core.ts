import { AnyValue } from 'runar-ts-serializer';
import { Result, err, ok, Logger, TopicPath } from 'runar-ts-common';

// Service lifecycle states (matching Rust ServiceState)
export enum ServiceState {
  Created = 'Created',
  Initialized = 'Initialized',
  Running = 'Running',
  Stopped = 'Stopped',
  Paused = 'Paused',
  Error = 'Error',
  Unknown = 'Unknown',
}

// AbstractService interface (matching Rust AbstractService trait)
export interface AbstractService {
  name(): string;
  version(): string;
  path(): string;
  description(): string;
  networkId(): string | undefined;
  setNetworkId(networkId: string): void;
  init(context: NodeLifecycleContext): Promise<Result<void, string>>;
  start(context: NodeLifecycleContext): Promise<Result<void, string>>;
  stop(context: NodeLifecycleContext): Promise<Result<void, string>>;
}

// Service lifecycle context (matching Rust LifecycleContext trait)
export interface NodeLifecycleContext {
  networkId: string;
  servicePath: string;
  logger: Logger;

  // Action handling (matching Rust register_action)
  registerAction(actionName: string, handler: ActionHandler): Promise<Result<void, string>>;

  // Event publishing (matching Rust publish)
  publish(topic: string, data?: AnyValue): Promise<Result<void, string>>;
}

// Event message interface (used by the event system)
export interface EventMessage {
  service: string;
  event: string;
  payload?: AnyValue;
  timestampMs?: number;
}

// Implementation of NodeLifecycleContext
export class NodeLifecycleContextImpl implements NodeLifecycleContext {
  private actionHandlers: Map<string, ActionHandler> = new Map();

  constructor(
    public readonly networkId: string,
    public readonly servicePath: string,
    public readonly logger: any,
    private readonly node: any
  ) {}

  async registerAction(actionName: string, handler: ActionHandler): Promise<Result<void, string>> {
    try {
      // Store the action handler locally
      this.actionHandlers.set(actionName, handler);

      // Create the full action topic path
      const fullActionPath = `${this.servicePath}/${actionName}`;
      const actionTopicResult = TopicPath.new(fullActionPath, this.networkId);
      if (!actionTopicResult.ok) {
        return err(`Invalid action topic path: ${actionTopicResult.error}`);
      }

      // Register with the node's registry
      this.node.registry.addLocalActionHandler(actionTopicResult.value, handler);

      return ok(undefined);
    } catch (error) {
      return err(`Failed to register action ${actionName}: ${error}`);
    }
  }

  async publish(topic: string, data?: AnyValue): Promise<Result<void, string>> {
    return this.node.publish(topic, data);
  }

  // Method to get registered action handlers (for the registry to access)
  getActionHandlers(): Map<string, ActionHandler> {
    return this.actionHandlers;
  }
}

// Request context (matching Rust RequestContext)
export interface RequestContext {
  topicPath: TopicPath;
  node: NodeDelegate;
  networkId?: string;
  logger: Logger;
  pathParams: Map<string, string>;

  // Request/Response
  request<P = unknown>(topic: string, payload?: P): Promise<Result<AnyValue, string>>;

  // Event publishing
  publish(topic: string, data?: AnyValue): Promise<Result<void, string>>;

  // Logging
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

// Event context (matching Rust EventContext)
export interface EventContext {
  topicPath: TopicPath;
  node: NodeDelegate;
  logger: Logger;

  // Event publishing
  publish(topic: string, data?: AnyValue): Promise<Result<void, string>>;

  // Logging
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

// Node delegate interface
export interface NodeDelegate {
  request<P = unknown>(path: string, payload?: P): Promise<Result<AnyValue, string>>;
  publish(topic: string, data?: AnyValue): Promise<Result<void, string>>;
}

// Action handler type (matching Rust ActionHandler)
export type ActionHandler = (
  params: Option<AnyValue>,
  context: RequestContext
) => Promise<Result<AnyValue, string>>;

// Event subscriber type (matching Rust EventSubscriber)
export type EventSubscriber = (
  context: EventContext,
  data?: AnyValue
) => Promise<Result<void, string>>;

// Utility types
export type Option<T> = T | undefined;

// Concrete implementation of NodeLifecycleContext
export class LifecycleContextImpl implements NodeLifecycleContext {
  networkId: string;
  servicePath: string;
  logger: Logger;

  private node: NodeDelegate;

  constructor(networkId: string, servicePath: string, logger: Logger, node: NodeDelegate) {
    this.networkId = networkId;
    this.servicePath = servicePath;
    this.logger = logger;
    this.node = node;
  }

  async registerAction(actionName: string, handler: ActionHandler): Promise<Result<void, string>> {
    // This will be implemented by the Node via dependency injection
    // For now, just return success
    return ok(undefined);
  }

  async publish(topic: string, data?: AnyValue): Promise<Result<void, string>> {
    return this.node.publish(topic, data);
  }
}

// Concrete implementation of RequestContext
export class RequestContextImpl implements RequestContext {
  topicPath: TopicPath;
  node: NodeDelegate;
  logger: Logger;
  pathParams: Map<string, string>;

  constructor(
    topicPath: TopicPath,
    node: NodeDelegate,
    logger: Logger,
    pathParams?: Map<string, string>
  ) {
    this.topicPath = topicPath;
    this.node = node;
    this.logger = logger;
    this.pathParams = pathParams || new Map();
  }

  async request<P = unknown>(topic: string, payload?: P): Promise<Result<AnyValue, string>> {
    return this.node.request(topic, payload);
  }

  async publish(topic: string, data?: AnyValue): Promise<Result<void, string>> {
    return this.node.publish(topic, data);
  }

  debug(message: string): void {
    this.logger.debug(message);
  }

  info(message: string): void {
    this.logger.info(message);
  }

  warn(message: string): void {
    this.logger.warn(message);
  }

  error(message: string): void {
    this.logger.error(message);
  }
}

// Concrete implementation of EventContext
export class EventContextImpl implements EventContext {
  topicPath: TopicPath;
  node: NodeDelegate;
  logger: Logger;

  constructor(topicPath: TopicPath, node: NodeDelegate, logger: Logger) {
    this.topicPath = topicPath;
    this.node = node;
    this.logger = logger;
  }

  async publish(topic: string, data?: AnyValue): Promise<Result<void, string>> {
    return this.node.publish(topic, data);
  }

  debug(message: string): void {
    this.logger.debug(message);
  }

  info(message: string): void {
    this.logger.info(message);
  }

  warn(message: string): void {
    this.logger.warn(message);
  }

  error(message: string): void {
    this.logger.error(message);
  }
}

// Additional imports and exports for backward compatibility
export { ServiceState as ServiceStateEnum } from 'runar-ts-common/src/service';
