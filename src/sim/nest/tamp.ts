// Tamping (GDD 03 §1.3) and the passage rule (sim-fix-colony): untouched spoil and clutter pellets are pressed
// into the floor; the floor rises, but never so that the open space around the fill splits, plainly or as passages
// the species' workers can walk (passage.ts: open samples whose clearance spans TAMP_MIN_HEADROOM_BU body lengths of
// the largest worker; GDD 03 §5.1 "under 1.5 BU is a crack"). Narrowing to a squeeze is allowed (§1.3 "unhauled
// spoil slowly narrows tunnels"); cutting a chamber off its entrance is not (§5.3 N1).
//
// Review note (sim-fix-colony): an earlier rule also demanded that every raised floor COLUMN keep that headroom.
// In a round 2 BU tunnel the off-centre columns are lower than 1.5 BU from the start, so the fill had to spread
// along the tunnel axis up to 4 BU, against §1.3 (within 1.0 BU, 1.5 BU if not enough) and App. E check 7. The
// walkable passage (§5.1 clearance) is what workers need, and the passage check keeps it.

import type { Vec3 } from '@/core/math/vec3';
import type { Item, Nest, Sim } from '@/sim/types';
import { VoxelFlag } from '@/sim/types';
import {
  ITEM_BURIED_BU, PELLET_BULK_PER_BU3, PELLET_TAMP_S, TAMP_MIN_HEADROOM_BU, TAMP_PASSAGE_GREEDY_MAX, TAMP_RADII_BU, TAMP_RETRY_S, TAMP_ROUNDS,
  TAMP_SPHERE_BU,
} from '@/sim/balance/nest';
import { removeItem } from '@/sim/entities';
import { TICKS_PER_SECOND } from '@/sim/time';
import { OPEN_FRACTION, OPEN_MIN } from './carve/keys';
import { fillSphere, forChangedSamples, readBox, sphereBox } from './carveOps';
import { isPellet, pelletNest } from './pellets';
import { fillKeepsPassages } from './passage';
import { nestRuntime } from './runtime';
import { packSample, sampleI, sampleJ, sampleK } from './voxelKey';

/**
 * Untouched clutter and spoil-pile pellets are pressed into the floor at PELLET_TAMP_S of age, and those that did
 * not fit (the passage rule) again every TAMP_RETRY_S after that. The schedule is a function of the drop tick
 * alone, so a retried pellet keeps its age (and its full haul urgency, pelletHaulUrgency).
 */
export function tampDuePellets(sim: Sim): void {
  const age = PELLET_TAMP_S * TICKS_PER_SECOND, retry = TAMP_RETRY_S * TICKS_PER_SECOND, now = sim.state.tick;
  const list = sim.stores.items.list;
  for (let n = 0; n < list.length; n++) {
    const it = list[n];
    if (!it.alive || !isPellet(it) || !it.inNest || it.carrierIds.length > 0 || it.reservedBy >= 0) continue;
    const elapsed = now + 1 - it.droppedTick; // ticks elapsed when this tick ends
    if (elapsed >= age && (elapsed - age) % retry === 0) tampPellet(sim, it);
  }
}

/** Share of a pellet's volume a tamp may leave unplaced and still count as complete (fill rounding). */
const TAMP_DONE_SHARE = 0.01;

/**
 * Presses a pellet's volume into the floor under it (GDD 03 §1.3): floor voxels near it (open, a non-open voxel
 * below) lose openness evenly and are flagged LOOSE; the floor rises. Passage rule: the fill never splits the open
 * space around it, plainly or as passages tampPassageSamples across (passage.ts); the radii of TAMP_RADII_BU are
 * tried in turn. A pellet whose volume finds no room keeps what is left, lying where it is, and is tried again
 * every TAMP_RETRY_S (tampDuePellets), so unhauled spoil narrows tunnels to a squeeze but never closes one (GDD 03
 * §5.1 walkable >= 1.5 BU; §5.3 N1 every chamber keeps its path to an entrance). Returns true when the pellet is
 * gone.
 */
export function tampPellet(sim: Sim, it: Item): boolean {
  const bu3 = sim.world.bu ** 3;
  // a pellet a fill or plug closed over (buried inside solid soil) is part of that soil already
  if (sim.field.sample(it.pos) < -ITEM_BURIED_BU * sim.world.bu) {
    removeItem(sim, it.id, 'tamp');
    sim.emit({ type: 'pellet-dumped', itemId: it.id, into: 'tamp' });
    return true;
  }
  const closed = raiseFloor(sim, it.pos, it.volume * bu3, tampPassageSamples(sim, pelletNest(sim, it))) / bu3;
  if (closed >= it.volume * (1 - TAMP_DONE_SHARE)) {
    removeItem(sim, it.id, 'tamp');
    sim.emit({ type: 'pellet-dumped', itemId: it.id, into: 'tamp' });
    return true;
  }
  it.volume -= closed;
  it.bulk = PELLET_BULK_PER_BU3 * it.volume;
  return false;
}

/**
 * The floor samples of a round whose fill keeps the passages around them (passage.ts, checked at the fullest fill,
 * depth 0, so any shallower fit is safe too): all of them when that passes, else those that can be added one by
 * one in scan order (at most TAMP_PASSAGE_GREEDY_MAX tried).
 */
function passageSafeFloor(sim: Sim, floor: Vec3[], r: number, across: number): Vec3[] {
  if (fillKeepsPassages(sim, floor, r, across)) return floor;
  const kept: Vec3[] = [];
  for (let n = 0; n < floor.length && n < TAMP_PASSAGE_GREEDY_MAX; n++) {
    kept.push(floor[n]);
    if (!fillKeepsPassages(sim, kept, r, across)) kept.pop();
  }
  return kept;
}

/**
 * Samples across a passage the species' workers can walk (the passage rule): TAMP_MIN_HEADROOM_BU body lengths of
 * its largest worker caste, rounded up to whole samples (3 = 1.5 BU for the standard worker).
 */
export function tampPassageSamples(sim: Sim, nest: Nest | undefined): number {
  const species = sim.getSpecies((nest ? sim.stores.colonies.get(nest.colony)?.species : undefined) ?? sim.species.id) ?? sim.species;
  let len = 1;
  for (const c of species.castes) if (c.caste !== 'queen' && c.caste !== 'gyne' && c.caste !== 'male') len = Math.max(len, c.lengthBu.mean);
  return Math.ceil((TAMP_MIN_HEADROOM_BU * len * sim.world.bu) / sim.carve.voxel - 1e-9);
}

/** Floor samples around p: open, inside the substrate, with a non-open sample below, within `radius` of p (scan order). */
function floorSamples(sim: Sim, p: Vec3, radius: number): Vec3[] {
  const carve = sim.carve, v = carve.voxel, out: Vec3[] = [];
  for (let k = Math.floor((p.z - radius) / v); k <= Math.ceil((p.z + radius) / v); k++)
    for (let j = Math.floor((p.y - radius) / v); j <= Math.ceil((p.y + radius) / v); j++)
      for (let i = Math.floor((p.x - radius) / v); i <= Math.ceil((p.x + radius) / v); i++) {
        if (Math.hypot(i * v - p.x, j * v - p.y, k * v - p.z) > radius) continue;
        if (carve.sampleAt(i, j, k) < OPEN_MIN || carve.sampleAt(i, j - 1, k) >= OPEN_MIN) continue;
        if (sim.field.substrateXYZ(i * v, j * v, k * v) > 0) continue;
        out.push({ x: i * v, y: j * v, z: k * v });
      }
  return out;
}

/**
 * Volume (mm^3) a fill of the spheres (centres, r) would close now: the brush ramp rule per sample (the nearest
 * sphere sets it), the grid's own accounting (open fraction x solid share), no residual clearing. Each sphere
 * reaches only r + ramp / 2, so only the samples around the centres are visited.
 */
function dryFillVolume(sim: Sim, centres: readonly Vec3[], r: number): number {
  const carve = sim.carve, v = carve.voxel, ramp = carve.ramp, reach = r + ramp / 2;
  const fill = new Map<number, number>();
  for (const c of centres) {
    for (let k = Math.floor((c.z - reach) / v); k <= Math.ceil((c.z + reach) / v); k++)
      for (let j = Math.floor((c.y - reach) / v); j <= Math.ceil((c.y + reach) / v); j++)
        for (let i = Math.floor((c.x - reach) / v); i <= Math.ceil((c.x + reach) / v); i++) {
          let q = 0.5 - (Math.hypot(i * v - c.x, j * v - c.y, k * v - c.z) - r) / ramp;
          if (q <= 0) continue;
          q = q > 1 ? 1 : q;
          const nv = 255 - Math.round(q * 255), key = packSample(i, j, k);
          const was = fill.get(key);
          if (was === undefined || nv < was) fill.set(key, nv);
        }
  }
  let vol = 0;
  for (const [key, nv] of fill) {
    const i = sampleI(key), j = sampleJ(key), k = sampleK(key);
    const old = carve.sampleAt(i, j, k);
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
 * finds the risen floor). The first radius of TAMP_RADII_BU whose passage-safe floor can take the volume is used
 * (else the one that takes most): GDD 03 §1.3's 1.0 BU, then 1.5 BU, wider only where the passage rule leaves too
 * little floor. Lowering instead of shrinking the spheres keeps the fill a continuous function of the fit (the
 * brush's openness ramp makes even a zero-radius sphere close its centre sample). Returns mm^3 closed.
 */
function raiseFloor(sim: Sim, p: Vec3, target: number, across: number): number {
  const flags = nestRuntime(sim).flags, bu = sim.world.bu, r = TAMP_SPHERE_BU * bu;
  const sMax = r + sim.carve.ramp / 2; // spheres lowered this far no longer reach their floor sample
  const lowered = (floor: readonly Vec3[], s: number) => floor.map((c) => ({ x: c.x, y: c.y - s, z: c.z }));
  let closed = 0;
  for (let round = 0; round < TAMP_ROUNDS && target - closed > target * 0.002; round++) {
    const want = target - closed;
    let floor: Vec3[] = [], cap = 0;
    for (const rad of TAMP_RADII_BU) {
      const f = passageSafeFloor(sim, floorSamples(sim, p, rad * bu), r, across);
      const fCap = f.length > 0 ? dryFillVolume(sim, f, r) : 0;
      if (fCap > cap) { floor = f; cap = fCap; }
      if (cap >= want) break;
    }
    if (floor.length === 0) break;
    // depth s: 0 closes the most; the dry volume falls as s grows
    let lo = 0, hi = sMax;
    if (cap <= want) hi = 0;
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
