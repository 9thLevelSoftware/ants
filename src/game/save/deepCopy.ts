// Fast deep copy of plain simulation data (JSON-like values plus typed arrays), the "cheap deep copy" behind the
// in-memory back end and the tick-boundary snapshot. Roughly 3-5x faster than structuredClone on a 1,500-ant state:
// no cycle bookkeeping, `for...in` instead of Object.keys + map, typed arrays copied with slice().
// Supports exactly what SimState may contain (src/sim/testing/plainData.ts); anything else is a bug upstream.

export function deepCopy<T>(v: T): T {
  return copy(v) as T;
}

function copy(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) {
    const n = v.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      const x = v[i];
      out[i] = x === null || typeof x !== 'object' ? x : copy(x);
    }
    return out;
  }
  if (ArrayBuffer.isView(v)) return (v as unknown as { slice(): unknown }).slice();
  const out: Record<string, unknown> = {};
  for (const k in v as Record<string, unknown>) {
    const x = (v as Record<string, unknown>)[k];
    if (k === '__proto__') Object.defineProperty(out, k, { value: copy(x), enumerable: true, writable: true, configurable: true });
    else out[k] = x === null || typeof x !== 'object' ? x : copy(x);
  }
  return out;
}

/** Rough byte size of a plain value (typed arrays exact, numbers 8, strings 2 per char, 16 per object key). Quota tests. */
export function estimateBytes(v: unknown): number {
  if (v === null || v === undefined) return 0;
  switch (typeof v) {
    case 'number': return 8;
    case 'boolean': return 4;
    case 'string': return v.length * 2;
    case 'object': break;
    default: return 0;
  }
  if (ArrayBuffer.isView(v)) return v.byteLength;
  let n = 0;
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) n += estimateBytes(v[i]);
    return n;
  }
  for (const k in v as Record<string, unknown>) n += 16 + estimateBytes((v as Record<string, unknown>)[k]);
  return n;
}
