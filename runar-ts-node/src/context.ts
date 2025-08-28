import { AnyValue } from 'runar-ts-serializer';
import { Result, err, ok, Logger, TopicPath } from 'runar-ts-common';
import {
  ActionHandler,
  NodeLifecycleContext,
  RequestContext,
  EventContext,
  NodeDelegate,
} from './service';

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

// Implementation of EventContext
export class EventContextImpl implements EventContext {
  constructor(
    public readonly topicPath: TopicPath,
    public readonly node: NodeDelegate,
    public readonly logger: Logger
  ) {}

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
