// Runtime checks that stay on in production builds (they are cheap; silent corruption is not).

export class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssertionError';
  }
}

/** Throws AssertionError when cond is falsy. Pass a function to build expensive messages lazily. */
export function assert(cond: unknown, message?: string | (() => string)): asserts cond {
  if (!cond) {
    const text = typeof message === 'function' ? message() : message;
    throw new AssertionError(text ?? 'assertion failed');
  }
}

/** Throws unless x is a finite number (not NaN, not +-Infinity). Returns x for inline use. */
export function assertFinite(x: number, label = 'value'): number {
  if (!Number.isFinite(x)) throw new AssertionError(`${label} is not finite: ${x}`);
  return x;
}

/** Marks code paths the type checker proves impossible (exhaustive switch over a union). */
export function unreachable(x: never, message?: string): never {
  throw new AssertionError(message ?? `unreachable: ${JSON.stringify(x)}`);
}
