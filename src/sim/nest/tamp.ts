// Tamping (GDD 03 §1.3) and the passage rule (sim-fix-colony): untouched spoil and clutter pellets are pressed
// into the floor; the floor rises, but never so far that a raised floor has less headroom than the species'
// workers need (1.5 body lengths, GDD 03 §5.1) and never so that the open space around the fill splits, plainly or
// as passages at least 1.5 BU across (passage.ts). Narrowing to a squeeze is allowed (§1.3 "unhauled spoil slowly
// narrows tunnels"); cutting a chamber off its entrance is not (§5.3 N1).

import type { Vec3 } from '@/core/math/vec3';
import type { Item, Nest, Sim } from '@/sim/types';
import { VoxelFlag } from '@/sim/types';
import {
  PELLET_BULK_PER_BU3, PELLET_TAMP_S, TAMP_MIN_HEADROOM_BU, TAMP_PASSAGE_GREEDY_MAX, TAMP_RADII_BU, TAMP_RETRY_S, TAMP_ROUNDS,
  TAMP_SPHERE_BU,
} from '@/sim/balance/nest';
import { removeItem } from '@/sim/entities';
import { TICKS_PER_SECOND } from '@/sim/time';
import { OPEN_FRACTION, OPEN_MIN } from './carve/keys';
import { fillSphere, forChangedSamples, readBox, sphereBox } from './carveOps';
import { isPellet, pelletNest } from './pellets';
import { fillKeepsPassages } from './passage';
import { nestRuntime } from './runtime';

/** Untouched clutter and spoil-pile pellets older than PELLET_TAMP_S are pressed into the floor. */
export function tampDuePellets(sim: Sim): void {
  const age = PELLET_TAMP_S * TICKS_PER_SECOND, now = sim.state.tick;
  const list = sim.stores.items.list;
  for (let n = 0; n < list.length; n++) {
    const it = list[n];
    if (!it.alive || !isPellet(it) || !it.inNest || it.carrierIds.length > 0 || it.reservedBy >= 0) continue;
    if (now + 1 - it.droppedTick >= age) tampPellet(sim, it); // ticks elapsed when this tick ends
  }
}

/** Share of a pellet's volume a tamp may leave unplaced and still count as complete (fill rounding). */
const TAMP_DONE_SHARE = 0.01;

/**
 * Presses a pellet's volume into the floor under it (GDD 03 §1.3): floor voxels near it (open, a non-open voxel
 * below) lose openness evenly and are flagged LOOSE; the floor rises. Passage rule: only floor samples that keep
 * at least the species' minimum headroom above them once raised are used (tampHeadroomSamples), trying the radii
 * of TAMP_RADII_BU in turn. A pellet whose volume finds no room keeps what is left, lying where it is, and is tried
 * again after TAMP_RETRY_S (its haul urgency stays high), so unhauled spoil narrows tunnels to a squeeze but never
 * closes one (GDD 03 §5.1 walkable >= 1.5 BU; §5.3 N1 every chamber keeps its path to an entrance).
 */
export function tampPellet(sim: Sim, it: Item): void {
  const bu3 = sim.world.bu ** 3;
  const need = tampHeadroomSamples(sim, pelletNest(sim, it));
  const closed = raiseFloor(sim, it.pos, it.volume * bu3, need) / bu3;
  if (closed >= it.volume * (1 - TAMP_DONE_SHARE)) {
    removeItem(sim, it.id, 'tamp');
    sim.emit({ type: 'pellet-dumped', itemId: it.id, into: 'tamp' });
    return;
  }
  it.volume -= closed;
  it.bulk = PELLET_BULK_PER_BU3 * it.volume;
  it.droppedTick = sim.state.tick - (PELLET_TAMP_S - TAMP_RETRY_S) * TICKS_PER_SECOND;
}

/**
 * The floor samples of a round whose fill keeps the passages around them (passage.ts, checked at the fullest fill,
 * depth 0, so any shallower fit is safe too): all of them when that passes, else those that can be added one by
 * one in scan order (at most TAMP_PASSAGE_GREEDY_MAX tried).
 */
function passageSafeFloor(sim: Sim, floor: Vec3[], r: number): Vec3[] {
  if (fillKeepsPassages(sim, floor, r)) return floor;
  const kept: Vec3[] = [];
  for (let n = 0; n < floor.length && n < TAMP_PASSAGE_GREEDY_MAX; n++) {
    kept.push(floor[n]);
    if (!fillKeepsPassages(sim, kept, r)) kept.pop();
  }
  return kept;
}

/** Open samples a raised floor sample needs above it (itself included) under the passage rule. */
export function tampHeadroomSamples(sim: Sim, nest: Nest | undefined): number {
  const species = sim.getSpecies((nest ? sim.stores.colonies.get(nest.colony)?.species : undefined) ?? sim.species.id) ?? sim.species;
  let len = 1;
  for (const c of species.castes) if (c.caste !== 'queen' && c.caste !== 'gyne' && c.caste !== 'male') len = Math.max(len, c.lengthBu.mean);
  return Math.ceil((TAMP_MIN_HEADROOM_BU * len * sim.world.bu) / sim.carve.voxel - 1e-9);
}

/** Open samples from (i, j, k) straight up (itself included), counted up to `cap`. */
function openRunUp(sim: Sim, i: number, j: number, k: number, cap: number): number {
  let n = 0;
  while (n < cap && sim.carve.sampleAt(i, j + n, k) >= OPEN_MIN) n++;
  return n;
}

/**
 * Floor samples around p: open, inside the substrate, with a non-open sample below, within `radius` of p, whose
 * column keeps `minRun` open samples once the floor sample itself is closed (fixed scan order).
 */
function floorSamples(sim: Sim, p: Vec3, radius: number, minRun: number): Vec3[] {
  const carve = sim.carve, v = carve.voxel, out: Vec3[] = [];
  for (let k = Math.floor((p.z - radius) / v); k <= Math.ceil((p.z + radius) / v); k++)
    for (let j = Math.floor((p.y - radius) / v); j <= Math.ceil((p.y + radius) / v); j++)
      for (let i = Math.floor((p.x - radius) / v); i <= Math.ceil((p.x + radius) / v); i++) {
        if (Math.hypot(i * v - p.x, j * v - p.y, k * v - p.z) > radius) continue;
        if (carve.sampleAt(i, j, k) < OPEN_MIN || carve.sampleAt(i, j - 1, k) >= OPEN_MIN) continue;
        if (sim.field.substrateXYZ(i * v, j * v, k * v) > 0) continue;
        if (openRunUp(sim, i, j, k, minRun + 1) < minRun + 1) continue; // closing it would leave < minRun
        out.push({ x: i * v, y: j * v, z: k * v });
      }
  return out;
}

/** Volume (mm^3) a fill of the spheres (centres, r) would close now (the grid's own accounting, no residual clearing). */
function dryFillVolume(sim: Sim, centres: readonly Vec3[], r: number): number {
  const carve = sim.carve, v = carve.voxel, ramp = carve.ramp, reach = r + ramp / 2;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const c of centres) {
    x0 = Math.min(x0, c.x); x1 = Math.max(x1, c.x); y0 = Math.min(y0, c.y); y1 = Math.max(y1, c.y); z0 = Math.min(z0, c.z); z1 = Math.max(z1, c.z);
  }
  let vol = 0;
  for (let k = Math.floor((z0 - reach) / v); k <= Math.ceil((z1 + reach) / v); k++)
    for (let j = Math.floor((y0 - reach) / v); j <= Math.ceil((y1 + reach) / v); j++)
      for (let i = Math.floor((x0 - reach) / v); i <= Math.ceil((x1 + reach) / v); i++) {
        const old = carve.sampleAt(i, j, k);
        if (old === 0) continue;
        let sd = Infinity;
        for (const c of centres) sd = Math.min(sd, Math.hypot(i * v - c.x, j * v - c.y, k * v - c.z) - r);
        let q = 0.5 - sd / ramp;
        q = q < 0 ? 0 : q > 1 ? 1 : q;
        const nv = 255 - Math.round(q * 255);
        if (old <= nv) continue;
        let solid = 0.5 - sim.field.substrateXYZ(i * v, j * v, k * v) / v;
        solid = solid < 0 ? 0 : solid > 1 ? 1 : solid;
        vol += (OPEN_FRACTION[old] - OPEN_FRACTION[nv]) * solid;
      }
  return vol * v * v * v;
}

/**
 * Closes up to `target` mm^3 of floor around p: one small fill sphere (radius TAMP_SPHERE) under each floor sample,
 * all lowered by one depth fitted on a dry run, so the floor rises evenly; topped up over a few rounds (each round
 * finds the risen floor, and only samples that keep `minRun` open samples above them). The first radius of
 * TAMP_RADII_BU whose floor can take the volume is used (else the widest with any floor). Lowering instead of
 * shrinking the spheres keeps the fill a continuous function of the fit (the brush's openness ramp makes even a
 * zero-radius sphere close its centre sample). Returns mm^3 closed.
 */
function raiseFloor(sim: Sim, p: Vec3, target: number, minRun: number): number {
  const flags = nestRuntime(sim).flags, bu = sim.world.bu, r = TAMP_SPHERE_BU * bu;
  const sMax = r + sim.carve.ramp / 2; // spheres lowered this far no longer reach their floor sample
  const lowered = (floor: readonly Vec3[], s: number) => floor.map((c) => ({ x: c.x, y: c.y - s, z: c.z }));
  let closed = 0;
  for (let round = 0; round < TAMP_ROUNDS && target - closed > target * 0.002; round++) {
    const want = target - closed;
    let floor: Vec3[] = [];
    for (const rad of TAMP_RADII_BU) {
      const f = floorSamples(sim, p, rad * bu, minRun);
      if (f.length > 0) floor = f;
      if (f.length > 0 && dryFillVolume(sim, f, r) >= want) break;
    }
    floor = passageSafeFloor(sim, floor, r);
    if (floor.length === 0) break;
    // depth s: 0 closes the most; the dry volume falls as s grows
    let lo = 0, hi = sMax;
    if (dryFillVolume(sim, floor, r) <= want) hi = 0;
    else for (let n = 0; n < 18; n++) {
      const mid = (lo + hi) / 2;
      if (dryFillVolume(sim, lowered(floor, mid), r) > want) lo = mid; else hi = mid;
    }
    let got = 0;
    for (const c of lowered(floor, hi)) {
      const box = sphereBox(sim, c, r, 2);
      const before = readBox(sim, box);
      got += fillSphere(sim, c, r).volume;
      forChangedSamples(sim, box, before, (i, j, k, old, now) => { if (now < old) flags.add(i, j, k, VoxelFlag.LOOSE); });
    }
    if (got <= 0) break;
    closed += got;
  }
  return closed;
}

