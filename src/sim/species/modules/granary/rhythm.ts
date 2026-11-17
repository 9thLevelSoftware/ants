// The harvester's daily rhythm (GDD 07 §5.3.7): heat on the trails shortens the foraging range and, when every
// trail cell is past the shade-seeking temperature, stops departures; a summer lull damps departures when seed
// returns collapse; and each active window opens only after the morning patrol has come back safely.

import { clamp } from '@/core/math/scalar';
import type { Vec3 } from '@/core/math/vec3';
import type { Colony, PatrolGateState, Sim, System } from '@/sim/types';
import { microTemp } from '@/sim/environment/microTemp';
import { surfaceActivityOf } from '@/sim/colony/envAdapter';
import { currentSeason, currentYear, TICKS_PER_SECOND } from '@/sim/time';
import {
  HEAT_SAMPLE_STEP_BU, HEAT_SAMPLES_MAX, PATROL_ALARM_PH, PATROL_FAILSAFE_TICKS, PATROL_GATE_MIN_WORKERS,
  PATROL_HOLD_TICKS, PATROL_MAX_FRAC, PATROL_STEP_TICKS, TRAIL_TEMP_VALID_C, TRIP_BASE_BU, WINDOW_ACTIVITY_MIN,
} from '@/sim/balance/species-harvester';
import { granaryColonies } from './economy';
import type { GranaryParams } from './params';

// ---- heat ----

/** Test fake for the trail temperature (runtime only): replaces microTemp at every sample point. */
const tempOverride = new WeakMap<Sim, (p: Vec3) => number>();

export function setTrailTempOverride(sim: Sim, f: ((p: Vec3) => number) | null): void {
  if (f) tempOverride.set(sim, f);
  else tempOverride.delete(sim);
}

export interface HeatReading {
  /** Mean Tmicro over the trail samples, °C. */
  tTrail: number;
  /** Share of samples at or above shadeSeekC (GDD 06 §2.6 heatStress), 0..1. */
  heatStress: number;
  /** Trip limit multiplier clamp((tripHeatLimitC - tTrail) / tripHeatSpanC, tripHeatFloor, 1). */
  tripMult: number;
  /** Maximum foraging distance from the entrance, BU. */
  tripMaxBu: number;
}

const heatCache = new WeakMap<Sim, { tick: number; byColony: Map<number, HeatReading> }>();

/** The colony's main entrance position, or null. */
export function entrancePos(sim: Sim, col: Colony): Vec3 | null {
  for (const nid of col.nestIds) {
    const n = sim.stores.nests.get(nid);
    const e = n?.entrances.find((x) => x.status === 'open') ?? n?.entrances[0];
    if (e) return e.pos;
  }
  return null;
}

/** Sample points: the entrance, then along the lines to the colony's known sources (nearest first). */
function samplePoints(sim: Sim, col: Colony, from: Vec3, out: Vec3[]): Vec3[] {
  out.length = 0;
  out.push(from);
  const bu = sim.world.bu, step = HEAT_SAMPLE_STEP_BU * bu, maxD = TRIP_BASE_BU * bu;
  const srcs = col.knownSourceIds.map((id) => sim.stores.sources.get(id)).filter((s) => !!s)
    .map((s) => ({ s: s!, d: Math.sqrt((s!.pos.x - from.x) ** 2 + (s!.pos.z - from.z) ** 2) })).sort((a, b) => a.d - b.d || a.s.id - b.s.id);
  for (const { s, d } of srcs) {
    const len = Math.min(d, maxD);
    for (let k = step; k <= len && out.length < HEAT_SAMPLES_MAX; k += step) {
      const t = k / d;
      const x = from.x + (s.pos.x - from.x) * t, z = from.z + (s.pos.z - from.z) * t;
      out.push({ x, y: sim.field.height(x, z), z });
    }
    if (out.length >= HEAT_SAMPLES_MAX) break;
  }
  return out;
}

const pts: Vec3[] = [];

/** Heat on the colony's trails now (cached per tick). */
export function heatOf(sim: Sim, col: Colony, g: GranaryParams): HeatReading {
  let c = heatCache.get(sim);
  if (!c || c.tick !== sim.state.tick) { c = { tick: sim.state.tick, byColony: new Map() }; heatCache.set(sim, c); }
  const hit = c.byColony.get(col.id);
  if (hit) return hit;
  const def = sim.getSpecies(col.species);
  const shade = def?.thermal.shadeSeekC ?? 38;
  const from = entrancePos(sim, col);
  let sum = 0, hot = 0, n = 0;
  if (from) {
    const f = tempOverride.get(sim);
    for (const p of samplePoints(sim, col, from, pts)) {
      const t = f ? f(p) : microTemp(sim, p);
      // a non-physical reading (NaN, or far outside any weather) must not close the trails for everyone: skipped
      if (!(t >= TRAIL_TEMP_VALID_C[0] && t <= TRAIL_TEMP_VALID_C[1])) continue;
      sum += t;
      if (t >= shade) hot++;
      n++;
    }
  }
  const tTrail = n > 0 ? sum / n : 20;
  const tripMult = clamp((g.tripHeatLimitC - tTrail) / g.tripHeatSpanC, g.tripHeatFloor, 1);
  const r: HeatReading = { tTrail, heatStress: n > 0 ? hot / n : 0, tripMult, tripMaxBu: TRIP_BASE_BU * tripMult };
  c.byColony.set(col.id, r);
  return r;
}

// ---- summer lull ----

/**
 * Departure multiplier of the summer lull: lullActivationMult in summer while yesterday's seed intake is under
 * lullReturnFrac of this year's mean seed day (counters.ts noteSeedDay; GDD 07 says "spring mean", see there).
 */
export function lullMult(sim: Sim, col: Colony, g: GranaryParams): number {
  const mod = col.granary;
  if (!mod || currentSeason(sim.state) !== 'summer') return 1;
  if (mod.seedMeanYear !== currentYear(sim.state)) return 1;
  const mean = mod.seedDayMean ?? 0;
  if (mean <= 0) return 1;
  return (mod.seedInYesterday ?? 0) < g.lullReturnFrac * mean ? g.lullActivationMult : 1;
}

// ---- patrol gate ----

function newGate(): PatrolGateState {
  return { day: -1, open: true, returns: [], out: [], holdUntilTick: -1, closedTick: -1, openedTick: -1 };
}

export function gateOf(col: Colony): PatrolGateState {
  const mod = col.granary!;
  return mod.patrol ?? (mod.patrol = newGate());
}

function workersOf(sim: Sim, col: Colony): number {
  return col.core?.workers ?? 0;
}

/** Patrollers sent at the start of a window. */
export function patrollersWanted(sim: Sim, col: Colony): number {
  const def = sim.getSpecies(col.species);
  const n = workersOf(sim, col);
  const want = def?.signals.patrolGate?.patrollers ?? 0;
  return Math.max(1, Math.min(want, Math.floor(PATROL_MAX_FRAC * n)));
}

function alarmAtEntrance(sim: Sim, col: Colony): boolean {
  const e = entrancePos(sim, col);
  return !!e && sim.phero.sample(col.id, 'alarm', e) > PATROL_ALARM_PH;
}

/** One gate step of a colony. */
export function stepGate(sim: Sim, col: Colony, g: GranaryParams): void {
  const def = sim.getSpecies(col.species);
  const pg = def?.signals.patrolGate;
  const gate = gateOf(col);
  const now = sim.state.tick;
  const active = surfaceActivityOf(sim, col.species) >= WINDOW_ACTIVITY_MIN && heatOf(sim, col, g).heatStress < 1;
  if (!pg || workersOf(sim, col) < PATROL_GATE_MIN_WORKERS) {
    gate.open = true;
    gate.closedTick = -1;
    return;
  }
  if (!active) {
    gate.open = false;
    gate.closedTick = -1;
    gate.returns = [];
    gate.out = [];
    return;
  }
  if (gate.closedTick < 0) {
    gate.closedTick = now;
    gate.openedTick = -1;
    gate.open = false;
    gate.returns = [];
    gate.out = [];
  }
  if (gate.open) return;
  // patrollers out and back
  const stillOut: number[] = [];
  for (const id of gate.out) {
    const a = sim.stores.ants.get(id);
    if (!a || !a.alive) { gate.holdUntilTick = now + PATROL_HOLD_TICKS; continue; }
    if (a.nestId >= 0) gate.returns.push(now);
    else stillOut.push(id);
  }
  gate.out = stillOut;
  for (const a of sim.stores.ants.list) {
    if (a.alive && a.colony === col.id && a.task === 'patrol' && a.nestId < 0 && !gate.out.includes(a.id)) gate.out.push(a.id);
  }
  if (alarmAtEntrance(sim, col)) gate.holdUntilTick = now + PATROL_HOLD_TICKS;
  const window = pg.windowS * TICKS_PER_SECOND;
  gate.returns = gate.returns.filter((t) => now - t <= window);
  const needed = Math.min(pg.returnsNeeded, patrollersWanted(sim, col));
  if (gate.returns.length >= needed) { gate.open = true; gate.openedTick = now; return; }
  if (now - gate.closedTick >= PATROL_FAILSAFE_TICKS) {
    gate.open = true;
    gate.openedTick = now;
    gate.holdUntilTick = Math.max(gate.holdUntilTick, now + PATROL_HOLD_TICKS);
  }
}

/** Departure probability factor of the gate now: 0 closed, patrolHoldMult while held, else 1. */
export function gateMult(sim: Sim, col: Colony, g: GranaryParams): number {
  const gate = col.granary?.patrol;
  if (!gate) return 1;
  if (!gate.open) return 0;
  return gate.holdUntilTick > sim.state.tick ? g.patrolHoldMult : 1;
}

/** Whether the gate is closed while the colony is in an active window (patrol demand). */
export function patrolPending(sim: Sim, col: Colony): boolean {
  const gate = col.granary?.patrol;
  return !!gate && !gate.open && gate.closedTick >= 0;
}

/** Departure factor of the colony now: (1 - heatStress) x lull x gate (0 = nobody leaves). */
export function departureFactor(sim: Sim, col: Colony, g: GranaryParams): number {
  return (1 - heatOf(sim, col, g).heatStress) * lullMult(sim, col, g) * gateMult(sim, col, g);
}

export const patrolGateSystem: System = {
  name: 'granary-patrol-gate', phase: 'colony-allocation', every: PATROL_STEP_TICKS,
  run(sim) {
    for (const { col, g } of granaryColonies(sim)) stepGate(sim, col, g);
  },
};
