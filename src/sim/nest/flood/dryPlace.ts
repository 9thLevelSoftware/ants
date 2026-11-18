// Where the water is, for the ants that must get out of it (GDD 03 §11.3 "flee water along D_exit until dry",
// "everything flooded: ants gather at the highest non-flooded voxels, including the throat and the mound surface";
// task nest-fix3). Pure reads of the nest's flood state (FloodState.level) and its spill cache as the last flood step
// left it, placed in the current cavities (runtime.ts spillForReaders).
//   waterView      the wet nest's level and cache, or null when the nest is dry or has no cache yet
//   depthOver      water over a body's feet, by the drowning rule (drown.ts): the level minus the higher of the feet
//                  and the bottom of the column floor's spill layer
//   isDryAt        a place an ant may stand at least `margin` clear of the water: above the level, or over a floor
//                  the water has not reached (a side chamber behind a sill)
//   dryPlace       the nearest dry place: first along the nest's exit field (staying inside if the route passes one),
//                  else, along the route out, just outside the opening it ends at; with no exit field, the nearest
//                  basin floor whose spill layer stands clear of the water; null when the basin is full. `route`
//                  says how to get there: 'exit' = follow the exit field (the place is a cavity sample on it, not a
//                  standing point: the walker stops where her own feet are dry), 'walk' = walk to the point (a
//                  surface point outside, or a floor voxel of the basin)

import type { Vec3 } from '@/core/math/vec3';
import type { Entrance, Nest, Sim } from '@/sim/types';
import { nestFieldId } from '@/sim/types';
import { FLEE_OUTSIDE_BU, FLEE_ROUTE_MAX_STEPS, FLEE_SCAN_MAX_SAMPLES } from '@/sim/balance/weather';
import { spillForReaders } from './runtime';
import { waterDepthOver, type SpillCache } from './spill';

/** A wet nest as the last flood step left it. */
export interface WaterView {
  nest: Nest;
  cache: SpillCache;
  /** Water level, mm (world y). */
  level: number;
}

/** The nest's water as of its last flood step, or null when dry (or no cache was built yet). */
export function waterView(sim: Sim, nest: Nest): WaterView | null {
  if (!nest.alive || nest.flood.water <= 0 || !(nest.flood.level > -1e8)) return null;
  return { nest, cache: spillForReaders(sim, nest), level: nest.flood.level };
}

/** Water over a body at p with its feet at feetY, mm (the drowning rule's measure); -Infinity off the basin. */
export function depthOver(sim: Sim, w: WaterView, p: Vec3, feetY: number): number {
  if (w.level - feetY < -1e6) return -Infinity;
  return waterDepthOver(w.cache, sim.carve.voxel, p.x, p.y, p.z, w.level, feetY);
}

/**
 * Can an ant stand at p at least `margin` mm clear of the water? Above the level by the margin, or over a column
 * whose floor the water has not reached by the margin (a floor behind a higher sill), or off the basin altogether.
 */
export function isDryAt(sim: Sim, w: WaterView, p: Vec3, margin: number): boolean {
  if (p.y - w.level >= margin) return true;
  return waterDepthOver(w.cache, sim.carve.voxel, p.x, p.y, p.z, w.level, -Infinity) <= -margin;
}

/** Result of dryPlace: the point, whether it lies outside the nest (through an opening), and how to get there. */
export interface DryPlace {
  pos: Vec3;
  outside: boolean;
  route: 'exit' | 'walk';
}

const step: Vec3 = { x: 0, y: 0, z: 0 };

/** The open entrance nearest p (the one the exit route ends at). */
function nearestOpen(nest: Nest, p: Vec3): Entrance | undefined {
  let best: Entrance | undefined, bestD = Infinity;
  for (const e of nest.entrances) {
    if (e.status !== 'open') continue;
    const d = Math.hypot(e.pos.x - p.x, e.pos.y - p.y, e.pos.z - p.z);
    if (d < bestD) { best = e; bestD = d; }
  }
  return best;
}

/** A surface point FLEE_OUTSIDE_BU beyond the opening's rim, on the side the entrance faces. */
function outsidePoint(sim: Sim, e: Entrance): Vec3 {
  let dx = e.dir.x, dz = e.dir.z;
  const l = Math.hypot(dx, dz);
  if (l < 1e-3) { dx = 1; dz = 0; } else { dx /= l; dz /= l; }
  const r = e.radius + FLEE_OUTSIDE_BU * sim.world.bu;
  const x = e.pos.x + dx * r, z = e.pos.z + dz * r;
  return { x, y: sim.field.height(x, z), z };
}

/** The surface place just outside the open entrance nearest p (where a flight out of the nest ends), or null. */
export function outsidePlace(sim: Sim, nest: Nest, p: Vec3): DryPlace | null {
  const e = nearestOpen(nest, p);
  return e ? { pos: outsidePoint(sim, e), outside: true, route: 'walk' } : null;
}

/** Follows the exit field down from p, sample by sample, to the first dry sample; the opening when there is none. */
function alongExit(sim: Sim, w: WaterView, from: Vec3, margin: number): DryPlace | null {
  const id = nestFieldId(w.nest.id, { kind: 'exit', id: -1 });
  const nav = sim.nestNav;
  if (!nav.hasTarget(id) || !Number.isFinite(nav.distanceAt(id, from))) return null;
  step.x = from.x; step.y = from.y; step.z = from.z;
  for (let n = 0; n < FLEE_ROUTE_MAX_STEPS; n++) {
    const px = step.x, py = step.y, pz = step.z;
    const d = nav.lookahead(id, step, 1, step);
    if (!Number.isFinite(d)) return null;
    if (isDryAt(sim, w, step, margin)) {
      const outside = sim.field.substrate(step) >= 0;
      return { pos: { x: step.x, y: step.y, z: step.z }, outside, route: 'exit' };
    }
    if (d <= 0 || (step.x === px && step.y === py && step.z === pz && n > 0)) break;
  }
  return outsidePlace(sim, w.nest, step);
}

/** The basin's high floors for one water level and margin (built once per flood step, shared by every wet ant). */
interface HighFloors { level: number; margin: number; samples: Int32Array }
const HIGH_FLOORS = new WeakMap<SpillCache, HighFloors>();

/**
 * Basin samples whose spill layer stands at least `margin` above the water and that have a floor (a non-basin sample
 * right below them), scanning down from the highest spill layer (at most FLEE_SCAN_MAX_SAMPLES). A function of the
 * cache, the level and the margin only, so it is kept per cache until the level changes.
 */
function highFloors(w: WaterView, margin: number, v: number): Int32Array {
  const c = w.cache;
  const hit = HIGH_FLOORS.get(c);
  if (hit && hit.level === w.level && hit.margin === margin) return hit.samples;
  const out: number[] = [];
  const stop = Math.max(0, c.si.length - FLEE_SCAN_MAX_SAMPLES);
  for (let s = c.si.length - 1; s >= stop; s--) {
    if ((c.level[s] - 0.5) * v < w.level + margin) break;
    if (c.index.get(c.si[s], c.sj[s] - 1, c.sk[s]) >= 0) continue; // not a floor
    out.push(s);
  }
  const samples = Int32Array.from(out);
  HIGH_FLOORS.set(c, { level: w.level, margin, samples });
  return samples;
}

/** The high, dry basin floor nearest `from` (highFloors), ties to the earlier sample. */
function highGround(sim: Sim, w: WaterView, from: Vec3, margin: number): DryPlace | null {
  const c = w.cache, v = sim.carve.voxel, list = highFloors(w, margin, v);
  let best = -1, bestD = Infinity;
  for (let n = 0; n < list.length; n++) {
    const s = list[n];
    const d = (c.si[s] * v - from.x) ** 2 + (c.sj[s] * v - from.y) ** 2 + (c.sk[s] * v - from.z) ** 2;
    if (d < bestD) { bestD = d; best = s; }
  }
  if (best < 0) return null;
  return { pos: { x: c.si[best] * v, y: c.sj[best] * v, z: c.sk[best] * v }, outside: false, route: 'walk' };
}

/**
 * The nearest dry place for an ant at `from` in the wet nest, `margin` mm clear of the water: along the exit field
 * (first dry sample, else outside the opening the route ends at), else (no exit field from here: every entrance
 * closed) the nearest high, dry floor of the basin. Null when there is none (a full sump with no way out).
 */
export function dryPlace(sim: Sim, w: WaterView, from: Vec3, margin: number): DryPlace | null {
  return alongExit(sim, w, from, margin) ?? highGround(sim, w, from, margin);
}
