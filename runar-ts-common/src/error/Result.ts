/**
 * Result type implementation for error handling
 *
 * This is a clean implementation that avoids prototype pollution and follows
 * functional programming patterns similar to Rust's Result<T, E>.
 *
 * Usage:
 * ```typescript
 * import { Result, ok, err } from './Result';
 *
 * function divide(a: number, b: number): Result<number, string> {
 *   if (b === 0) {
 *     return err("Division by zero");
 *   }
 *   return ok(a / b);
 * }
 *
 * const result = divide(10, 2);
 * if (result.ok) {
 *   console.log("Result:", result.value); // 5
 * } else {
 *   console.log("Error:", result.error); // Won't happen in this case
 * }
 * ```
 */

export type Ok<V> = { ok: true; value: V };
export type Err<E = Error> = { ok: false; error: E };
export type Result<V, E = Error> = Ok<V> | Err<E>;

/**
 * Create a successful Result with a value
 */
export function ok<V>(value: V): Ok<V> {
  return { ok: true, value };
}

/**
 * Create an error Result with an error value
 * Supports both string messages and Error objects with optional error chaining
 */
export function err<E = Error>(message: string | Error, previousError?: Error): Err<E> {
  let error: Error;

  if (typeof message === 'string') {
    // Create new Error with message and preserve previous error
    error = new Error(message);
    if (previousError) {
      // Use ES2022 Error.cause if available
      if ('cause' in Error.prototype) {
        (error as any).cause = previousError;
      }
      // Manual stack trace preservation for better debugging
      if (previousError.stack) {
        error.stack = `${error.stack}\nCaused by: ${previousError.stack}`;
      }
    }
  } else {
    // message is already an Error object
    error = message;
    if (previousError) {
      // Use ES2022 Error.cause if available
      if ('cause' in Error.prototype) {
        (error as any).cause = previousError;
      }
      // Manual stack trace preservation for better debugging
      if (previousError.stack) {
        error.stack = `${error.stack}\nCaused by: ${previousError.stack}`;
      }
    }
  }

  return { ok: false, error: error as E };
}

/**
 * Type guard to check if a Result is Ok
 */
export function isOk<V, E>(result: Result<V, E>): result is Ok<V> {
  return result.ok;
}

/**
 * Type guard to check if a Result is Err
 */
export function isErr<V, E>(result: Result<V, E>): result is Err<E> {
  return !result.ok;
}

/**
 * Unwrap a Result, throwing an error if it's Err
 * This should be used sparingly - prefer pattern matching with if/else
 */
export function unwrap<V, E>(result: Result<V, E>): V {
  if (result.ok) {
    return result.value;
  }
  throw new Error(`Called unwrap on Err: ${(result as Err<E>).error}`);
}

/**
 * Unwrap an error from a Result, throwing if it's Ok
 * This should be used sparingly - prefer pattern matching with if/else
 */
export function unwrapErr<V, E>(result: Result<V, E>): E {
  if (!result.ok) {
    return (result as Err<E>).error;
  }
  throw new Error(`Called unwrapErr on Ok: ${(result as Ok<V>).value}`);
}

/**
 * Map a function over the value of a successful Result
 */
export function map<V, E, U>(result: Result<V, E>, fn: (value: V) => U): Result<U, E> {
  if (result.ok) {
    return ok(fn((result as Ok<V>).value));
  }
  return result as Result<U, E>;
}

/**
 * Map a function over the error of a failed Result
 */
export function mapErr<V, E, F extends string | Error>(
  result: Result<V, E>,
  fn: (error: E) => F
): Result<V, F> {
  if (!result.ok) {
    const mappedError = fn((result as Err<E>).error);
    return err(mappedError);
  }
  return result as Result<V, F>;
}

/**
 * Chain operations on Results - flatMap/binding operation
 */
export function andThen<V, E, U>(
  result: Result<V, E>,
  fn: (value: V) => Result<U, E>
): Result<U, E> {
  if (result.ok) {
    return fn((result as Ok<V>).value);
  }
  return result as Result<U, E>;
}

/**
 * Convert a Promise<Result<V, E>> to Result<Promise<V>, E>
 */
export function transpose<V, E extends string | Error>(
  result: Result<Promise<V>, E>
): Promise<Result<V, E>> {
  if (result.ok) {
    return (result as Ok<Promise<V>>).value
      .then(ok)
      .catch(e => err(e instanceof Error ? e : new Error(String(e)))) as Promise<Result<V, E>>;
  }
  return Promise.resolve(result as Result<V, E>);
}

/**
 * Convert a Promise<V> to Promise<Result<V, E>> with error mapping
 */
export function fromPromise<V, E extends string | Error = Error>(
  promise: Promise<V>,
  errorMapper?: (error: unknown) => E
): Promise<Result<V, E>> {
  return promise
    .then(ok)
    .catch(
      e =>
        err(errorMapper ? errorMapper(e) : e instanceof Error ? e : new Error(String(e))) as Result<
          V,
          E
        >
    );
}

/**
 * Convert a Promise<Result<V, E>> to Promise<V> by throwing on error
 */
export function toPromise<V, E>(result: Promise<Result<V, E>>): Promise<V> {
  return result.then(r => {
    if (r.ok) {
      return (r as Ok<V>).value;
    }
    throw new Error(String((r as Err<E>).error));
  });
}

/**
 * Get the value from a Result or a default value
 */
export function unwrapOr<V, E>(result: Result<V, E>, defaultValue: V): V {
  return result.ok ? (result as Ok<V>).value : defaultValue;
}

/**
 * Get the value from a Result or compute a default
 */
export function unwrapOrElse<V, E>(result: Result<V, E>, defaultFn: (error: E) => V): V {
  return result.ok ? (result as Ok<V>).value : defaultFn((result as Err<E>).error);
}

/**
 * Get the error from a Result or a default error
 */
export function unwrapErrOr<V, E>(result: Result<V, E>, defaultError: E): E {
  return result.ok ? defaultError : (result as Err<E>).error;
}

/**
 * Expect a Result to be Ok, panic with a custom message if it's Err
 */
export function expect<V, E>(result: Result<V, E>, message: string): V {
  if (result.ok) {
    return (result as Ok<V>).value;
  }
  throw new Error(`${message}: ${(result as Err<E>).error}`);
}

/**
 * Assert that a Result is Ok and return the value, or panic
 */
export function assertOk<V, E>(result: Result<V, E>): V {
  if (result.ok) {
    return (result as Ok<V>).value;
  }
  throw new Error(`Assertion failed: expected Ok, got Err(${(result as Err<E>).error})`);
}

/**
 * Assert that a Result is Err and return the error, or panic
 */
export function assertErr<V, E>(result: Result<V, E>): E {
  if (!result.ok) {
    return (result as Err<E>).error;
  }
  throw new Error(`Assertion failed: expected Err, got Ok(${(result as Ok<V>).value})`);
}
