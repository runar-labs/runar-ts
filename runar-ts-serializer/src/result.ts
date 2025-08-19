export type Ok<V> = { ok: true; value: V };
export type Err<E = Error> = { ok: false; error: E };
export type Result<V, E = Error> = Ok<V> | Err<E>;

export function ok<V>(value: V): Ok<V> {
  return { ok: true, value };
}

export function err<E = Error>(error: E): Err<E> {
  return { ok: false, error };
}


