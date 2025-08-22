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
export type Err<E = string> = { ok: false; error: E };
export type Result<V, E = string> = Ok<V> | Err<E>;

/**
 * Create a successful Result with a value
 */
export function ok<V>(value: V): Ok<V> {
  return { ok: true, value };
}

/**
 * Create an error Result with an error value
 */
export function err<E = string>(error: E): Err<E> {
  return { ok: false, error };
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
  throw new Error(`Called unwrap on Err: ${result.error}`);
}

/**
 * Unwrap an error from a Result, throwing if it's Ok
 * This should be used sparingly - prefer pattern matching with if/else
 */
export function unwrapErr<V, E>(result: Result<V, E>): E {
  if (!result.ok) {
    return result.error;
  }
  throw new Error(`Called unwrapErr on Ok: ${result.value}`);
}

/**
 * Map a function over the value of a successful Result
 */
export function map<V, E, U>(result: Result<V, E>, fn: (value: V) => U): Result<U, E> {
  if (result.ok) {
    return ok(fn(result.value));
  }
  return result;
}

/**
 * Map a function over the error of a failed Result
 */
export function mapErr<V, E, F>(result: Result<V, E>, fn: (error: E) => F): Result<V, F> {
  if (!result.ok) {
    return err(fn(result.error));
  }
  return result;
}

/**
 * Chain operations on Results - flatMap/binding operation
 */
export function andThen<V, E, U>(
  result: Result<V, E>,
  fn: (value: V) => Result<U, E>
): Result<U, E> {
  if (result.ok) {
    return fn(result.value);
  }
  return result;
}

/**
 * Convert a Promise<Result<V, E>> to Result<Promise<V>, E>
 */
export function transpose<V, E>(result: Result<Promise<V>, E>): Promise<Result<V, E>> {
  if (result.ok) {
    return result.value.then(ok).catch(e => err(e as E));
  }
  return Promise.resolve(result);
}

/**
 * Convert a Promise<V> to Promise<Result<V, E>> with error mapping
 */
export function fromPromise<V, E = string>(
  promise: Promise<V>,
  errorMapper?: (error: unknown) => E
): Promise<Result<V, E>> {
  return promise
    .then(ok)
    .catch(e =>
      err(errorMapper ? errorMapper(e) : ((e instanceof Error ? e.message : String(e)) as E))
    );
}

/**
 * Convert a Promise<Result<V, E>> to Promise<V> by throwing on error
 */
export function toPromise<V, E>(result: Promise<Result<V, E>>): Promise<V> {
  return result.then(r => {
    if (r.ok) {
      return r.value;
    }
    throw new Error(String(r.error));
  });
}

/**
 * Get the value from a Result or a default value
 */
export function unwrapOr<V, E>(result: Result<V, E>, defaultValue: V): V {
  return result.ok ? result.value : defaultValue;
}

/**
 * Get the value from a Result or compute a default
 */
export function unwrapOrElse<V, E>(result: Result<V, E>, defaultFn: (error: E) => V): V {
  return result.ok ? result.value : defaultFn(result.error);
}

/**
 * Get the error from a Result or a default error
 */
export function unwrapErrOr<V, E>(result: Result<V, E>, defaultError: E): E {
  return result.ok ? defaultError : result.error;
}

/**
 * Expect a Result to be Ok, panic with a custom message if it's Err
 */
export function expect<V, E>(result: Result<V, E>, message: string): V {
  if (result.ok) {
    return result.value;
  }
  throw new Error(`${message}: ${result.error}`);
}

/**
 * Assert that a Result is Ok and return the value, or panic
 */
export function assertOk<V, E>(result: Result<V, E>): V {
  if (result.ok) {
    return result.value;
  }
  throw new Error(`Assertion failed: expected Ok, got Err(${result.error})`);
}

/**
 * Assert that a Result is Err and return the error, or panic
 */
export function assertErr<V, E>(result: Result<V, E>): E {
  if (!result.ok) {
    return result.error;
  }
  throw new Error(`Assertion failed: expected Err, got Ok(${result.value})`);
}
