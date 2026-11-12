// Chamber registry (GDD 03 §6): stats of a voxel region, identity across re-detection, registration and removal,
// capacities, designation, point lookup. Identity uses only persisted data (center, radii, voxelCount), so a
// re-detection after a load gives the same ids as one without the load.

import type { Vec3 } from '@/core/math/vec3';
import type { Chamber, ChamberLoad, ChamberType, DesignatedBy, Nest, Sim, SpeciesId } from '@/sim/types';
import {
  CHAMBER_CAPACITY, CHAMBER_CHANGE_FRACTION, CHAMBER_KEEP_OVERLAP, CHAMBER_MIN_VOL, CHAMBER_POINT_PAD_BU,
  CHAMBER_SHRINK_FRACTION, CHAMBER_SPLIT_KEEP, DEPTH_SCAN_MAX_BU, DESIGNATABLE_TYPES,
} from '@/sim/balance/nest';
import { OPEN_MIN } from '../carve/keys';
import { refreshNestFields } from '../navFields';
import { packSample, sampleI, sampleJ, sampleK } from '../voxelKey';
import type { Region } from './detect';

export interface RegionStats {
  voxelCount: number;
  volume: number;
  floorArea: number;
  center: Vec3;
  radii: Vec3;
  depthBu: number;
  depthMm: number;
  roofMin: number;
  covered: boolean;
  seedVoxel: number;
}

const zeroLoad = (): ChamberLoad => ({ adults: 0, brood: 0, food: 0, other: 0 });

/**
 * Depth of p below the outside surface along +Y (cavities ignored, GDD 03 §0.1), mm, and whether the column
 * crosses a non-diggable primitive (cover) on the way up.
 */
export function depthAbove(sim: Sim, p: Vec3): { depthMm: number; covered: boolean } {
  const f = sim.field, v = sim.carve.voxel, max = DEPTH_SCAN_MAX_BU * sim.world.bu;
  let y = p.y, covered = false;
  for (let n = 0; n < 4096 && y - p.y < max; n++) {
    const s = f.substrateXYZ(p.x, y, p.z);
    if (s > 0) return { depthMm: Math.max(0, y - s - p.y), covered };
    if (f.hardXYZ(p.x, y, p.z) <= 0) covered = true;
    y += Math.max(0.25 * v, -s * 0.9);
  }
  return { depthMm: y - p.y, covered };
}

/** Soil above a ceiling sample up to the next free space (cavity or air), mm: first leave the own cavity. */
function roofAbove(sim: Sim, x: number, y0: number, z: number): number {
  const f = sim.field, v = sim.carve.voxel, max = DEPTH_SCAN_MAX_BU * sim.world.bu;
  let y = y0;
  while (y - y0 < 4 * v && f.sampleXYZ(x, y, z) > 0) y += 0.25 * v;
  const ceiling = y;
  while (y - y0 < max) {
    const s = f.sampleXYZ(x, y, z);
    if (s > 0) return Math.max(0, y - ceiling);
    y += Math.max(0.25 * v, -s * 0.9);
  }
  return max;
}

/** The cheap, voxel-only part of the stats (one pass over the keys) and the region's column tops. */
interface RegionShape {
  voxelCount: number; floor: number; center: Vec3; radii: Vec3; seedVoxel: number;
  /** column (packed i, 0, k) -> top j */
  tops: Map<number, number>;
}

function regionShape(sim: Sim, keys: readonly number[], core?: readonly number[]): RegionShape {
  const carve = sim.carve, v = carve.voxel;
  let sx = 0, sy = 0, sz = 0, floor = 0;
  let i0 = Infinity, i1 = -Infinity, j0 = Infinity, j1 = -Infinity, k0 = Infinity, k1 = -Infinity;
  const tops = new Map<number, number>();
  for (const key of keys) {
    const i = sampleI(key), j = sampleJ(key), k = sampleK(key);
    sx += i; sy += j; sz += k;
    if (carve.sampleAt(i, j - 1, k) < OPEN_MIN) floor++;
    if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j; if (k < k0) k0 = k; if (k > k1) k1 = k;
    const col = packSample(i, 0, k);
    if ((tops.get(col) ?? -Infinity) < j) tops.set(col, j);
  }
  const n = keys.length;
  const center = { x: (sx / n) * v, y: (sy / n) * v, z: (sz / n) * v };
  const radii = { x: ((i1 - i0) * v) / 2 + v / 2, y: ((j1 - j0) * v) / 2 + v / 2, z: ((k1 - k0) * v) / 2 + v / 2 };
  let seed = keys[0], best = Infinity;
  for (const key of core && core.length > 0 ? core : keys) {
    const d = (sampleI(key) * v - center.x) ** 2 + (sampleJ(key) * v - center.y) ** 2 + (sampleK(key) * v - center.z) ** 2;
    if (d < best) { best = d; seed = key; }
  }
  return { voxelCount: n, floor, center, radii, seedVoxel: seed, tops };
}

/** The field-marching part of the stats (depth, cover, thinnest roof): the expensive part. */
function regionMarch(sim: Sim, center: Vec3, tops: Map<number, number>): Pick<RegionStats, 'depthBu' | 'depthMm' | 'roofMin' | 'covered'> {
  const v = sim.carve.voxel, bu = sim.world.bu;
  const { depthMm, covered } = depthAbove(sim, center);
  let roof = Infinity, c = 0;
  for (const [col, j] of tops) {
    if (c++ % 2 === 1) continue; // every second column is enough for the thinnest roof
    roof = Math.min(roof, roofAbove(sim, sampleI(col) * v, j * v, sampleK(col) * v));
  }
  return { depthBu: depthMm / bu, depthMm, roofMin: Number.isFinite(roof) ? roof / bu : 0, covered };
}

function statsOf(sim: Sim, sh: RegionShape, march: Pick<RegionStats, 'depthBu' | 'depthMm' | 'roofMin' | 'covered'>): RegionStats {
  const unit = (sim.carve.voxel / sim.world.bu) ** 3;
  return {
    voxelCount: sh.voxelCount, volume: sh.voxelCount * unit, floorArea: sh.floor * (sim.carve.voxel / sim.world.bu) ** 2,
    center: sh.center, radii: sh.radii, seedVoxel: sh.seedVoxel, ...march,
  };
}

/** Stats of a region of open samples (ascending packed keys); `core` (optional) picks the seed voxel. */
export function regionStats(sim: Sim, keys: readonly number[], core?: readonly number[]): RegionStats {
  const sh = regionShape(sim, keys, core);
  return statsOf(sim, sh, regionMarch(sim, sh.center, sh.tops));
}

/**
 * Stats of a region a chamber keeps: when its voxels did not change shape (count, centroid, extent, seed voxel all
 * equal the chamber's persisted values) the chamber's depth / roof / cover are kept, otherwise marched again. The
 * kept values follow field changes over the room through refreshChamberMarch (microclimate cadence, GDD 03 §6.2:
 * these stats are "updated with microclimate"). Only persisted data decides, so a load changes nothing.
 */
function keptRegionStats(sim: Sim, c: Chamber, r: Region): RegionStats {
  const sh = regionShape(sim, r.keys, r.core);
  const same = sh.voxelCount === c.voxelCount && sh.seedVoxel === c.seedVoxel && sameVec(sh.center, c.center) && sameVec(sh.radii, c.radii);
  return statsOf(sim, sh, same ? { depthBu: c.depthBu, depthMm: c.depthMm, roofMin: c.roofMin, covered: c.covered } : regionMarch(sim, sh.center, sh.tops));
}

const sameVec = (a: Vec3, b: Vec3): boolean => a.x === b.x && a.y === b.y && a.z === b.z;

/** What a chamber's nav-field seeds depend on (centre and radii), as a comparable key. */
function fieldSeedOf(c: Chamber): string {
  return `${c.center.x},${c.center.y},${c.center.z},${c.radii.x},${c.radii.y},${c.radii.z}`;
}

/** Re-marches a chamber's depth, roof and cover from its own voxels (field changes: mounds, primitives). */
export function refreshChamberMarch(sim: Sim, c: Chamber): void {
  const keys = chamberSamples(sim, c);
  if (keys.length === 0) return;
  const m = regionMarch(sim, c.center, regionShape(sim, keys).tops);
  c.depthBu = m.depthBu; c.depthMm = m.depthMm; c.roofMin = m.roofMin; c.covered = m.covered;
}

export function capacityOf(type: ChamberType, volume: number): ChamberLoad {
  const c = CHAMBER_CAPACITY[type];
  return { adults: c.adults * volume, brood: c.brood * volume, food: c.food * volume, other: c.other * volume };
}

function applyStats(c: Chamber, s: RegionStats): void {
  c.voxelCount = s.voxelCount; c.volume = s.volume; c.floorArea = s.floorArea;
  c.center = s.center; c.radii = s.radii; c.depthBu = s.depthBu; c.depthMm = s.depthMm;
  c.roofMin = s.roofMin; c.covered = s.covered; c.seedVoxel = s.seedVoxel;
  c.capacity = capacityOf(c.type, c.volume);
}

/** Registers a chamber of `type` from region stats; emits `chamber-registered` and refreshes the nav fields. */
export function registerChamber(sim: Sim, nest: Nest, type: ChamberType, by: DesignatedBy, s: RegionStats): Chamber {
  const c: Chamber = {
    id: sim.state.nextId++, type, designatedBy: by, center: s.center, radii: s.radii, volume: 0, floorArea: 0,
    depthBu: 0, depthMm: 0, roofMin: 0, covered: false, seedVoxel: -1, voxelCount: 0, capacity: zeroLoad(),
    occupancy: zeroLoad(), temp: 20, humidity: 0.7, wetUntilTick: -1, flooded: 0, floodRisk: 0, flags: 0,
    createdTick: sim.state.tick,
  };
  applyStats(c, s);
  nest.chambers.push(c);
  refreshNestFields(sim, nest);
  sim.emit({ type: 'chamber-registered', chamberId: c.id, nestId: nest.id, chamberType: type, volume: c.volume });
  return c;
}

function removeChamber(sim: Sim, nest: Nest, c: Chamber, reason: string): void {
  nest.chambers = nest.chambers.filter((x) => x !== c);
  sim.emit({ type: 'chamber-removed', chamberId: c.id, reason });
}

/** Region samples inside the chamber's box (center +- radii + half a voxel). */
function overlap(sim: Sim, c: Chamber, r: Region, rb: SampleBounds): number {
  const v = sim.carve.voxel, pad = v / 2;
  const x0 = c.center.x - c.radii.x - pad, x1 = c.center.x + c.radii.x + pad;
  const y0 = c.center.y - c.radii.y - pad, y1 = c.center.y + c.radii.y + pad;
  const z0 = c.center.z - c.radii.z - pad, z1 = c.center.z + c.radii.z + pad;
  if (rb.i1 * v < x0 || rb.i0 * v > x1 || rb.j1 * v < y0 || rb.j0 * v > y1 || rb.k1 * v < z0 || rb.k0 * v > z1) return 0;
  let n = 0;
  for (const key of r.keys) {
    const x = sampleI(key) * v, y = sampleJ(key) * v, z = sampleK(key) * v;
    if (x >= x0 && x <= x1 && y >= y0 && y <= y1 && z >= z0 && z <= z1) n++;
  }
  return n;
}

interface SampleBounds { i0: number; i1: number; j0: number; j1: number; k0: number; k1: number }

function boundsOf(keys: readonly number[]): SampleBounds {
  const b = { i0: Infinity, i1: -Infinity, j0: Infinity, j1: -Infinity, k0: Infinity, k1: -Infinity };
  for (const key of keys) {
    const i = sampleI(key), j = sampleJ(key), k = sampleK(key);
    if (i < b.i0) b.i0 = i; if (i > b.i1) b.i1 = i; if (j < b.j0) b.j0 = j; if (j > b.j1) b.j1 = j; if (k < b.k0) b.k0 = k; if (k > b.k1) b.k1 = k;
  }
  return b;
}

/** Open samples inside a chamber's ellipsoid (+ half a voxel): the region of a chamber no detection region matches. */
export function chamberSamples(sim: Sim, c: Chamber): number[] {
  const v = sim.carve.voxel, pad = v / 2, out: number[] = [];
  const rx = c.radii.x + pad, ry = c.radii.y + pad, rz = c.radii.z + pad;
  for (let k = Math.floor((c.center.z - rz) / v); k <= Math.ceil((c.center.z + rz) / v); k++)
    for (let j = Math.floor((c.center.y - ry) / v); j <= Math.ceil((c.center.y + ry) / v); j++)
      for (let i = Math.floor((c.center.x - rx) / v); i <= Math.ceil((c.center.x + rx) / v); i++) {
        const q = ((i * v - c.center.x) / rx) ** 2 + ((j * v - c.center.y) / ry) ** 2 + ((k * v - c.center.z) / rz) ** 2;
        if (q <= 1 && sim.carve.sampleAt(i, j, k) >= OPEN_MIN) out.push(packSample(i, j, k));
      }
  return out.sort((a, b) => a - b);
}

/**
 * Applies a detection pass (GDD 03 §6.2 identity rules): a region holding >= 50 % of a chamber's voxels keeps its
 * id and type (a split keeps it in its largest part); a region claimed by several chambers keeps the largest
 * (the others are removed, `merged`); unclaimed regions register as `general`; chambers without a region keep
 * their own voxels and are removed (`shrunk`) below half their type minimum.
 */
export function applyDetection(sim: Sim, nest: Nest, regions: Region[], reserved: (r: Region) => boolean = () => false): void {
  const claims = new Map<number, Chamber[]>();
  const chambers = [...nest.chambers].sort((a, b) => a.id - b.id);
  const unmatched: Chamber[] = [];
  const bounds = regions.map((r) => boundsOf(r.keys));
  for (const c of chambers) {
    let bestR = -1, bestN = 0;
    for (let r = 0; r < regions.length; r++) {
      const n = overlap(sim, c, regions[r], bounds[r]);
      if (n > bestN) { bestN = n; bestR = r; }
    }
    const need = Math.max(1, c.voxelCount);
    if (bestR >= 0 && (bestN >= CHAMBER_KEEP_OVERLAP * need || bestN >= CHAMBER_SPLIT_KEEP * need)) {
      const list = claims.get(bestR) ?? [];
      list.push(c);
      claims.set(bestR, list);
    } else unmatched.push(c);
  }
  let changed = false;
  for (let r = 0; r < regions.length; r++) {
    const list = claims.get(r);
    if (!list) {
      // a room an active chamber plan is digging registers when the plan completes (with its type)
      if (!reserved(regions[r])) registerChamber(sim, nest, 'general', 'auto', regionStats(sim, regions[r].keys, regions[r].core));
      continue;
    }
    list.sort((a, b) => b.voxelCount - a.voxelCount || a.id - b.id);
    const keep = list[0];
    const s = keptRegionStats(sim, keep, regions[r]);
    for (let n = 1; n < list.length; n++) { removeChamber(sim, nest, list[n], 'merged'); changed = true; }
    const before = keep.volume, seedBefore = fieldSeedOf(keep);
    applyStats(keep, s);
    if (Math.abs(keep.volume - before) >= CHAMBER_CHANGE_FRACTION * Math.max(before, 1e-9)) {
      sim.emit({ type: 'chamber-changed', chamberId: keep.id, chamberType: keep.type, volume: keep.volume, reason: 'detected' });
      changed = true;
    }
    // the chamber's nav field is seeded from its centre and radii (services.registerNestTargets): any change of
    // those must re-seed it, or the field stays on the old seeds until the next big change (and a load, which
    // seeds from the record, disagrees with the running game)
    if (fieldSeedOf(keep) !== seedBefore) changed = true;
  }
  for (const c of unmatched) {
    const keys = chamberSamples(sim, c);
    if (keys.length * (sim.carve.voxel / sim.world.bu) ** 3 < CHAMBER_SHRINK_FRACTION * CHAMBER_MIN_VOL[c.type]) {
      removeChamber(sim, nest, c, 'shrunk');
      changed = true;
      continue;
    }
    // Without a detected region the chamber keeps its record and only ever shrinks (fill, collapse). Re-deriving it
    // from its padded ellipsoid on every pass made it creep along adjacent tunnels (a founding cell under its shaft
    // grew by a few voxels per pass), so detection was not idempotent and a load re-detected it differently.
    if (keys.length >= c.voxelCount) continue;
    const before = c.volume, seedBefore = fieldSeedOf(c);
    applyStats(c, keptRegionStats(sim, c, { keys, core: [] }));
    if (fieldSeedOf(c) !== seedBefore) changed = true;
    if (Math.abs(c.volume - before) >= CHAMBER_CHANGE_FRACTION * Math.max(before, 1e-9)) {
      sim.emit({ type: 'chamber-changed', chamberId: c.id, chamberType: c.type, volume: c.volume, reason: 'detected' });
      changed = true;
    }
  }
  if (changed) refreshNestFields(sim, nest);
}

/** The chamber and its nest by chamber id, or null. */
export function chamberById(sim: Sim, id: number): { nest: Nest; c: Chamber } | null {
  for (const nest of sim.stores.nests.list) {
    if (!nest.alive) continue;
    for (const c of nest.chambers) if (c.id === id) return { nest, c };
  }
  return null;
}

/** Normalised ellipsoid distance of p to a chamber (radii + pad); <= 1 is inside. */
function chamberQ(c: Chamber, p: Vec3, pad: number): number {
  return ((p.x - c.center.x) / (c.radii.x + pad)) ** 2 + ((p.y - c.center.y) / (c.radii.y + pad)) ** 2
    + ((p.z - c.center.z) / (c.radii.z + pad)) ** 2;
}

/** Chamber of `nest` containing p (deepest inside its ellipsoid; ties: lower id), or null. */
export function chamberAtIn(sim: Sim, nest: Nest, p: Vec3): Chamber | null {
  const pad = CHAMBER_POINT_PAD_BU * sim.world.bu;
  let best: Chamber | null = null, bestQ = 1;
  for (const c of nest.chambers) {
    const q = chamberQ(c, p, pad);
    if (q <= bestQ && (q < bestQ || !best || c.id < best.id)) { bestQ = q; best = c; }
  }
  return best;
}

export function findChamberAtImpl(sim: Sim, p: Vec3): Chamber | null {
  let best: Chamber | null = null, bestQ = Infinity;
  const pad = CHAMBER_POINT_PAD_BU * sim.world.bu;
  for (const nest of sim.stores.nests.list) {
    if (!nest.alive) continue;
    const c = chamberAtIn(sim, nest, p);
    if (!c) continue;
    const q = chamberQ(c, p, pad);
    if (q < bestQ) { bestQ = q; best = c; }
  }
  return best;
}

/**
 * Designation (GDD 03 §6.5): refused when the type is not designatable for the species, the volume is below the
 * type minimum, or the chamber is the sealed founding cell. One royal per nest: the old one turns general.
 */
export function designateChamberImpl(sim: Sim, chamberId: number, type: ChamberType, by: DesignatedBy): boolean {
  const found = chamberById(sim, chamberId);
  if (!found) return false;
  const { nest, c } = found;
  const species = (sim.stores.colonies.get(nest.colony)?.species ?? sim.species.id) as SpeciesId;
  const allowed = DESIGNATABLE_TYPES[species] ?? DESIGNATABLE_TYPES['lasius-niger'];
  if (!allowed.includes(type) || c.volume < CHAMBER_MIN_VOL[type]) return false;
  if (c.type === 'founding' && nest.founding && nest.founding.state === 'sealed') return false;
  if (by === 'auto' && c.designatedBy === 'player' && c.type !== 'founding') return false;
  if (type === 'royal') {
    for (const o of nest.chambers) {
      if (o === c || o.type !== 'royal') continue;
      o.type = 'general';
      o.capacity = capacityOf(o.type, o.volume);
      sim.emit({ type: 'chamber-designated', chamberId: o.id, chamberType: o.type });
    }
  }
  c.type = type;
  c.designatedBy = by;
  c.capacity = capacityOf(type, c.volume);
  sim.emit({ type: 'chamber-designated', chamberId: c.id, chamberType: type });
  return true;
}

/**
 * Registration route 1 (GDD 03 §6.1, plan completion): the chamber already detected in the room (if any) takes the
 * plan's type and the room's stats; otherwise a new chamber registers.
 */
export function registerPlannedChamber(sim: Sim, nest: Nest, type: ChamberType, by: DesignatedBy, s: RegionStats): Chamber {
  const existing = chamberAtIn(sim, nest, s.center);
  if (!existing) return registerChamber(sim, nest, type, by, s);
  existing.type = type;
  existing.designatedBy = by;
  applyStats(existing, s);
  refreshNestFields(sim, nest);
  sim.emit({ type: 'chamber-designated', chamberId: existing.id, chamberType: type });
  return existing;
}
