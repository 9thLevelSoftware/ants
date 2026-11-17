// Founding readiness and the founding cell (GDD 03 §13.1 readiness, §6.1 registration route 2). Pure reads of the
// carve grid in fixed scan orders. The founding module owns the founding state machine; this file measures the
// cavity and, while the nest is founding, registers the cell as a `founding` chamber once the geometry is met
// (or re-types the room that general detection already found there).

import type { Vec3 } from '@/core/math/vec3';
import type { Chamber, Entrance, Nest, Sim } from '@/sim/types';
import {
  DEPTH_SCAN_MAX_BU, FOUNDING_CELL_STATES, FOUNDING_DEEP_MARGIN_BU, FOUNDING_MAX_OPENINGS, FOUNDING_ROOF_MIN_BU, THROAT_BU,
} from '@/sim/balance/nest';
import { OPEN_FRACTION, OPEN_MIN } from '../carve/keys';
import { packSample, sampleI, sampleJ, sampleK } from '../voxelKey';
import { nestSampleBox } from './detect';
import { capacityOf, chamberAtIn, depthAbove, nestDepthRule, regionStats, registerChamber, roofAbove } from './registry';

/** Founding geometry of a species (GDD 03 §13.1; SpeciesDef.founding), BU / BU^3. */
interface FoundingGeometry { dMinOpen: number; dMinCover: number; vMin: number; wMin: number }

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
  /** Entrances whose throat opens into the founding cavity (not every entrance of the nest record). */
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

/** Throat seed points of an entrance: from the opening inward along -dir to THROAT_BU, every 0.5 BU. */
function throatSeeds(sim: Sim, e: Entrance): Vec3[] {
  const bu = sim.world.bu, out: Vec3[] = [];
  for (let d = 0; d <= THROAT_BU; d += 0.5) out.push({ x: e.pos.x - e.dir.x * d * bu, y: e.pos.y - e.dir.y * d * bu, z: e.pos.z - e.dir.z * d * bu });
  return out;
}

/** Seed points of the nest's cavity in fixed order: entrance throats, the founding cavity seed, chamber centres. */
function seedsOf(sim: Sim, nest: Nest): Vec3[] {
  const out: Vec3[] = [];
  for (const e of nest.entrances) out.push(...throatSeeds(sim, e));
  if (nest.founding) out.push(nest.founding.cavitySeed);
  for (const c of nest.chambers) out.push(c.center);
  return out;
}

type SampleBox = ReturnType<typeof nestSampleBox>;

/** Open sample keys in the 3 x 3 x 3 neighbourhood of a point (inside the box), in fixed order. */
function startKeys(sim: Sim, p: Vec3, b: SampleBox): number[] {
  const carve = sim.carve, v = carve.voxel, out: number[] = [];
  const ci = Math.round(p.x / v), cj = Math.round(p.y / v), ck = Math.round(p.z / v);
  for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const i = ci + di, j = cj + dj, k = ck + dk;
    if (i < b.i0 || i > b.i1 || j < b.j0 || j > b.j1 || k < b.k0 || k > b.k1) continue;
    if (carve.sampleAt(i, j, k) >= OPEN_MIN) out.push(packSample(i, j, k));
  }
  return out;
}

/** The nest's cavity split into 26-connected components (inside its sample box), with each sample's component. */
interface CavityParts { parts: number[][]; partOf: Map<number, number> }

function cavityParts(sim: Sim, nest: Nest, b: SampleBox): CavityParts {
  const carve = sim.carve;
  const partOf = new Map<number, number>(), parts: number[][] = [];
  for (const p of seedsOf(sim, nest)) {
    for (const start of startKeys(sim, p, b)) {
      if (partOf.has(start)) continue;
      const id = parts.length, list = [start];
      partOf.set(start, id);
      for (let q = 0; q < list.length; q++) {
        const i = sampleI(list[q]), j = sampleJ(list[q]), k = sampleK(list[q]);
        for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const ni = i + di, nj = j + dj, nk = k + dk;
          if (ni < b.i0 || ni > b.i1 || nj < b.j0 || nj > b.j1 || nk < b.k0 || nk > b.k1) continue;
          const key = packSample(ni, nj, nk);
          if (partOf.has(key) || carve.sampleAt(ni, nj, nk) < OPEN_MIN) continue;
          partOf.set(key, id);
          list.push(key);
        }
      }
      parts.push(list.sort((x, y) => x - y));
    }
  }
  return { parts, partOf };
}

/** Open samples of the nest's cavity (26-connected from its seeds, inside its sample box), ascending keys. */
export function cavitySamples(sim: Sim, nest: Nest): number[] {
  return cavityParts(sim, nest, nestSampleBox(sim, nest)).parts.flat().sort((a, b) => a - b);
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

/**
 * Founding readiness of a nest's cavity (GDD 03 §13.1), or null without founding geometry for its species. The
 * founding cavity is the connected part of the nest's cavity that scores best (ready first, then R): trial pits
 * the queen dug and left elsewhere in her footprint (§13.4) are separate parts, and only the entrances whose
 * throat opens into the founding cavity count as its openings.
 */
export function foundingReadiness(sim: Sim, nest: Nest): FoundingReadiness | null {
  const g = geometryOf(sim, nest);
  if (!g) return null;
  const b = nestSampleBox(sim, nest);
  const { parts, partOf } = cavityParts(sim, nest, b);
  const openings = new Array<number>(parts.length).fill(0);
  for (const e of nest.entrances) {
    const touched = new Set<number>();
    for (const p of throatSeeds(sim, e)) for (const key of startKeys(sim, p, b)) touched.add(partOf.get(key)!);
    for (const id of touched) openings[id]++;
  }
  let best: FoundingReadiness | null = null;
  for (let id = 0; id < parts.length; id++) {
    const r = measure(sim, g, parts[id], openings[id], nest);
    if (!best || (r.ready && !best.ready) || (r.ready === best.ready && r.readiness > best.readiness)) best = r;
  }
  return best ?? measure(sim, g, [], 0, nest);
}

/** Soil roof over the open column through (x, y, z): from the top of that open run to the next free space, mm. */
function roofOver(sim: Sim, x: number, y0: number, z: number): number {
  const step = 0.25 * sim.carve.voxel, top = Math.min(y0 + DEPTH_SCAN_MAX_BU * sim.world.bu, sim.field.height(x, z));
  let y = y0;
  while (y < top && sim.field.sampleXYZ(x, y, z) > 0) y += step;
  return y >= top ? 0 : roofAbove(sim, x, y, z); // the column is open to the surface (under the shaft)
}

/** Readiness of one connected cavity (ascending sample keys) with `openings` entrances into it. */
function measure(sim: Sim, g: FoundingGeometry, all: readonly number[], openings: number, nest: Nest): FoundingReadiness {
  const carve = sim.carve, v = carve.voxel, bu = sim.world.bu;
  const rule = nestDepthRule.depthMm;
  const depthOf = (key: number) => (rule ? rule(sim, nest, sampleI(key) * v, sampleJ(key) * v, sampleK(key) * v) : null)
    ?? sim.field.height(sampleI(key) * v, sampleK(key) * v) - sampleJ(key) * v;
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
  const deepKeys: number[] = [], wideDeep: number[] = [];
  let vDeep = 0;
  for (const key of all) {
    if (depthOf(key) < (dMin - FOUNDING_DEEP_MARGIN_BU) * bu || sim.field.substrateXYZ(sampleI(key) * v, sampleJ(key) * v, sampleK(key) * v) >= 0) continue;
    deepKeys.push(key);
    vDeep += OPEN_FRACTION[carve.sampleAt(sampleI(key), sampleJ(key), sampleK(key))];
    if (wide(key)) wideDeep.push(key);
  }
  vDeep *= (v / bu) ** 3;
  const widthOk = wideDeep.length > 0;
  // the cell's roof: soil above the cavity over some wide deep sample (not under the shaft, whose column is open)
  const roofMin = FOUNDING_ROOF_MIN_BU * bu;
  const roofOk = covered || wideDeep.some((key) => roofOver(sim, sampleI(key) * v, sampleJ(key) * v, sampleK(key) * v) >= roofMin);
  const dBu = dMax / bu;
  const readiness = 0.4 * Math.min(1, dBu / dMin) + 0.6 * Math.min(1, vDeep / g.vMin) * (widthOk ? 1 : 0.8);
  const ready = dBu >= dMin && vDeep >= g.vMin && widthOk && roofOk && openings <= FOUNDING_MAX_OPENINGS;
  return { readiness, ready, dMaxBu: dBu, dMinBu: dMin, vDeepBu3: vDeep, widthOk, roofOk, covered, openings, deepKeys, widest };
}

/**
 * The founding cell rule (GDD 03 §6.1 route 2, §13.2 `ready`): while the nest is founding (FOUNDING_CELL_STATES:
 * never once sealed or established) and has no founding or royal chamber, measures readiness (kept in nest.founding.readiness) and, once the geometry is ready, makes the
 * room at the widest deep sample a `founding` chamber: the auto-registered chamber already there is re-typed,
 * else the deep samples register as the cell. Returns the founding chamber, or null.
 */
export function applyFoundingCell(sim: Sim, nest: Nest): Chamber | null {
  const f = nest.founding;
  if (!f || !FOUNDING_CELL_STATES.includes(f.state)) return null;
  if (nest.chambers.some((c) => c.type === 'founding' || c.type === 'royal')) return null;
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
