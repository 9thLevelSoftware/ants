// References between entities. All references are by numeric id (-1 = none) and resolved through runtime
// stores, which return undefined for dead entities, so stale references are harmless.

import type { Vec3 } from '@/core/math/vec3';

/** Kinds of things a target slot can point at. */
export const TARGET_KINDS = [
  'none', 'ant', 'brood', 'item', 'source', 'creature', 'plant', 'herd', 'nest', 'entrance', 'chamber', 'plan',
  'marker', 'colony', 'surface', 'point',
] as const;
export type TargetKind = (typeof TARGET_KINDS)[number];

/**
 * Generic target slot: `id` is the entity id for entity kinds (-1 otherwise); `pos` (mm) is the last known
 * position, or the point itself for 'surface' / 'point'.
 */
export interface TargetRef {
  kind: TargetKind;
  /** Entity id, -1 for none / surface / point. */
  id: number;
  /** mm, world space. */
  pos: Vec3;
}

/** Point on a surface with its normal (dig anchors, sniff points, marker placement). */
export interface SurfaceRef {
  /** mm */
  pos: Vec3;
  /** Unit surface normal (direction of increasing f). */
  normal: Vec3;
}

/** Kinds of entities with stores and lifecycle events. */
export const ENTITY_KINDS = ['ant', 'brood', 'item', 'source', 'plant', 'creature', 'nest', 'marker', 'colony'] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

/** What an ant holds in its mandibles. */
export interface CarryRef {
  kind: 'none' | 'item' | 'brood';
  /** Item or brood id, -1 when kind is 'none'. */
  id: number;
}

/** A pair of nutrient amounts, loads (all nutrient fields are lowercase c / p, D2.15). */
export interface Nutrients {
  c: number;
  p: number;
}

/** A fresh empty target slot (allocates). */
export function noTarget(): TargetRef {
  return { kind: 'none', id: -1, pos: { x: 0, y: 0, z: 0 } };
}
