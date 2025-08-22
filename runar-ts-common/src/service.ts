/**
 * Service-related types and interfaces
 *
 * Note: AbstractService and ServiceState are defined here for compatibility
 * but should be moved to runar-ts-node package to match Rust architecture.
 * These are provided here for backward compatibility during transition.
 */

import { Result } from './error';

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

// Forward declaration of context types (will be properly defined in runar-ts-node)
export interface LifecycleContext {
  // This will be properly implemented in runar-ts-node
  info(message: string): void;
  debug(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  registerAction(actionName: string, handler: any): Promise<Result<void, string>>;
  subscribe(topic: string, handler: any, options?: any): Promise<Result<void, string>>;
  publish(topic: string, data?: any): Promise<Result<void, string>>;
}

// Abstract service interface (matching Rust AbstractService trait)
// This is a temporary definition - the full implementation should be in runar-ts-node
export interface AbstractService {
  name(): string;
  version(): string;
  path(): string;
  description(): string;
  networkId(): string | undefined;
  setNetworkId(networkId: string): void;
  init(context: LifecycleContext): Promise<Result<void, string>>;
  start(context: LifecycleContext): Promise<Result<void, string>>;
  stop(context: LifecycleContext): Promise<Result<void, string>>;
}

// Re-export for backward compatibility
export * from './error';
