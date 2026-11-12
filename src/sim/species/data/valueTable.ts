// Helper of the table-driven species tests: a row names a GDD section, a dotted path into a SpeciesDef and the
// number (or string, or list) the design gives there. Not a test file itself, so it carries no test framework import.

import type { SpeciesDef } from '@/sim/types';

/** One transcribed design value. `tol` is the absolute tolerance for numbers (default exact). */
export type ValueRow = [section: string, path: string, expected: unknown, tol?: number];

const KEYS = ['caste', 'type', 'stage', 'id'] as const;

/**
 * Follows `path` through `root`. Array segments are a numeric index or the `caste` / `type` / `stage` / `id` of the
 * element to take (`castes.media.lengthBu.mean`, `nestTemplate.chambers.nursery.depthBu.1`).
 */
export function resolvePath(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const seg of path.split('.')) {
    if (Array.isArray(cur)) {
      const idx = /^\d+$/.test(seg) ? Number(seg) : -1;
      cur = idx >= 0 ? cur[idx] : cur.find((e) => KEYS.some((k) => (e as Record<string, unknown>)[k] === seg));
    } else if (cur && typeof cur === 'object') cur = (cur as Record<string, unknown>)[seg];
    else return undefined;
  }
  return cur;
}

function same(actual: unknown, expected: unknown, tol: number): boolean {
  if (typeof expected === 'number') return typeof actual === 'number' && Math.abs(actual - expected) <= tol + 1e-12;
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length && expected.every((e, i) => same(actual[i], e, tol));
  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object') return false;
    const keys = Object.keys(expected);
    return keys.length === Object.keys(actual).length && keys.every((k) => same((actual as Record<string, unknown>)[k], (expected as Record<string, unknown>)[k], tol));
  }
  return actual === expected;
}

/** Rows whose value in `def` differs from the design: an empty list means the data matches the table. */
export function mismatches(def: SpeciesDef, rows: readonly ValueRow[]): string[] {
  const bad: string[] = [];
  for (const [section, path, expected, tol = 0] of rows) {
    const actual = resolvePath(def, path);
    if (!same(actual, expected, tol)) bad.push(`${def.id} ${path} (GDD 07 ${section}): expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
  return bad;
}
