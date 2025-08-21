export type Ok<V> = { ok: true; value: V };
export type Err<E = Error> = { ok: false; error: E };
export type Result<V, E = Error> = Ok<V> | Err<E>;

export function ok<V>(value: V): Ok<V> {
  return { ok: true, value };
}

export function err<E = Error>(error: E): Err<E> {
  return { ok: false, error };
}

// Helper methods for Result type
export function isOk<V, E>(result: Result<V, E>): result is Ok<V> {
  return result.ok;
}

export function isErr<V, E>(result: Result<V, E>): result is Err<E> {
  return !result.ok;
}

export function unwrap<V, E>(result: Result<V, E>): V {
  if (result.ok) {
    return result.value;
  }
  throw new Error(`Called unwrap on Err: ${result.error}`);
}

export function unwrapErr<V, E>(result: Result<V, E>): E {
  if (!result.ok) {
    return result.error;
  }
  throw new Error(`Called unwrapErr on Ok: ${result.value}`);
}

// Extension methods for Result type
declare global {
  interface Object {
    isOk?(): boolean;
    isErr?(): boolean;
    unwrap?(): any;
    unwrapErr?(): any;
  }
}

// Add methods to Result prototype
Object.defineProperty(Object.prototype, 'isOk', {
  value: function (this: Result<any, any>): boolean {
    return isOk(this);
  },
  configurable: true,
  writable: true,
});

Object.defineProperty(Object.prototype, 'isErr', {
  value: function (this: Result<any, any>): boolean {
    return isErr(this);
  },
  configurable: true,
  writable: true,
});

Object.defineProperty(Object.prototype, 'unwrap', {
  value: function (this: Result<any, any>): any {
    return unwrap(this);
  },
  configurable: true,
  writable: true,
});

Object.defineProperty(Object.prototype, 'unwrapErr', {
  value: function (this: Result<any, any>): any {
    return unwrapErr(this);
  },
  configurable: true,
  writable: true,
});
