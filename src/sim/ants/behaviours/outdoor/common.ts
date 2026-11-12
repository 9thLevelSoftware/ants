// Shared helpers of the outdoor behaviours: phase bookkeeping, the decision log, home lookups, failure counting,
// think scheduling and the per-tick colony gate (curfew).

import type { Ant, Chamber, Colony, Entrance, Nest, ReasonCode, Sim } from '@/sim/types';
import { REASON_CODES } from '@/sim/types';
import { STUCK_MAX, STUCK_WINDOW_S } from '@/sim/balance/foraging';
import { curfew } from '@/sim/colony';
import { secondsToTicks, TICKS_PER_SECOND } from '@/sim/time';
import { K, type Phase } from './keys';

export function num(ant: Ant, key: string, d: number): number {
  const v = ant.bb[key];
  return v === undefined ? d : v;
}

/** Decision log for the inspect card (GDD 02 §7): reason code index + a detail number, newest first. */
export function logDecision(sim: Sim, ant: Ant, reason: ReasonCode, detail: number): void {
  const ring = ant.mem.decisions;
  if (ring.length === 0) return;
  const base = reason.split(':')[0];
  const code = (REASON_CODES as readonly string[]).indexOf(base);
  if (ring[0] && ring[0].code === code && ring[0].detail === detail && ring[0].tick >= 0) { ring[0] = { tick: sim.state.tick, code, detail }; return; }
  for (let i = ring.length - 1; i > 0; i--) ring[i] = ring[i - 1];
  ring[0] = { tick: sim.state.tick, code, detail };
}

/** A behaviour's naming of the engine phases ('<task>.<state>'). */
export interface StateNames {
  readonly [phase: number]: string;
}

export function phaseOf(ant: Ant): Phase {
  return num(ant, K.phase, -1) as Phase;
}

/** Enters a phase: state name, state tick, phase start; logs the reason if given. */
export function setPhase(sim: Sim, ant: Ant, names: StateNames, phase: Phase, reason?: ReasonCode, detail = -1): void {
  const tick = sim.state.tick;
  ant.bb[K.phase] = phase;
  ant.bb[K.phase0] = tick;
  const name = names[phase] ?? ant.task;
  if (ant.state !== name) {
    ant.state = name;
    ant.stateTick = tick;
  }
  if (reason) logDecision(sim, ant, reason, detail);
}

/** Game seconds since the current phase began. */
export function phaseS(sim: Sim, ant: Ant): number {
  return (sim.state.tick - num(ant, K.phase0, sim.state.tick)) / TICKS_PER_SECOND;
}

/** Next behaviour think in `ticks` (the runner otherwise thinks again after BEHAVIOUR_THINK_TICKS). */
export function thinkIn(sim: Sim, ant: Ant, ticks: number): void {
  ant.thinkTick = sim.state.tick + Math.max(1, ticks);
}

// ---- home ----

/** The ant's home nest: its colony's first nest with an entrance. */
export function homeNest(sim: Sim, ant: Ant): Nest | undefined {
  const col = sim.stores.colonies.get(ant.colony);
  if (!col) return undefined;
  for (const id of col.nestIds) {
    const n = sim.stores.nests.get(id);
    if (n && n.alive && n.entrances.length > 0) return n;
  }
  return undefined;
}

export function mainEntrance(nest: Nest): Entrance | undefined {
  for (const e of nest.entrances) if (e.status !== 'sealed') return e;
  return nest.entrances[0];
}

function dist2(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

/** The chamber nearest the main entrance: where foragers wait and unload (GDD 02 §6.6 "entrance chamber"). */
export function entranceChamber(nest: Nest): Chamber | undefined {
  const e = mainEntrance(nest);
  let best: Chamber | undefined, bd = Infinity;
  for (const c of nest.chambers) {
    const d = e ? dist2(c.center, e.pos) : 0;
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

/** The food chamber nearest the entrance, else the entrance chamber (solid deliveries, GDD 02 §5.3). */
export function foodChamber(nest: Nest): Chamber | undefined {
  const e = mainEntrance(nest);
  let best: Chamber | undefined, bd = Infinity;
  for (const c of nest.chambers) {
    if (c.type !== 'food') continue;
    const d = e ? dist2(c.center, e.pos) : 0;
    if (d < bd) { bd = d; best = c; }
  }
  return best ?? entranceChamber(nest);
}

export function inNest(ant: Ant): boolean {
  return ant.nestId >= 0;
}

/** Straight-line distance from the ant's main entrance to a point, mm (Infinity without a nest). */
export function distFromHome(sim: Sim, ant: Ant, p: { x: number; z: number }): number {
  const n = homeNest(sim, ant);
  const e = n ? mainEntrance(n) : undefined;
  return e ? Math.hypot(p.x - e.pos.x, p.z - e.pos.z) : Infinity;
}

// ---- failures ----

/** Counts a locomotion failure; true when STUCK_MAX failures fell within STUCK_WINDOW_S (GDD 02 §10.0). */
export function noteFailure(sim: Sim, ant: Ant): boolean {
  const now = sim.state.tick;
  const t0 = num(ant, K.stuck0, -1);
  if (t0 < 0 || now - t0 > secondsToTicks(STUCK_WINDOW_S)) {
    ant.bb[K.stuck0] = now;
    ant.bb[K.stuckN] = 1;
    return false;
  }
  const n = num(ant, K.stuckN, 0) + 1;
  ant.bb[K.stuckN] = n;
  if (n >= STUCK_MAX) {
    ant.bb[K.stuckN] = 0;
    ant.bb[K.stuck0] = -1;
    return true;
  }
  return false;
}

// ---- colony gate ----

const gate = new WeakMap<Sim, { tick: number; curfew: Map<number, boolean> }>();

/** Foraging curfew of the colony (GDD 02 §6.6), evaluated once per tick per colony (runtime cache only). */
export function curfewNow(sim: Sim, col: Colony): boolean {
  let g = gate.get(sim);
  if (!g || g.tick !== sim.state.tick) {
    g = { tick: sim.state.tick, curfew: new Map() };
    gate.set(sim, g);
  }
  let v = g.curfew.get(col.id);
  if (v === undefined) {
    v = curfew(sim, col);
    g.curfew.set(col.id, v);
  }
  return v;
}
