// Soil pellets and frass (GDD 03 §1.3): creation, dropping (clutter, spoil piles, surface pellets, water), haul
// urgency, founding expulsion, clutter queries for locomotion. Tamping is in tamp.ts, settling into mounds and
// heaps in moundBatch.ts.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Entrance, Item, MaterialId, Mound, Nest, PelletDumpTarget, Sim } from '@/sim/types';
import {
  BULKING, CHOKE_COUNT, CHOKE_LEN_BU, CLUTTER_RADIUS_BU, CLUTTER_SLOW_MIN, CLUTTER_SLOW_PER, EXPEL_ENTRANCE_REACH_BU,
  FRASS_MATERIALS, HAUL_URGENCY_GAIN, MAX_LOOSE_PELLETS_PER_NEST, TAMP_CAP_TRIES, PELLET_BULK_PER_BU3, PELLET_TAMP_S, SPOIL_JOIN_BU,
} from '@/sim/balance/nest';
import { removeItem, spawnItem } from '@/sim/entities';
import { TICKS_PER_SECOND } from '@/sim/time';
import { findChamberAtImpl } from './chambers/registry';
import { createMound, deposit, dumpPoint, moundById, publishMound } from './mounds';
import { tampPellet } from './tamp';


export function isPellet(it: Item): boolean {
  return it.kind === 'soil-pellet' || it.kind === 'frass';
}

/** The nest a pellet belongs to: its own, else its colony's first nest. */
export function pelletNest(sim: Sim, it: Item): Nest | undefined {
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

/**
 * Haul urgency of a lying pellet in the nest (sim-fix-colony): 1 when dropped, rising linearly with its untouched
 * age to 1 + HAUL_URGENCY_GAIN at tamping age, so spoil about to be pressed into the floor is cleared first.
 * Pellets outside the nest (surface pellets that settle into mounds) are not haul jobs: 0.
 */
export function pelletHaulUrgency(sim: Sim, it: Item): number {
  if (!it.alive || !isPellet(it) || !it.inNest || it.carrierIds.length > 0) return 0;
  const age = Math.max(0, sim.state.tick - it.droppedTick) / (PELLET_TAMP_S * TICKS_PER_SECOND);
  return 1 + HAUL_URGENCY_GAIN * Math.min(1, age);
}

/**
 * GDD 03 §1.3 cap: above MAX_LOOSE_PELLETS_PER_NEST lying pellets the oldest clutter pellet tamps at once. When the
 * passage rule refuses it (or takes only part), the next oldest is tried, up to TAMP_CAP_TRIES pellets per drop; a
 * nest with no floor left to raise anywhere near its oldest clutter can then hold more than the cap (the passage
 * rule wins: sim-fix-colony item 2), and every further drop pays at most TAMP_CAP_TRIES tamp attempts.
 */
function enforceLooseCap(sim: Sim, nest: Nest): void {
  const loose = loosePellets(sim, nest.id);
  if (loose.length <= MAX_LOOSE_PELLETS_PER_NEST) return;
  const clutter = loose.filter((it) => it.spoilPlanId < 0 && it.reservedBy < 0).sort((a, b) => a.droppedTick - b.droppedTick || a.id - b.id);
  for (let n = 0; n < clutter.length && n < TAMP_CAP_TRIES; n++) if (tampPellet(sim, clutter[n])) return;
}

// ---- founding expulsion (GDD 03 §13.2 `digging`) ----

/**
 * The entrance whose mound takes the founding soil of a bite at `from`: the nest's entrance nearest the bite
 * (horizontally; ties: record order) when within its radius + EXPEL_ENTRANCE_REACH, else the entrance whose
 * throat is in the bite's nav component (a long ramp), else null (a fresh pit whose hole has no record yet).
 */
function expelEntrance(sim: Sim, nest: Nest, from: Vec3): Entrance | null {
  const bu = sim.world.bu, reach = EXPEL_ENTRANCE_REACH_BU * bu;
  let best: Entrance | null = null, bestD = Infinity;
  for (const e of nest.entrances) {
    const d = Math.hypot(e.pos.x - from.x, e.pos.z - from.z) - e.radius;
    if (d < bestD) { bestD = d; best = e; }
  }
  if (best && bestD <= reach) return best;
  const c = nest.entrances.length > 0 ? sim.nestNav.componentAt(from) : -1;
  if (c < 0) return null;
  for (const e of nest.entrances) {
    if (sim.nestNav.componentAt({ x: e.pos.x - e.dir.x * bu, y: e.pos.y - e.dir.y * bu, z: e.pos.z - e.dir.z * bu }) === c) return e;
  }
  return null;
}

/** The nest's entrance-less soil pile centred nearest (cx, cz) within EXPEL_ENTRANCE_REACH, or undefined. */
function freePileNear(sim: Sim, nest: Nest, cx: number, cz: number): Mound | undefined {
  let best: Mound | undefined, bestD = EXPEL_ENTRANCE_REACH_BU * sim.world.bu;
  for (const id of nest.moundIds) {
    const m = moundById(sim, id);
    if (!m || m.material === 'frass' || m.entranceId >= 0) continue;
    const d = Math.hypot(m.centerX - cx, m.centerZ - cz);
    if (d <= bestD) { bestD = d; best = m; }
  }
  return best;
}

/**
 * Deposits a bite's volume x BULKING on the founding mound of the pit being dug (GDD 03 §13.2): at a random
 * dump-ring cell of the entrance that pit opens through, or around the pit before its hole has an entrance
 * record (that pile is linked to the entrance when it registers); emits `pellet-expelled`. No item is created.
 */
export function expelVolume(sim: Sim, nest: Nest, volume: number, material: MaterialId, antId: number, from: Vec3): void {
  const e = expelEntrance(sim, nest, from);
  const cx = e ? e.pos.x : from.x, cz = e ? e.pos.z : from.z;
  let m = e && e.moundId >= 0 ? moundById(sim, e.moundId) : undefined;
  if (!m) {
    m = freePileNear(sim, nest, cx, cz);
    if (m && e) { m.entranceId = e.id; e.moundId = m.id; } // the pit's early soil, now around its entrance
  }
  if (!m) m = createMound(sim, nest, e, cx, cz, material);
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

