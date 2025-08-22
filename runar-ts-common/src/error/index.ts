/**
 * Error handling utilities
 *
 * This module provides clean error handling patterns similar to Rust's Result<T, E>
 * without prototype pollution or unsafe patterns.
 */

// Export the Result type and all its utilities
export * from './Result';

// Re-export the Result type with a clear name for easy importing
export type { Result, Ok, Err } from './Result';
