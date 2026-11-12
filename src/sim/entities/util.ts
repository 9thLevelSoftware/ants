// Small plain-data helpers for the entity factories.

import type { Vec3 } from '@/core/math/vec3';

/** Deep copy of plain data (objects, arrays, typed arrays, primitives). */
export function clonePlain<T>(v: T): T {
  if (v === null || typeof v !== 'object') return v;
  if (ArrayBuffer.isView(v)) return (v as unknown as { slice(): unknown }).slice() as T;
  if (Array.isArray(v)) return v.map((x) => clonePlain(x)) as T;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(v as object)) out[k] = clonePlain((v as Record<string, unknown>)[k]);
  return out as T;
}

/**
 * Copies the defined fields of `init` onto `target` (deep-copied, so callers may reuse their objects).
 * Fields set to undefined are skipped: persisted state never contains undefined.
 */
export function applyInit<T extends object>(target: T, init: Partial<T> | undefined): T {
  if (!init) return target;
  for (const k of Object.keys(init) as (keyof T)[]) {
    const v = init[k];
    if (v !== undefined) target[k] = clonePlain(v) as T[keyof T];
  }
  return target;
}

export function v3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function copyV(a: Vec3): Vec3 {
  return { x: a.x, y: a.y, z: a.z };
}
