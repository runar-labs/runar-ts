/**
 * Runar Common Library
 *
 * Core utilities for the Runar P2P stack including logging, routing, and error handling.
 */

// Export types for network functionality (will be used with nodejs-api)
export type CborBytes = Uint8Array;

export interface PeerInfo {
  peerId: string;
  displayName?: string;
}

export interface NodeInfo {
  nodeId: string;
  displayName?: string;
}

// Export the clean error handling types and utilities
export * from './error';

// Export logging functionality
export * from './logging/logger';
export * from './logging/config';

// Export routing functionality
export * from './routing/TopicPath';
export * from './routing/PathTrie';

// Export service-related types (temporary - will be moved to runar-ts-node)
export * from './service';
