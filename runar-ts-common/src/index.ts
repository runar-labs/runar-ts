export type CborBytes = Uint8Array;
import type { AnyValue } from 'runar-ts-serializer';

export interface PeerInfo {
  peerId: string;
  displayName?: string;
}

export interface NodeInfo {
  nodeId: string;
  displayName?: string;
}

export class RunarError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RunarError';
  }
}

export * from './routing/TopicPath.js';
export * from './routing/PathTrie.js';
export * from './logging/logger.js';
export * from './logging/config.js';

// Service lifecycle and interface mirroring Rust AbstractService
export enum ServiceState {
  Created = 'Created',
  Initialized = 'Initialized',
  Running = 'Running',
  Stopped = 'Stopped',
  Paused = 'Paused',
  Error = 'Error',
  Unknown = 'Unknown',
}

export interface LifecycleContext {
  networkId: string;
  addActionHandler: (actionName: string, handler: ActionHandler) => void;
  // In-memory publish, no serialization
  publish: (eventName: string, payload: AnyValue) => Promise<void>;
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

export type ActionHandler = (request: ActionRequest) => Promise<ActionResponse> | ActionResponse;
export type EventSubscriber = (evt: EventMessage) => void | Promise<void>;

export interface ServiceRegistration {
  service: ServiceName;
  handler: ActionHandler;
}
