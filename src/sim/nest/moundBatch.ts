// Mound batches (GDD 03 §1.4): surface pellets settle into the nest's mounds and heaps every MOUND_BATCH_TICKS per
// pile (staggered by id); each due pile then relaxes to its angle of repose, spread over this and the following
// ticks within MOUND_RELAX_WORK_PER_TICK (sim-fix-colony), and is published once it has settled.

import type { Vec3 } from '@/core/math/vec3';
import type { Entrance, Item, Mound, Nest, Sim } from '@/sim/types';
import {
  BULKING, HEAP_CAP, HEAP_MERGE_DIST_BU, MOUND_BATCH_TICKS, MOUND_CELL_BU, MOUND_GRID_N, MOUND_RELAX_WORK_PER_TICK,
  PELLET_SETTLE_S,
} from '@/sim/balance/nest';
import { removeItem } from '@/sim/entities';
import { TICKS_PER_SECOND } from '@/sim/time';
import { refreshWalkers } from './carveOps';
import { createMound, deposit, moundById, moundContains, publishMound } from './mounds';
import { clearKeptCells, moundMask, relaxSweeps } from './moundRelax';
import { isPellet, pelletNest } from './pellets';

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
  settleBatches(sim);
  moundRelaxStep(sim);
}

/**
 * The settling half of the mound batches (see moundBatches): pellets join piles, kept-clear cells are emptied, and
 * each due pile starts (or restarts) its relaxation, which moundRelaxStep spreads over this and the next ticks.
 */
function settleBatches(sim: Sim): void {
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
    const cleared = clearKeptCells(sim, m, moundMask(sim, m));
    m.relaxSweep = 0;
    m.relaxFlags = (m.relaxFlags ?? 0) | (touched.has(m) || cleared ? RELAX_CHANGED : 0);
    m.lastBatchTick = tick;
  }
}

/** Mound.relaxFlags bits: the batch changed the pile; a sweep moved material. */
const RELAX_CHANGED = 1, RELAX_MOVED = 2;

/**
 * Runs the relaxations in progress (Mound.relaxSweep >= 0) within MOUND_RELAX_WORK_PER_TICK work units this tick,
 * in mound order (the first one always gets at least one sweep). Walkers on a pile that moved are re-projected;
 * a pile whose relaxation ended is published (field overlay, nav-grid cells, `mound-changed`) if it changed.
 */
export function moundRelaxStep(sim: Sim): void {
  let spent = 0, ran = false;
  for (const m of sim.state.worldDelta.mounds) {
    if ((m.relaxSweep ?? -1) < 0) continue;
    if (ran && spent >= MOUND_RELAX_WORK_PER_TICK) break;
    const run = relaxSweeps(sim, m, m.relaxSweep!, MOUND_RELAX_WORK_PER_TICK - spent);
    ran = true;
    spent += run.work;
    if (run.moved) m.relaxFlags = (m.relaxFlags ?? 0) | RELAX_MOVED;
    if (!run.done) {
      m.relaxSweep = m.relaxSweep! + run.sweeps;
      if (run.moved) refreshWalkers(sim, { x: m.centerX, y: m.base[(m.n * m.n) >> 1] || 0, z: m.centerZ }, (m.n - 1) * m.cell * 0.75);
      continue;
    }
    const changed = (m.relaxFlags ?? 0) !== 0;
    m.relaxSweep = -1;
    m.relaxFlags = 0;
    if (changed) publishMound(sim, m);
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

