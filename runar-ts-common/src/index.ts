export type CborBytes = Uint8Array;

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
    this.name = "RunarError";
  }
}

export * from './routing/TopicPath';
export * from './routing/PathTrie';

// Messaging primitives for local runtime
export type ServiceName = string;
export type ActionName = string;
export type EventName = string;

export interface ActionRequest {
  service: ServiceName;
  action: ActionName;
  payload: CborBytes;
  requestId: string;
}

export interface ActionResponseOk {
  ok: true;
  requestId: string;
  payload: CborBytes;
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
  payload: CborBytes;
  timestampMs: number;
}

export type ActionHandler = (request: ActionRequest) => Promise<ActionResponse> | ActionResponse;
export type EventSubscriber = (evt: EventMessage) => void | Promise<void>;

export interface ServiceRegistration {
  service: ServiceName;
  handler: ActionHandler;
}


