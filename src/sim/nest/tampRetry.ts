// When pellets in the nest are tamped (GDD 03 §1.3, tamp.ts does the tamping): the schedule by drop tick and item
// id, and a runtime memo that skips a retry which could only repeat a refusal (int-1B review: unbounded retry ticks).

import type { Item, Sim } from '@/sim/types';
import { PELLET_TAMP_S, TAMP_FIRST_SPREAD_TICKS, TAMP_PASSAGE_MARGIN_BU, TAMP_RADII_BU, TAMP_RETRY_S, TAMP_SPHERE_BU } from '@/sim/balance/nest';
import { TICKS_PER_SECOND } from '@/sim/time';
import { heightAt } from '@/sim/world/terrainSample';
import { moundOrigin } from './moundRelax';
import { isPellet } from './pellets';
import { chunkStampSum, nestRuntime } from './runtime';
import { tampPellet } from './tamp';

/**
 * Untouched clutter and spoil-pile pellets are pressed into the floor at PELLET_TAMP_S of age, and those that did
 * not fit (the passage rule) again every TAMP_RETRY_S after that. The schedule is a function of the drop tick and
 * the item id alone (state), so a retried pellet keeps its age (and its full haul urgency, pelletHaulUrgency) and a
 * restored game retries on the same ticks. The retries are phase-shifted by the item id across the retry period:
 * a batch of pellets dropped together used to retry on one tick (int-1B review: 1.3-4 s single nest ticks every
 * TAMP_RETRY_S on a 16-worker colony).
 */
export function tampDuePellets(sim: Sim): void {
  const age = PELLET_TAMP_S * TICKS_PER_SECOND, retry = TAMP_RETRY_S * TICKS_PER_SECOND, now = sim.state.tick;
  const list = sim.stores.items.list;
  const spread = TAMP_FIRST_SPREAD_TICKS;
  for (let n = 0; n < list.length; n++) {
    const it = list[n];
    if (!it.alive || !isPellet(it) || !it.inNest || it.carrierIds.length > 0 || it.reservedBy >= 0) continue;
    const late = now + 1 - it.droppedTick - age; // ticks past the tamp age when this tick ends
    // the first try up to TAMP_FIRST_SPREAD_TICKS early, phase-shifted by id: a batch dropped on one tick (a rival's
    // founding dig, a hauler's load) no longer tamps on one tick (nest-fix3: 150 pellets, 5.2 s in one tick)
    if (late === -(it.id % spread) || (late > 0 && late % retry === it.id % retry)) retryTamp(sim, it);
  }
}

/**
 * A due tamp, skipped when it would only repeat a refusal: the last try of this pellet placed nothing and none of
 * its inputs changed since (the carve samples around it, the piles over it when it is near the ground, moved
 * objects near it, the pellet itself; see tampSignature). A tamp is a pure function of those, so skipping cannot
 * change a result; the memo is runtime only (a restored game tries once more and is refused the same way). int-1B review: 69 refused pellets in the rival nests
 * of woodland-edge #1 cost 19 ms each per retry, about 0.4 ms per tick on average.
 */
function retryTamp(sim: Sim, it: Item): void {
  const memo = refusals(sim);
  const sig = tampSignature(sim, it);
  if (memo.get(it.id) === sig) return;
  const vol = it.volume;
  if (tampPellet(sim, it)) { memo.delete(it.id); return; }
  if (it.volume === vol) memo.set(it.id, tampSignature(sim, it)); else memo.delete(it.id);
}

const REFUSALS = new WeakMap<Sim, Map<number, string>>();
function refusals(sim: Sim): Map<number, string> {
  let m = REFUSALS.get(sim);
  if (!m) { m = new Map(); REFUSALS.set(sim, m); }
  return m;
}

/** Everything a tamp of the pellet reads (see retryTamp), as a string. */
function tampSignature(sim: Sim, it: Item): string {
  const v = sim.carve.voxel, bu = sim.world.bu, p = it.pos;
  // floor radius + fill sphere + brush ramp + the passage check's margin, and a sample below the floor
  const reach = (Math.max(...TAMP_RADII_BU) + TAMP_SPHERE_BU + TAMP_PASSAGE_MARGIN_BU) * bu + sim.carve.ramp + 2 * v;
  const box = {
    i0: Math.floor((p.x - reach) / v), j0: Math.floor((p.y - reach) / v), k0: Math.floor((p.z - reach) / v),
    i1: Math.ceil((p.x + reach) / v), j1: Math.ceil((p.y + reach) / v), k1: Math.ceil((p.z + reach) / v),
  };
  // of the voxel flags a tamp reads only the pellet's own sample (PLUG decides a buried pellet's fate; the fill only
  // adds LOOSE); the static world's primitives never change; piles (heights >= 0) only add solid above the ground,
  // which a box well below the terrain cannot see (every sample there is solid share 1 and inside the substrate)
  const piles = belowGround(sim, box) ? 'deep' : pileNear(sim, p.x, p.z, reach);
  const flag = nestRuntime(sim).flags.get(Math.round(p.x / v), Math.round(p.y / v), Math.round(p.z / v));
  return `${chunkStampSum(sim, box)}|${piles}|${dynPrimsNear(sim, box)}|${flag}`
    + `|${p.x},${p.y},${p.z}|${it.volume}|${it.nestId}`;
}

/**
 * Is the whole sample box deeper than BELOW_GROUND_VOXELS voxels plus the brush ramp under the static terrain? The
 * terrain is bilinear between its grid points, so the grid points around the box bound its lowest height. There the
 * substrate distance is below -v / 2 whatever pile lies on top, so tamping reads the same solid share and
 * inside-substrate test.
 */
function belowGround(sim: Sim, box: { i0: number; j0: number; k0: number; i1: number; j1: number; k1: number }): boolean {
  const v = sim.carve.voxel, hf = sim.world.terrain, c = hf.cell, top = box.j1 * v + BELOW_GROUND_VOXELS * v + sim.carve.ramp;
  for (let x = Math.floor((box.i0 * v) / c) * c; x <= Math.ceil((box.i1 * v) / c) * c; x += c)
    for (let z = Math.floor((box.k0 * v) / c) * c; z <= Math.ceil((box.k1 * v) / c) * c; z += c)
      if (heightAt(hf, x, z) <= top) return false;
  return true;
}
/** Voxels of margin for belowGround (slope-corrected distances are shorter than vertical ones). */
const BELOW_GROUND_VOXELS = 4;

const PB = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0, diggable: false };

/** Dynamic primitives (moved objects) whose bounds reach the sample box: ids and bounds. */
export function dynPrimsNear(sim: Sim, box: { i0: number; j0: number; k0: number; i1: number; j1: number; k1: number }): string {
  const v = sim.carve.voxel;
  let out = '';
  for (const prim of sim.state.worldDelta.dynPrims) {
    if (!sim.field.primBounds(prim.id, PB)) continue;
    if (PB.maxX < box.i0 * v || PB.minX > box.i1 * v || PB.maxY < box.j0 * v || PB.minY > box.j1 * v
      || PB.maxZ < box.k0 * v || PB.minZ > box.k1 * v) continue;
    out += `${prim.id}:${PB.minX},${PB.minY},${PB.minZ},${PB.maxX},${PB.maxY},${PB.maxZ};`;
  }
  return out;
}

/**
 * Fingerprint of the mound heights within r of (x, z) in plan view (piles are edited in place and read live by the
 * field, so no version counter sees every change): a weighted sum of the grid cells.
 */
function pileNear(sim: Sim, x: number, z: number, r: number): number {
  let f = 0;
  for (const m of sim.state.worldDelta.mounds) {
    const { x0, z0 } = moundOrigin(m);
    const i0 = Math.max(0, Math.floor((x - r - x0) / m.cell)), i1 = Math.min(m.n - 1, Math.ceil((x + r - x0) / m.cell));
    const k0 = Math.max(0, Math.floor((z - r - z0) / m.cell)), k1 = Math.min(m.n - 1, Math.ceil((z + r - z0) / m.cell));
    for (let iz = k0; iz <= k1; iz++) for (let ix = i0; ix <= i1; ix++) {
      const idx = iz * m.n + ix;
      f += m.h[idx] * (1 + ((idx * 2654435761) % 1013));
    }
  }
  return f;
}
