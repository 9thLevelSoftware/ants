// Soil pellets and frass (GDD 03 §1.3): creation, dropping (clutter, spoil piles, surface pellets, water),
// settling into mounds and heaps at mound batches, tamping of untouched clutter, founding expulsion, clutter
// queries for locomotion.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Entrance, Item, MaterialId, Mound, Nest, PelletDumpTarget, Sim } from '@/sim/types';
import { VoxelFlag } from '@/sim/types';
import {
  BULKING, CHOKE_COUNT, CHOKE_LEN_BU, CLUTTER_RADIUS_BU, CLUTTER_SLOW_MIN, CLUTTER_SLOW_PER, HEAP_CAP,
  HEAP_MERGE_DIST_BU, MAX_LOOSE_PELLETS_PER_NEST, MOUND_BATCH_TICKS, MOUND_CELL_BU, MOUND_GRID_N, PELLET_BULK_PER_BU3, PELLET_SETTLE_S,
  PELLET_TAMP_S, SPOIL_JOIN_BU, TAMP_RADIUS_BU, TAMP_RADIUS_FALLBACK_BU, TAMP_SPHERE_BU, TAMP_ROUNDS,
} from '@/sim/balance/nest';
import { removeItem, spawnItem } from '@/sim/entities';
import { TICKS_PER_SECOND } from '@/sim/time';
import { OPEN_FRACTION, OPEN_MIN } from './carve/keys';
import { fillSphere, forChangedSamples, readBox, sphereBox } from './carveOps';
import { findChamberAtImpl } from './chambers/registry';
import { createMound, deposit, dumpPoint, moundById, moundContains, publishMound, relax } from './mounds';
import { nestRuntime } from './runtime';

const FRASS_MATERIALS: readonly string[] = ['wood-sound', 'wood-decayed', 'insulation'];

export function isPellet(it: Item): boolean {
  return it.kind === 'soil-pellet' || it.kind === 'frass';
}

/** The nest a pellet belongs to: its own, else its colony's first nest. */
function pelletNest(sim: Sim, it: Item): Nest | undefined {
  const own = sim.stores.nests.get(it.nestId);
  if (own) return own;
  const col = sim.stores.colonies.get(it.colony);
  return col ? sim.stores.nests.get(col.nestIds[0] ?? -1) : undefined;
}

/** A pellet item (frass for wood and insulation) lying at pos; emits `pellet-created`. */
export function spawnPellet(sim: Sim, pos: Vec3, volume: number, material: MaterialId, nestId: number, colony: number, antId: number): Item {
  const kind = FRASS_MATERIALS.includes(material) ? 'frass' : 'soil-pellet';
  const it = spawnItem(sim, {
    kind, pos,
    init: { volume, material, bulk: PELLET_BULK_PER_BU3 * volume, nestId, colony, inNest: isInCavity(sim, pos) },
  });
  sim.emit({ type: 'pellet-created', antId, itemId: it.id, volume, material, pos: { x: pos.x, y: pos.y, z: pos.z } });
  return it;
}

/** In carved space inside the substrate (just above p, so a point on a tunnel floor counts). */
export function isInCavity(sim: Sim, p: Vec3): boolean {
  return sim.field.substrateXYZ(p.x, p.y + 0.5 * sim.carve.voxel, p.z) < 0;
}

function inWater(sim: Sim, p: Vec3): boolean {
  for (const w of sim.world.waterBodies) {
    const lvl = sim.state.worldDelta.waterLevels[w.id] ?? w.levelMm;
    if (Math.hypot(p.x - w.pos.x, p.z - w.pos.z) <= w.radius && p.y < w.pos.y + lvl) return true;
  }
  return false;
}

/**
 * Drops a carried pellet at p (GDD 03 §1.3). In water it is removed ('water'). Otherwise it is placed as a lying
 * item: in a cavity as clutter, or on a plan's spoil pile within SPOIL_JOIN of its spoil point; outside as a
 * surface pellet that settles into a mound later. Returns the target when the pellet was absorbed at once, null
 * when it lies where it was put (the caller must not place it again: it is no longer carried).
 */
export function dumpPelletImpl(sim: Sim, ant: Ant, itemId: number, p: Vec3): PelletDumpTarget | null {
  const it = sim.stores.items.get(itemId);
  if (!it || !isPellet(it)) return null;
  if (inWater(sim, p)) {
    removeItem(sim, it.id, 'water');
    sim.emit({ type: 'pellet-dumped', itemId: it.id, into: 'water' });
    return 'water';
  }
  it.carrierIds = it.carrierIds.filter((id) => id !== ant.id);
  if (ant.carry.kind === 'item' && ant.carry.id === it.id) ant.carry = { kind: 'none', id: -1 };
  placePellet(sim, it, p);
  return null;
}

/** Lays a pellet at p and classifies it (clutter, spoil pile, surface). */
export function placePellet(sim: Sim, it: Item, p: Vec3): void {
  it.pos = { x: p.x, y: p.y, z: p.z };
  it.droppedTick = sim.state.tick;
  it.reservedBy = -1;
  it.inNest = isInCavity(sim, p);
  it.spoilPlanId = -1;
  const ch = it.inNest ? findChamberAtImpl(sim, p) : null;
  it.chamberId = ch ? ch.id : -1;
  const nest = pelletNest(sim, it);
  if (!nest || !it.inNest) return;
  it.nestId = nest.id;
  const join = SPOIL_JOIN_BU * sim.world.bu;
  for (const plan of nest.digPlans) {
    if (plan.status !== 'active' && plan.status !== 'queued' && plan.status !== 'stalled') continue;
    const s = plan.spoilPoint;
    if (Math.hypot(s.x - p.x, s.y - p.y, s.z - p.z) <= join) { it.spoilPlanId = plan.id; break; }
  }
  enforceLooseCap(sim, nest);
}

/** Lying pellets of a nest inside its cavity (clutter and spoil piles), in item order. */
export function loosePellets(sim: Sim, nestId: number): Item[] {
  const out: Item[] = [];
  for (const it of sim.stores.items.list) {
    if (it.alive && isPellet(it) && it.inNest && it.nestId === nestId && it.carrierIds.length === 0) out.push(it);
  }
  return out;
}

function enforceLooseCap(sim: Sim, nest: Nest): void {
  const loose = loosePellets(sim, nest.id);
  if (loose.length <= MAX_LOOSE_PELLETS_PER_NEST) return;
  let oldest: Item | null = null;
  for (const it of loose) if (it.spoilPlanId < 0 && (!oldest || it.droppedTick < oldest.droppedTick)) oldest = it;
  if (oldest) tampPellet(sim, oldest);
}

// ---- tamping (GDD 03 §1.3) ----

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

/**
 * Presses a pellet's volume into the floor under it (GDD 03 §1.3): the floor voxels near it (open, with a
 * non-open voxel directly below) within TAMP_RADIUS of it, TAMP_RADIUS_FALLBACK when that is not enough,
 * lose openness evenly until the pellet volume is used, and are flagged LOOSE. The floor rises; standing ants are
 * re-projected by the fill (carveOps.afterBrush).
 */
export function tampPellet(sim: Sim, it: Item): void {
  raiseFloor(sim, it.pos, it.volume * sim.world.bu ** 3);
  removeItem(sim, it.id, 'tamp');
  sim.emit({ type: 'pellet-dumped', itemId: it.id, into: 'tamp' });
}

/**
 * Floor samples around p: open, inside the substrate, with a non-open sample below, within `radius` of p (fixed
 * scan order).
 */
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
 * Closes `target` mm^3 of floor around p: one small fill sphere (radius TAMP_SPHERE) under each floor sample, all
 * lowered by one depth fitted on a dry run, so the floor rises evenly; topped up over a few rounds (each round
 * finds the risen floor). Lowering instead of shrinking the spheres keeps the fill a continuous function of the
 * fit (the brush's openness ramp makes even a zero-radius sphere close its centre sample). Returns mm^3 closed.
 */
function raiseFloor(sim: Sim, p: Vec3, target: number): number {
  const flags = nestRuntime(sim).flags, bu = sim.world.bu, r = TAMP_SPHERE_BU * bu;
  const sMax = r + sim.carve.ramp / 2; // spheres lowered this far no longer reach their floor sample
  const lowered = (floor: readonly Vec3[], s: number) => floor.map((c) => ({ x: c.x, y: c.y - s, z: c.z }));
  let closed = 0;
  for (let round = 0; round < TAMP_ROUNDS && target - closed > target * 0.002; round++) {
    const want = target - closed;
    let floor = floorSamples(sim, p, TAMP_RADIUS_BU * bu);
    if (floor.length === 0 || dryFillVolume(sim, floor, r) < want) floor = floorSamples(sim, p, TAMP_RADIUS_FALLBACK_BU * bu);
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

// ---- settling into mounds and heaps (GDD 03 §1.4) ----

function sameClass(m: Mound, it: Item): boolean {
  return (m.material === 'frass') === (it.kind === 'frass');
}

/**
 * Surface pellets older than PELLET_SETTLE_S join a pile: the nest's mound or heap whose grid contains them
 * (nearest centre first, at that pile's batch), a new mound of an entrance whose grid would contain them, a heap
 * within HEAP_MERGE_DIST (else absorbed), or a new heap (cap HEAP_CAP, else absorbed). New piles and absorption
 * happen at the global batch (tick % MOUND_BATCH_TICKS == 0). Then each due pile relaxes and is published.
 */
export function moundBatches(sim: Sim): void {
  const tick = sim.state.tick, B = MOUND_BATCH_TICKS;
  const globalDue = tick % B === 0;
  const due = (m: Mound) => (tick + m.id) % B === 0;
  const mounds = sim.state.worldDelta.mounds;
  if (!globalDue && !mounds.some(due)) return;
  const touched = new Set<Mound>(), created = new Set<Mound>();
  const age = PELLET_SETTLE_S * TICKS_PER_SECOND;
  const list = sim.stores.items.list;
  for (let n = 0; n < list.length; n++) {
    const it = list[n];
    if (!it.alive || !isPellet(it) || it.inNest || it.carrierIds.length > 0 || tick - it.droppedTick < age) continue;
    const nest = pelletNest(sim, it);
    const target = nest ? settleTarget(sim, nest, it, globalDue, created) : null;
    if (target === 'absorb') { if (globalDue) absorb(sim, it); continue; }
    if (!target || (!due(target) && !created.has(target))) continue;
    if (deposit(sim, target, it.pos.x, it.pos.z, it.volume * BULKING * sim.world.bu ** 3)) {
      target.absorbed++;
      touched.add(target);
      removeItem(sim, it.id, 'mound');
      sim.emit({ type: 'pellet-dumped', itemId: it.id, into: target.entranceId >= 0 ? 'mound' : 'heap' });
    } else if (globalDue) absorb(sim, it);
  }
  for (const m of mounds) {
    if (!due(m) && !touched.has(m)) continue;
    const moved = relax(sim, m);
    m.lastBatchTick = tick;
    if (moved || touched.has(m)) publishMound(sim, m);
  }
}

function absorb(sim: Sim, it: Item): void {
  removeItem(sim, it.id, 'terrain');
  sim.emit({ type: 'pellet-dumped', itemId: it.id, into: 'terrain' });
}

/** Pile a settling pellet joins (creating it at the global batch), 'absorb', or null (wait). */
function settleTarget(sim: Sim, nest: Nest, it: Item, globalDue: boolean, created: Set<Mound>): Mound | 'absorb' | null {
  const bu = sim.world.bu;
  let best: Mound | null = null, bestD = Infinity;
  const piles: Mound[] = [];
  for (const id of nest.moundIds) {
    const m = moundById(sim, id);
    if (!m || !sameClass(m, it)) continue;
    piles.push(m);
    if (!moundContains(m, it.pos.x, it.pos.z)) continue;
    const d = Math.hypot(m.centerX - it.pos.x, m.centerZ - it.pos.z);
    if (d < bestD) { bestD = d; best = m; }
  }
  if (best) return best;
  if (!globalDue) return null;
  const material = it.kind === 'frass' ? 'frass' : (it.material ?? 'loam');
  const entrance = entranceWithoutMoundFor(sim, nest, it.pos);
  const make = (e: Entrance | null, x: number, z: number): Mound => {
    const m = createMound(sim, nest, e, x, z, material);
    created.add(m);
    return m;
  };
  if (entrance) return make(entrance, entrance.pos.x, entrance.pos.z);
  const heaps = piles.filter((m) => m.entranceId < 0);
  const near = heaps.find((m) => Math.hypot(m.centerX - it.pos.x, m.centerZ - it.pos.z) <= HEAP_MERGE_DIST_BU * bu);
  if (near) return 'absorb'; // a heap is near but its grid does not reach the pellet
  if (heaps.length >= HEAP_CAP) return 'absorb';
  return make(null, it.pos.x, it.pos.z);
}

/** An entrance of the nest without a mound whose (future) grid would contain p. */
function entranceWithoutMoundFor(sim: Sim, nest: Nest, p: Vec3): Entrance | null {
  const half = ((MOUND_GRID_N - 1) * MOUND_CELL_BU * sim.world.bu) / 2;
  let best: Entrance | null = null, bestD = Infinity;
  for (const e of nest.entrances) {
    if (e.moundId >= 0 && moundById(sim, e.moundId)) continue;
    const dx = Math.abs(p.x - e.pos.x), dz = Math.abs(p.z - e.pos.z);
    if (dx > half || dz > half) continue;
    const d = Math.hypot(dx, dz);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

// ---- founding expulsion (GDD 03 §13.2 `digging`) ----

/**
 * Deposits a bite's volume x BULKING on the founding mound at a random dump-ring cell of the nest's first
 * entrance (or around the nest origin before there is one); emits `pellet-expelled`. No item is created.
 */
export function expelVolume(sim: Sim, nest: Nest, volume: number, material: MaterialId, antId: number, from: Vec3): void {
  const e = nest.entrances[0] ?? null;
  let m = e && e.moundId >= 0 ? moundById(sim, e.moundId) : undefined;
  if (!m) m = nest.moundIds.map((id) => moundById(sim, id)).find((x) => x && x.material !== 'frass' && (e ? x.entranceId === e.id || x.entranceId < 0 : true));
  if (!m) m = createMound(sim, nest, e, e ? e.pos.x : nest.origin.x, e ? e.pos.z : nest.origin.z, material);
  const ring: Entrance = e ?? {
    id: -1, kind: 'dug', status: 'open', pos: { x: m.centerX, y: nest.origin.y, z: m.centerZ }, dir: { x: 0, y: 1, z: 0 },
    radius: sim.world.bu, moundId: m.id, rimTarget: 0, plugVoxelCount: 0, createdTick: 0, trafficIn: 0, trafficOut: 0,
  };
  const p = dumpPoint(sim, ring, { x: 0, y: 0, z: 0 });
  deposit(sim, m, p.x, p.z, volume * BULKING * sim.world.bu ** 3);
  m.absorbed++;
  publishMound(sim, m);
  sim.emit({ type: 'pellet-expelled', antId, itemId: -1, volume, material, pos: { x: from.x, y: from.y, z: from.z }, moundId: m.id });
}

// ---- clutter (GDD 03 §1.3) ----

/** In-cavity speed multiplier from loose pellets within CLUTTER_RADIUS of p (locomotion applies it). */
export function clutterSpeedMult(sim: Sim, p: Vec3): number {
  const r = CLUTTER_RADIUS_BU * sim.world.bu;
  const ids = sim.index.queryItems(p, r, []);
  let n = 0;
  for (const id of ids) {
    const it = sim.stores.items.get(id);
    if (it && isPellet(it) && it.inNest && it.carrierIds.length === 0) n++;
  }
  return Math.max(CLUTTER_SLOW_MIN, 1 - CLUTTER_SLOW_PER * n);
}

/** Choked spots of a nest: pellets with at least CHOKE_COUNT loose pellets within CHOKE_LEN (diag-nest-traffic). */
export function chokedSpots(sim: Sim, nestId: number): Vec3[] {
  const loose = loosePellets(sim, nestId), r = CHOKE_LEN_BU * sim.world.bu, out: Vec3[] = [];
  for (const a of loose) {
    let n = 0;
    for (const b of loose) if (Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y, a.pos.z - b.pos.z) <= r) n++;
    if (n >= CHOKE_COUNT && !out.some((q) => Math.hypot(q.x - a.pos.x, q.y - a.pos.y, q.z - a.pos.z) <= r)) out.push({ ...a.pos });
  }
  return out;
}

