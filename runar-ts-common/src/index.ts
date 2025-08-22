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
    this.name = 'RunarError';
  }
}

// Result type for error handling (Rust-style)
export interface Result<T, E> {
  readonly ok: boolean;
  readonly value?: T;
  readonly error?: E;
}

export function ok<T, E>(value: T): Result<T, E> {
  return { ok: true, value };
}

export function err<T, E>(error: E): Result<T, E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is Result<T, E> & { value: T } {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is Result<T, E> & { error: E } {
  return !result.ok;
}

export function unwrap<T, E>(result: Result<T, E>): T {
  if (!result.ok) {
    throw new Error(`Attempted to unwrap an Err value: ${result.error}`);
  }
  return result.value!;
}

export function unwrapErr<T, E>(result: Result<T, E>): E {
  if (result.ok) {
    throw new Error('Attempted to unwrap_err an Ok value');
  }
  return result.error!;
}

// Export logging functionality
export { Logger, Component } from './logging/logger.js';

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

// Abstract service interface (matching Rust AbstractService trait)
export interface AbstractService {
  name(): string;
  version(): string;
  path(): string;
  description(): string;
  networkId(): string | undefined;
  setNetworkId(networkId: string): void;
  init(context: any): Promise<void>; // LifecycleContext type to be imported
  start(context: any): Promise<void>;
  stop(context: any): Promise<void>;
}

export * from './routing/TopicPath.js';
export * from './routing/PathTrie.js';
export * from './logging/logger.js';
export * from './logging/config.js';
