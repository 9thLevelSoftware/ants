// Founding readiness and the founding cell (GDD 03 §13.1 readiness, §6.1 registration route 2). Pure reads of the
// carve grid in fixed scan orders. The founding module owns the founding state machine; this file measures the
// cavity and, while the nest is founding, registers the cell as a `founding` chamber once the geometry is met
// (or re-types the room that general detection already found there).

import type { Vec3 } from '@/core/math/vec3';
import type { Chamber, Nest, Sim } from '@/sim/types';
import { THROAT_BU } from '@/sim/balance/nest';
import { OPEN_FRACTION, OPEN_MIN } from '../carve/keys';
import { packSample, sampleI, sampleJ, sampleK } from '../voxelKey';
import { nestSampleBox } from './detect';
import { capacityOf, chamberAtIn, depthAbove, regionStats, registerChamber, roofAbove } from './registry';

/** Founding geometry of a species (GDD 03 §13.1; SpeciesDef.founding), BU / BU^3. */
interface FoundingGeometry { dMinOpen: number; dMinCover: number; vMin: number; wMin: number }

/** Soil roof the founding cell needs unless it is covered, BU (GDD 03 §13.1 "roof ok"). */
const READY_ROOF_MIN_BU = 2;
/** Deep voxels: depth >= D_MIN - this, BU (GDD 03 §13.1 V_deep). */
const DEEP_MARGIN_BU = 2;
/** At most this many entrances (GDD 03 §13.1 "openings <= 2"). */
const MAX_OPENINGS = 2;

export interface FoundingReadiness {
  /** R of GDD 03 §13.1, 0..1. */
  readiness: number;
  ready: boolean;
  /** Deepest open sample of the founding cavity below the surface, BU. */
  dMaxBu: number;
  /** D_MIN used (open soil or cover), BU. */
  dMinBu: number;
  /** Open volume at depth >= D_MIN - 2, BU^3. */
  vDeepBu3: number;
  widthOk: boolean;
  roofOk: boolean;
  covered: boolean;
  openings: number;
  /** Deep open samples (packed keys, ascending): the cell region. */
  deepKeys: number[];
  /** Deep sample with the widest in-layer support (the cell centre), or null. */
  widest: Vec3 | null;
}

function geometryOf(sim: Sim, nest: Nest): FoundingGeometry | null {
  const col = sim.stores.colonies.get(nest.colony);
  const f = (col ? sim.getSpecies(col.species) : sim.species)?.opening;
  return f ? { dMinOpen: f.dMinOpenBu, dMinCover: f.dMinCoverBu, vMin: f.vMinBu3, wMin: f.wMinBu } : null;
}

/** Seeds of the nest's cavity: entrance throats, the founding cavity seed, chamber centres (fixed order). */
function seedsOf(sim: Sim, nest: Nest): Vec3[] {
  const bu = sim.world.bu, out: Vec3[] = [];
  for (const e of nest.entrances) {
    for (let d = 0; d <= THROAT_BU; d += 0.5) out.push({ x: e.pos.x - e.dir.x * d * bu, y: e.pos.y - e.dir.y * d * bu, z: e.pos.z - e.dir.z * d * bu });
  }
  if (nest.founding) out.push(nest.founding.cavitySeed);
  for (const c of nest.chambers) out.push(c.center);
  return out;
}

/** Open samples of the nest's cavity (26-connected from its seeds, inside its sample box), ascending keys. */
export function cavitySamples(sim: Sim, nest: Nest): number[] {
  const carve = sim.carve, v = carve.voxel, b = nestSampleBox(sim, nest);
  const seen = new Set<number>(), list: number[] = [];
  const push = (i: number, j: number, k: number): void => {
    if (i < b.i0 || i > b.i1 || j < b.j0 || j > b.j1 || k < b.k0 || k > b.k1) return;
    const key = packSample(i, j, k);
    if (seen.has(key) || carve.sampleAt(i, j, k) < OPEN_MIN) return;
    seen.add(key);
    list.push(key);
  };
  for (const p of seedsOf(sim, nest)) {
    const ci = Math.round(p.x / v), cj = Math.round(p.y / v), ck = Math.round(p.z / v);
    for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) push(ci + di, cj + dj, ck + dk);
  }
  for (let q = 0; q < list.length; q++) {
    const i = sampleI(list[q]), j = sampleJ(list[q]), k = sampleK(list[q]);
    for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) push(i + di, j + dj, k + dk);
  }
  return list.sort((a, b) => a - b);
}

/** In-layer disk offsets (voxels) with 0 < d <= R. */
function disk(R: number): number[] {
  const out: number[] = [], m = Math.ceil(R);
  for (let dk = -m; dk <= m; dk++) for (let di = -m; di <= m; di++) {
    const d2 = di * di + dk * dk;
    if (d2 > 0 && d2 <= R * R + 1e-9) out.push(di, dk);
  }
  return out;
}

/** Founding readiness of a nest's cavity (GDD 03 §13.1), or null without founding geometry for its species. */
export function foundingReadiness(sim: Sim, nest: Nest): FoundingReadiness | null {
  const g = geometryOf(sim, nest);
  if (!g) return null;
  const carve = sim.carve, v = carve.voxel, bu = sim.world.bu;
  const all = cavitySamples(sim, nest);
  const depthOf = (key: number) => sim.field.height(sampleI(key) * v, sampleK(key) * v) - sampleJ(key) * v;
  let dMax = 0;
  for (const key of all) {
    const x = sampleI(key) * v, y = sampleJ(key) * v, z = sampleK(key) * v;
    if (sim.field.substrateXYZ(x, y, z) >= 0) continue; // open air above the ground
    dMax = Math.max(dMax, depthOf(key));
  }
  // the widest sample decides cover (D_MIN under cover) and the roof
  const half = disk((g.wMin / 2) * bu / v);
  const wide = (key: number): boolean => {
    const i = sampleI(key), j = sampleJ(key), k = sampleK(key);
    for (let n = 0; n < half.length; n += 2) if (carve.sampleAt(i + half[n], j, k + half[n + 1]) < OPEN_MIN) return false;
    return true;
  };
  let widest: Vec3 | null = null;
  for (const key of all) {
    const p = { x: sampleI(key) * v, y: sampleJ(key) * v, z: sampleK(key) * v };
    if (sim.field.substrateXYZ(p.x, p.y, p.z) >= 0 || !wide(key)) continue;
    if (!widest || p.y < widest.y) widest = p; // the deepest wide sample
  }
  const covered = widest ? depthAbove(sim, widest).covered : false;
  const dMin = covered ? g.dMinCover : g.dMinOpen;
  const deepKeys: number[] = [];
  let vDeep = 0, widthOk = false;
  for (const key of all) {
    if (depthOf(key) < (dMin - DEEP_MARGIN_BU) * bu || sim.field.substrateXYZ(sampleI(key) * v, sampleJ(key) * v, sampleK(key) * v) >= 0) continue;
    deepKeys.push(key);
    vDeep += OPEN_FRACTION[carve.sampleAt(sampleI(key), sampleJ(key), sampleK(key))];
    if (!widthOk && wide(key)) widthOk = true;
  }
  vDeep *= (v / bu) ** 3;
  const roofOk = covered || (widest !== null && roofAbove(sim, widest.x, widest.y, widest.z) >= READY_ROOF_MIN_BU * bu);
  const openings = nest.entrances.length;
  const dBu = dMax / bu;
  const readiness = 0.4 * Math.min(1, dBu / dMin) + 0.6 * Math.min(1, vDeep / g.vMin) * (widthOk ? 1 : 0.8);
  const ready = dBu >= dMin && vDeep >= g.vMin && widthOk && roofOk && openings <= MAX_OPENINGS;
  return { readiness, ready, dMaxBu: dBu, dMinBu: dMin, vDeepBu3: vDeep, widthOk, roofOk, covered, openings, deepKeys, widest };
}

/**
 * The founding cell rule (GDD 03 §6.1 route 2, §13.2 `ready`): while the nest is founding and has no founding or
 * royal chamber, measures readiness (kept in nest.founding.readiness) and, once the geometry is ready, makes the
 * room at the widest deep sample a `founding` chamber: the auto-registered chamber already there is re-typed,
 * else the deep samples register as the cell. Returns the founding chamber, or null.
 */
export function applyFoundingCell(sim: Sim, nest: Nest): Chamber | null {
  const f = nest.founding;
  if (!f || nest.chambers.some((c) => c.type === 'founding' || c.type === 'royal')) return null;
  const r = foundingReadiness(sim, nest);
  if (!r) return null;
  f.readiness = r.readiness;
  if (!r.ready || !r.widest || r.deepKeys.length === 0) return null;
  const there = chamberAtIn(sim, nest, r.widest);
  if (there && there.designatedBy === 'auto') {
    there.type = 'founding';
    there.capacity = capacityOf('founding', there.volume);
    sim.emit({ type: 'chamber-designated', chamberId: there.id, chamberType: 'founding' });
    return there;
  }
  if (there) return null; // the player designated that room: leave it
  return registerChamber(sim, nest, 'founding', 'auto', regionStats(sim, r.deepKeys));
}
