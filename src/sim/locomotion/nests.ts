// Nest-side queries locomotion needs: which nest a point is in, entrances, exit / chamber / plan fields, chamber
// membership, and shared "point fields" for goals inside a nest that no registered field covers.

import type { Vec3 } from '@/core/math/vec3';
import type { Chamber, Entrance, EntranceStatus, Nest, Sim } from '@/sim/types';
import { nestFieldId } from '@/sim/types';
import type { LocoRuntime } from './runtime';

const EXIT = { kind: 'exit', id: -1 } as const;
const SEAL = { kind: 'seal', id: -1 } as const;

/** Field leading out of a nest: the exit field if registered (open entrances), else the seal field, else ''. */
export function exitField(sim: Sim, nestId: number): string {
  const e = nestFieldId(nestId, EXIT);
  if (sim.nestNav.hasTarget(e)) return e;
  const s = nestFieldId(nestId, SEAL);
  return sim.nestNav.hasTarget(s) ? s : '';
}

/** True if p is below the substrate surface (inside the ground or a solid), i.e. a nest-interior point. */
export function isBelowGround(sim: Sim, p: Vec3): boolean {
  return sim.field.substrateXYZ(p.x, p.y, p.z) < -0.25 * sim.world.bu;
}

/** The alive nest whose open space contains p (finite exit or seal distance), -1 none. `prefer` is tried first. */
export function nestContaining(sim: Sim, p: Vec3, prefer = -1): number {
  if (prefer >= 0) {
    const f = exitField(sim, prefer);
    if (f && Number.isFinite(sim.nestNav.distanceAt(f, p))) return prefer;
  }
  for (const n of sim.state.nests) {
    if (!n.alive || n.id === prefer) continue;
    const f = exitField(sim, n.id);
    if (f && Number.isFinite(sim.nestNav.distanceAt(f, p))) return n.id;
  }
  return -1;
}

/**
 * True if p lies in the mouth of an entrance of the nest: within the entrance radius plus `rim` of its axis (plan
 * view) and no deeper than `depth` below the entrance point. Walkers on the lip flip between the cavity and the
 * surface there (trip hysteresis, update.ts).
 */
export function atMouth(sim: Sim, nestId: number, p: Vec3, rim: number, depth: number): boolean {
  const n = nestById(sim, nestId);
  if (!n) return false;
  for (const e of n.entrances) {
    const r = e.radius + rim;
    if ((p.x - e.pos.x) ** 2 + (p.z - e.pos.z) ** 2 <= r * r && p.y >= e.pos.y - depth) return true;
  }
  return false;
}

export function nestById(sim: Sim, id: number): Nest | undefined {
  return sim.stores.nests.get(id);
}

/** Nearest open entrance of a nest to p (straight line), or null. */
export function nearestOpenEntrance(sim: Sim, nestId: number, p: Vec3): Entrance | null {
  const n = nestById(sim, nestId);
  if (!n) return null;
  let best: Entrance | null = null, bd = Infinity;
  const usable = homeEntranceStatus(n);
  for (const e of n.entrances) {
    if (e.status !== usable) continue;
    const d = (e.pos.x - p.x) ** 2 + (e.pos.y - p.y) ** 2 + (e.pos.z - p.z) ** 2;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

/**
 * Which entrances a walker heads for to get into its nest: the `open` ones; when the nest has none, the ones with a
 * passage that is still narrower than NAV_CLEAR (`reopening`) or holds plug remnants (`sealing`). Walkers that left
 * through such a throat (the first workers while the plug is dug open) must be able to come back the same way
 * (int-1B-sim: on woodland-edge #3 every worker ended outside at a `reopening` entrance with no way home).
 */
export function homeEntranceStatus(n: Nest): EntranceStatus {
  if (n.entrances.some((e) => e.status === 'open')) return 'open';
  if (n.entrances.some((e) => e.status === 'reopening')) return 'reopening';
  return n.entrances.some((e) => e.status === 'sealing') ? 'sealing' : 'open';
}

export function entranceById(sim: Sim, id: number): { nest: Nest; entrance: Entrance } | null {
  for (const n of sim.state.nests) {
    if (!n.alive) continue;
    for (const e of n.entrances) if (e.id === id) return { nest: n, entrance: e };
  }
  return null;
}

export function chamberById(sim: Sim, id: number): { nest: Nest; chamber: Chamber } | null {
  for (const n of sim.state.nests) {
    if (!n.alive) continue;
    for (const c of n.chambers) if (c.id === id) return { nest: n, chamber: c };
  }
  return null;
}

/** Chamber of a nest whose ellipsoid (radii x 1.2) contains p, -1 none. */
export function chamberAt(nest: Nest, p: Vec3): number {
  for (const c of nest.chambers) {
    const dx = (p.x - c.center.x) / (c.radii.x * 1.2), dy = (p.y - c.center.y) / (c.radii.y * 1.2 + 0.0001);
    const dz = (p.z - c.center.z) / (c.radii.z * 1.2);
    if (dx * dx + dy * dy + dz * dz <= 1) return c.id;
  }
  return -1;
}

/** Field of a chamber, registered by the nest module; '' if not registered. */
export function chamberField(sim: Sim, nestId: number, chamberId: number): string {
  const id = nestFieldId(nestId, { kind: 'chamber', id: chamberId });
  return sim.nestNav.hasTarget(id) ? id : '';
}

/** Field of a dig plan, registered by the nest module; '' if not registered. */
export function planField(sim: Sim, nestId: number, planId: number): string {
  const id = nestFieldId(nestId, { kind: 'plan', id: planId });
  return sim.nestNav.hasTarget(id) ? id : '';
}

/**
 * A shared field to a point inside a nest (goal quantised to a small cell so nearby requests share it). The
 * registry is bounded: the oldest point field is removed beyond pointFieldMax.
 */
export function pointField(sim: Sim, r: LocoRuntime, p: Vec3): string {
  const q = r.P.pointFieldCell;
  const ix = Math.round(p.x / q), iy = Math.round(p.y / q), iz = Math.round(p.z / q);
  // The plain or the wide field is chosen from the goal and the nest alone, never from which fields happen to be
  // registered: the registry is a derived cache that a load rebuilds only for the fields walkers follow, so a choice
  // that read it ("the wide one exists, take it") made a loaded game walk other fields than the unsaved one (round 14).
  const id = `${POINT_PREFIX}${ix},${iy},${iz}`;
  const use = cellCentreCutOff(sim, ix * q, iy * q, iz * q, p) ? id + WIDE_SUFFIX : id;
  if (!sim.nestNav.hasTarget(use)) registerPointField(sim, r, use, ix, iy, iz);
  return use;
}

const POINT_PREFIX = 'loco:pt:';
/** Name suffix of a point field seeded over the whole quantisation cell (see cellCentreCutOff). */
const WIDE_SUFFIX = ';w';
const _o1 = { x: 0, y: 0, z: 0 }, _o2 = { x: 0, y: 0, z: 0 };

/**
 * Colony-life round 13 (kd #2's nursing gap): the quantised cell centre of a goal can lie in the wall, up to half the
 * cell's diagonal from a goal that has open space next to it (larvae resting 0.3-1 mm inside a nursery rim). Then
 * the centre has no open voxel to seed (or seeds one in another component) and the field reads infinite at every
 * walker: each walk to the goal failed and nurses were handed back to idle 4-13 times a game hour. True in that case:
 * such a field is seeded over pointFieldR + half the cell's diagonal ("wide", named so a reload rebuilds it the same).
 */
function cellCentreCutOff(sim: Sim, cx: number, cy: number, cz: number, goal: Vec3): boolean {
  const nav = sim.nestNav;
  if (!nav.nearestOpen(goal, _o2)) return false; // the goal itself has no open space near it: nothing to gain
  if (!nav.nearestOpen({ x: cx, y: cy, z: cz }, _o1)) return true;
  return nav.componentAt(_o1) !== nav.componentAt(_o2);
}

export function isPointField(id: string): boolean {
  return id.startsWith(POINT_PREFIX);
}

/**
 * Makes sure a field a walker follows exists: point fields are derived caches named by their goal cell, so after a
 * load (or eviction from the registry) they are registered again from the name. Other fields are the nest module's.
 */
export function ensureField(sim: Sim, r: LocoRuntime, id: string): void {
  if (!id || sim.nestNav.hasTarget(id) || !isPointField(id)) return;
  const [ix, iy, iz] = id.slice(POINT_PREFIX.length).replace(WIDE_SUFFIX, '').split(',').map(Number);
  if (Number.isFinite(ix) && Number.isFinite(iy) && Number.isFinite(iz)) registerPointField(sim, r, id, ix, iy, iz);
}

/**
 * A wide field (name ending in WIDE_SUFFIX) is seeded over pointFieldR + half the cell's diagonal. Beyond
 * pointFieldMax the oldest field that no walker follows is removed (gate-sim-2 fix): the registry's order is a derived
 * cache that a load rebuilds in another order, so evicting "the oldest" removed a field a raider was walking in the
 * unsaved game and another field after a load, and the two runs parted (sg #2, 31664 ticks after the hand-over). A
 * field no walker follows is never read without being registered again from its name, so its eviction changes nothing.
 */
function registerPointField(sim: Sim, r: LocoRuntime, id: string, ix: number, iy: number, iz: number): void {
  const q = r.P.pointFieldCell;
  const radius = id.endsWith(WIDE_SUFFIX) ? r.P.pointFieldR + 0.5 * Math.sqrt(3) * q : r.P.pointFieldR;
  sim.nestNav.setTarget(id, { points: [{ x: ix * q, y: iy * q, z: iz * q }], radius });
  r.pointFields.push(id);
  if (r.pointFields.length <= r.P.pointFieldMax) return;
  const used = followedPointFields(sim);
  used.add(id);
  for (let i = 0; i < r.pointFields.length && r.pointFields.length > r.P.pointFieldMax;) {
    const old = r.pointFields[i];
    if (used.has(old)) { i++; continue; }
    r.pointFields.splice(i, 1);
    sim.nestNav.removeTarget(old);
  }
}

/** Point fields some live walker's current leg or goal names. */
function followedPointFields(sim: Sim): Set<string> {
  const out = new Set<string>();
  const add = (w: { alive: boolean; nav: { loco?: { legField: string; goalField: string } } }): void => {
    const s = w.alive ? w.nav.loco : undefined;
    if (!s) return;
    if (isPointField(s.legField)) out.add(s.legField);
    if (isPointField(s.goalField)) out.add(s.goalField);
  };
  for (const a of sim.stores.ants.list) add(a);
  for (const c of sim.stores.creatures.list) add(c);
  return out;
}
