// Structural sharing for snapshot slices (change detection): a slice that is equal in value to the previous one
// keeps the previous object, so signal subscribers (computed slices in src/ui/hud/slices.ts) are not notified and
// Preact re-renders only what changed. Plain data only (numbers, strings, booleans, null, arrays, plain objects).

/** Deep equality of two plain-data values. No allocation. */
export function plainEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!plainEqual(a[i], b[i])) return false;
    return true;
  }
  if (Array.isArray(b)) return false;
  const ka = Object.keys(a as object);
  if (ka.length !== Object.keys(b as object).length) return false;
  for (const k of ka) {
    if (!(k in (b as object))) return false;
    if (!plainEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  }
  return true;
}

/** `prev` when it equals `next` in value, else `next`. */
export function share<T>(prev: T | undefined, next: T): T {
  return prev !== undefined && plainEqual(prev, next) ? prev : next;
}

/**
 * Shares every key of `next` with `prev` one level down (top-level keys keep their object when unchanged), and returns
 * `prev` itself when all keys are unchanged.
 */
export function shareFields<T extends object>(prev: T | undefined, next: T): T {
  if (!prev) return next;
  let same = true;
  const out = { ...next } as Record<string, unknown>;
  for (const k of Object.keys(next)) {
    const kept = share((prev as Record<string, unknown>)[k], out[k]);
    if (kept !== out[k]) out[k] = kept; // unchanged in value: the previous object
    if (kept !== (prev as Record<string, unknown>)[k]) same = false;
  }
  if (Object.keys(prev).length !== Object.keys(next).length) same = false;
  return same ? prev : (out as T);
}
