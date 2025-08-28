import { AnyValue } from 'runar-ts-serializer';

// Event message interface (used by the event system)
export interface EventMessage {
  service: string;
  event: string;
  payload?: AnyValue;
  timestampMs?: number;
}

// Event handler types
export type EventHandler = (
  payload: AnyValue,
  context: EventContext
) => Promise<Result<void, string>>;

export type RemoteEventHandler = (
  payload: AnyValue,
  context: EventContext
) => Promise<Result<void, string>>;

// EventSubscriber type (matching Rust EventSubscriber)
export type EventSubscriber = (
  context: EventContext,
  payload?: AnyValue
) => Promise<Result<void, string>>;

// Event context implementation
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

// Event registration options
export interface EventRegistrationOptions {
  includePast?: boolean;
}

// Publish options
export interface PublishOptions {
  broadcast?: boolean;
  guaranteed_delivery?: boolean;
  retain_for?: Duration;
  target?: string;
  retain?: boolean;
}

// Import types that are needed
import { Result } from 'runar-ts-common';
import { TopicPath, Logger } from 'runar-ts-common';
import { NodeDelegate } from './service';

// Re-export Duration for convenience
export type Duration = {
  as_millis(): number;
};
