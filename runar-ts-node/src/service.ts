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

// Action handler type (matching Rust ActionHandler)
export type ActionHandler = (
  payload: AnyValue,
  context: RequestContext
) => Promise<Result<AnyValue, string>>;

// Request context (matching Rust RequestContext)
export interface RequestContext {
  topicPath: TopicPath;
  node: NodeDelegate;
  networkId?: string;
  logger: Logger;
  pathParams: Map<string, string>;

  // Request/Response
  request<P = unknown>(topic: string, payload?: P): Promise<Result<AnyValue, string>>;
  publish(topic: string, data?: AnyValue): Promise<Result<void, string>>;
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

// Node delegate interface for context implementations
export interface NodeDelegate {
  request<P = unknown>(path: string, payload?: P): Promise<Result<AnyValue, string>>;
  publish(topic: string, data?: AnyValue): Promise<Result<void, string>>;
}

// Event context (matching Rust EventContext)
export interface EventContext {
  topicPath: TopicPath;
  node: NodeDelegate;
  networkId?: string;
  logger: Logger;

  // Event publishing
  publish(topic: string, data?: AnyValue): Promise<Result<void, string>>;
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

// Service entry for registry
export interface ServiceEntry {
  service: AbstractService;
  serviceTopic: TopicPath;
  serviceState: ServiceState;
  registrationTime: number;
  lastStartTime?: number;
}
