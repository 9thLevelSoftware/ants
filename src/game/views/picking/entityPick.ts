// What is under the cursor (GDD 01 §3.2, §6.6, §6.7): ants, brood, items, food sources, creatures, and - in the
// colony view or underground - chambers and entrances. Entities are spheres inflated to PICK_MIN_PX; the nearest
// hit along the ray wins, and nothing behind the first occluder (terrain, a cut face) counts. Pure reads of sim
// state; the views layer supplies the ray and the occluder distance.
import type { Vec3 } from '@/core';
import type { Sim } from '@/sim/types';
import { inflatedRadius, rayEllipsoid, raySphere, type PickCamera, type Ray } from './pickMath';

export type PickKind = 'ant' | 'brood' | 'item' | 'source' | 'creature' | 'chamber' | 'entrance';

/** A picked thing: kind + id, and where it is (mm). The HUD's inspect card reads it through ViewsLayer.inspectTarget. */
export interface PickTarget {
  kind: PickKind;
  id: number;
  pos: Vec3;
}

export interface PickHit extends PickTarget {
  /** Distance along the ray, mm. */
  t: number;
}

export interface PickOptions {
  /** Distance along the ray to the first thing drawn that hides what is behind it (mm); Infinity = none. */
  occluderT: number;
  /** Chambers and entrances are pickable (colony view, or the observer camera underground). */
  structures: boolean;
}

/** Pick sizes, BU (presentation constants: bounding radii of the drawn models). */
export const PICK_RADIUS_BU = { brood: 0.35, item: 0.3, source: 1.2, creature: 1.5, entrance: 1.5 } as const;
/** An entity counts as visible when its hit is at most this much (fraction of its radius) behind the occluder. */
const OCCLUDER_SLACK = 1;

const _c = { x: 0, y: 0, z: 0 };

function sphereHit(out: PickHit[], cam: PickCamera, ray: Ray, kind: PickKind, id: number, pos: Vec3, r: number, occluderT: number): void {
  const R = inflatedRadius(cam, pos, r);
  const t = raySphere(ray, pos, R);
  if (t < 0 || t > occluderT + OCCLUDER_SLACK * R) return;
  out.push({ kind, id, pos: { x: pos.x, y: pos.y, z: pos.z }, t });
}

/**
 * Every hit under the ray, nearest first: entities (ants, brood, items, sources, creatures) before structures
 * (a chamber contains the ants in it, so the ray always enters it first). `out` is cleared.
 */
export function pickEntities(sim: Sim, cam: PickCamera, ray: Ray, opts: PickOptions, out: PickHit[]): PickHit[] {
  out.length = 0;
  const bu = sim.world.bu, st = sim.state, occ = opts.occluderT;
  for (const a of st.ants) {
    if (!a.alive) continue;
    const L = a.lengthBu * bu;
    _c.x = a.pos.x + a.up.x * 0.15 * L; _c.y = a.pos.y + a.up.y * 0.15 * L; _c.z = a.pos.z + a.up.z * 0.15 * L;
    sphereHit(out, cam, ray, 'ant', a.id, _c, 0.5 * L, occ);
  }
  for (const b of st.brood) if (b.alive && b.carriedBy < 0) sphereHit(out, cam, ray, 'brood', b.id, b.pos, PICK_RADIUS_BU.brood * bu, occ);
  for (const it of st.items) if (it.alive && it.carrierIds.length === 0) sphereHit(out, cam, ray, 'item', it.id, it.pos, Math.max(PICK_RADIUS_BU.item * bu, 0.5 * it.lengthMm), occ);
  for (const s of st.sources) if (s.alive) sphereHit(out, cam, ray, 'source', s.id, s.pos, PICK_RADIUS_BU.source * bu, occ);
  for (const c of st.creatures) if (c.alive) sphereHit(out, cam, ray, 'creature', c.id, c.pos, PICK_RADIUS_BU.creature * bu, occ);
  out.sort((a, b) => a.t - b.t || kindRank(a.kind) - kindRank(b.kind) || a.id - b.id);
  if (!opts.structures) return out;
  const structures: PickHit[] = [];
  const colony = st.colonies[0]?.id ?? -1;
  for (const n of st.nests) {
    if (n.colony !== colony) continue;
    for (const ch of n.chambers) {
      const t = rayEllipsoid(ray, ch.center, ch.radii);
      if (t >= 0 && t <= occ + 2 * bu) structures.push({ kind: 'chamber', id: ch.id, pos: { ...ch.center }, t });
    }
    for (const e of n.entrances) sphereHit(structures, cam, ray, 'entrance', e.id, e.pos, Math.max(e.radius, PICK_RADIUS_BU.entrance * bu), occ);
  }
  structures.sort((a, b) => a.t - b.t || a.id - b.id);
  for (const s of structures) out.push(s);
  return out;
}

/** Ties at the same distance: an ant before brood before items ... */
function kindRank(k: PickKind): number {
  return ['ant', 'brood', 'item', 'creature', 'source', 'entrance', 'chamber'].indexOf(k);
}

/** GDD 01 §3.2: repeated clicks on the same spot within PICK_CYCLE_S cycle through overlapping candidates. */
export const PICK_CYCLE_S = 1;
export const PICK_CYCLE_SLOP_PX = 6;

export class PickCycler {
  private lastT = -Infinity;
  private lastX = 0;
  private lastY = 0;
  private index = 0;

  /** The candidate a click at (x, y) px at real time nowS selects from `hits` (nearest first), or null. */
  choose(hits: readonly PickHit[], x: number, y: number, nowS: number): PickHit | null {
    if (hits.length === 0) { this.lastT = -Infinity; return null; }
    const same = nowS - this.lastT <= PICK_CYCLE_S && Math.hypot(x - this.lastX, y - this.lastY) < PICK_CYCLE_SLOP_PX;
    this.index = same ? (this.index + 1) % hits.length : 0;
    this.lastT = nowS; this.lastX = x; this.lastY = y;
    return hits[this.index];
  }
}

/** The renderers' highlight reference for a pick (ants, brood and items have one), else null. */
export function highlightRefOf(t: PickTarget | null): { kind: 'ant' | 'brood' | 'item'; id: number } | null {
  if (!t) return null;
  return t.kind === 'ant' || t.kind === 'brood' || t.kind === 'item' ? { kind: t.kind, id: t.id } : null;
}
