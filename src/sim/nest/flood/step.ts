// The flood step of one nest (GDD 03 §11.1-11.3), every FLOOD_STEP_TICKS (1 game s):
//   W += (Q_in - Q_out) dt, clamped to [0, open volume];  Q_out = K_DRAIN x A_wet x (1 - 0.7 m) (x cheat drain scale)
// then the level, the chambers' flooded share (Chamber.flooded, read by nurses, the queen, brood and the overlay),
// the flood events and, at flood end, the `survived-flood` nest milestone (its bookkeeping is persisted in
// FloodState). While the nest's geometry is frozen (runtime.ts throttle) the step is deferred: W, level and shares
// stay, and the next step integrates the whole elapsed time.

import type { Nest, Sim } from '@/sim/types';
import {
  FLOOD_ALERT_FRACTION, FLOOD_DRAIN_MOIST_K, FLOOD_DRY_BU3, FLOOD_LEVEL_EVENT_TICKS, FLOOD_REBUILD_SLOTS, FLOOD_REBUILD_TICKS,
  FLOOD_STEP_TICKS,
} from '@/sim/balance/weather';
import { TICKS_PER_DAY, TICKS_PER_SECOND } from '@/sim/time';
import { moistureAt } from '../substrate';
import { floodCheats } from './cheats';
import { nestInflow } from './inflow';
import { floodGeometry } from './runtime';
import { chamberFloodedShare, floodedCount, spillVolume, waterLevelMm, type SpillCache } from './spill';

const BROOD_TYPES = new Set(['nursery', 'royal', 'founding']);

/** Drainage of a nest at a flooded count, BU^3/s. */
export function drainageOf(sim: Sim, nest: Nest, cache: SpillCache, nFlooded: number): number {
  const m = moistureAt(sim, nest.origin);
  return cache.cumKA[nFlooded] * (1 - FLOOD_DRAIN_MOIST_K * m) * floodCheats(sim.state).drainScale;
}

/** Writes the flooded share of every chamber; returns the largest share of a brood / royal / founding chamber. */
function updateChambers(sim: Sim, nest: Nest, cache: SpillCache | null, nFlooded: number): number {
  let worst = 0;
  for (const c of nest.chambers) {
    const f = cache ? chamberFloodedShare(cache, c.id, nFlooded) : 0;
    if (f !== c.flooded) {
      if (f > 0) c.wetUntilTick = sim.state.tick + TICKS_PER_DAY;
      c.flooded = f;
    }
    if (BROOD_TYPES.has(c.type) && f > worst) worst = f;
  }
  return worst;
}

function floodedChamberIds(nest: Nest): number[] {
  return nest.chambers.filter((c) => c.flooded > 0).map((c) => c.id);
}

/** Result of one nest step (tests, the system's submersion pass). */
export interface NestFloodStep {
  cache: SpillCache | null;
  nFlooded: number;
  qIn: number;
  qOut: number;
  /** The geometry was frozen: nothing was integrated (the next step covers the elapsed time). */
  frozen: boolean;
}

/** Longest a nest's geometry stays frozen: the throttle period, then up to a full round of rebuild slots. */
const MAX_FROZEN_TICKS = FLOOD_REBUILD_TICKS + FLOOD_REBUILD_SLOTS * FLOOD_STEP_TICKS;

/** Seconds since the nest's last integrated step: at least one flood step, at most the longest freeze and a step. */
function elapsedS(tick: number, lastTick: number): number {
  const dt = tick - lastTick;
  const ticks = !(dt >= FLOOD_STEP_TICKS) ? FLOOD_STEP_TICKS : Math.min(dt, MAX_FROZEN_TICKS + FLOOD_STEP_TICKS);
  return ticks / TICKS_PER_SECOND;
}

/** Advances one nest's water over the time since its last step (normally one flood step). */
export function stepNestFlood(sim: Sim, nest: Nest): NestFloodStep {
  const f = nest.flood;
  const qIn = nestInflow(sim, nest);
  const tick = sim.state.tick;
  if (f.water <= 0 && qIn <= 0) {
    f.lastTick = tick;
    if (nest.chambers.some((c) => c.flooded > 0)) updateChambers(sim, nest, null, 0);
    return { cache: null, nFlooded: 0, qIn, qOut: 0, frozen: false };
  }
  const cache = floodGeometry(sim, nest);
  if (!cache) return { cache: null, nFlooded: 0, qIn, qOut: 0, frozen: true };
  const dt = elapsedS(tick, f.lastTick);
  const prevTick = f.lastTick;
  f.lastTick = tick;
  const before = floodedCount(cache, f.water);
  const qOut = drainageOf(sim, nest, cache, before);
  const wasWet = f.water > FLOOD_DRY_BU3;
  f.water = Math.min(spillVolume(cache), Math.max(0, f.water + (qIn - qOut) * dt));
  if (f.water <= FLOOD_DRY_BU3 && qIn <= 0) f.water = 0;
  const n = floodedCount(cache, f.water);
  f.level = n > 0 ? waterLevelMm(cache, f.water, sim.carve.voxel) : -1e9;
  const worst = updateChambers(sim, nest, cache, n);
  const wet = f.water > FLOOD_DRY_BU3;
  if (wet && !wasWet) {
    f.floodingSinceTick = tick;
    f.peakShare = worst;
    f.broodDrowned = false;
    sim.emit({ type: 'flood-started', nestId: nest.id, water: f.water, level: f.level, chambers: floodedChamberIds(nest) });
  } else if (wet && levelEventDue(tick, prevTick, f.floodingSinceTick)) {
    sim.emit({ type: 'flood-level', nestId: nest.id, water: f.water, level: f.level, chambers: floodedChamberIds(nest) });
  }
  if (wet) f.peakShare = Math.max(f.peakShare ?? 0, worst);
  if (!wet && wasWet) {
    f.floodingSinceTick = -1;
    sim.emit({ type: 'flood-ended', nestId: nest.id });
    const peak = f.peakShare ?? 0;
    if (peak >= FLOOD_ALERT_FRACTION && !f.broodDrowned) sim.emit({ type: 'nest-milestone', kind: 'survived-flood', value: peak });
    delete f.peakShare;
    delete f.broodDrowned;
  }
  return { cache, nFlooded: n, qIn, qOut, frozen: false };
}

/** A `flood-level` event is due when a multiple of FLOOD_LEVEL_EVENT_TICKS since the start passed since the last step. */
function levelEventDue(tick: number, prevTick: number, since: number): boolean {
  if (since < 0 || tick <= since) return false;
  const now = Math.floor((tick - since) / FLOOD_LEVEL_EVENT_TICKS);
  const before = prevTick > since ? Math.floor((prevTick - since) / FLOOD_LEVEL_EVENT_TICKS) : 0;
  return now > before;
}
