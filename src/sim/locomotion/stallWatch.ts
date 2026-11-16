// Stall watch (viab-loco item 1): an ant that tries to move (nav status 'moving') for stallWindowS game seconds in all
// while staying within LOCO_TUNING.stallMoveBU of one point is stalled. The locomotion system feeds every ant through
// watchStall each tick; the `walker-stall` invariant (index.ts) reports the stalled ones with what a diagnosis needs.
//
// The window is kept while the ant stays in its sphere and only its 'moving' time counts: a walk that fails and is
// re-issued, an ant that drops and lands on the same spot, or one that stands for a while between attempts, adds up
// its attempts instead of starting afresh each time (a walker wedged in a slit that fails every few seconds is a
// stall). Leaving the sphere starts a new window, a real arrival ends it. Time an ant cannot or must not move does not
// count (the window pauses): the possessed ant, ants the cold holds still, stunned ants, ants a movement override
// (seizure, pin, drag) held, and ants in the air.
//
// Runtime only (a diagnostic, never read by the simulation): a restored game starts its windows afresh.

import type { Ant, Sim } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { LOCO_TUNING } from './params';
import type { LocoRuntime } from './runtime';
import { tempSpeedFactor } from './speed';
import { isStunned } from './weather';

/** An ant's current stall window. */
export interface StallRecord {
  /** Centre of the stall sphere (where the window started), mm. */
  x: number; y: number; z: number;
  /** Tick the window started. */
  tick: number;
  /** Ticks of the window the ant was trying to move (to the watch's sample precision). */
  trying: number;
}

/** A stalled ant, for reports. */
export interface StallInfo {
  id: number;
  /** Ticks spent trying to move without leaving the stall sphere. */
  ticks: number;
  /** Ticks since the window started (>= ticks: paused and idle time included). */
  spanTicks: number;
  /** Position and surface normal; BU for the position. */
  posBU: { x: number; y: number; z: number };
  up: { x: number; y: number; z: number };
  task: string;
  state: string;
  navMode: string;
  navStatus: string;
  medium: string;
  nestId: number;
  /** Trip destination (nav.dest, BU) and the behaviour's target slot (kind:id). */
  destBU: { x: number; y: number; z: number };
  target: string;
}

const WATCH_EVERY = LOCO_TUNING.stallWatchEveryTicks;
/** Records of dead or removed ants are dropped every this many ticks (the invariant may never run in a game). */
const PRUNE_EVERY = 50 * WATCH_EVERY;

/** The ant tries to move and nothing excuses it from moving (consumes the override mark). */
function trying(sim: Sim, ant: Ant, r: LocoRuntime): boolean {
  const held = r.overriddenTick.get(ant.id);
  if (held !== undefined) r.overriddenTick.delete(ant.id);
  if (ant.nav.status !== 'moving' || ant.medium === 'air') return false;
  if ((ant.flags & AntFlag.POSSESSED) !== 0) return false;
  if (held !== undefined && held > sim.state.tick - WATCH_EVERY) return false;
  if (isStunned(sim, ant)) return false;
  return tempSpeedFactor(sim, ant) > LOCO_TUNING.stallAbleTempFactor;
}

/**
 * Updates the ant's stall window (call once per tick after the ant's step, also when the LOD skipped it); does
 * its work on every WATCH_EVERY-th tick of the ant only. An override that held the ant in between is seen through
 * overriddenTick (kept until the ant's next look).
 */
export function watchStall(sim: Sim, ant: Ant, r: LocoRuntime): void {
  if ((sim.state.tick + ant.id) % WATCH_EVERY !== 0) return;
  const m = r.stalls;
  const t = trying(sim, ant, r);
  if (!ant.alive || ant.nav.status === 'arrived') { m.delete(ant.id); return; }
  const rec = m.get(ant.id);
  if (!rec) {
    if (t) m.set(ant.id, { x: ant.pos.x, y: ant.pos.y, z: ant.pos.z, tick: sim.state.tick, trying: 0 });
    return;
  }
  const dx = ant.pos.x - rec.x, dy = ant.pos.y - rec.y, dz = ant.pos.z - rec.z, lim = r.P.stallMove;
  if (dx * dx + dy * dy + dz * dz >= lim * lim) {
    // left the sphere: a new window from here (if the ant is trying now)
    if (!t) { m.delete(ant.id); return; }
    rec.x = ant.pos.x; rec.y = ant.pos.y; rec.z = ant.pos.z; rec.tick = sim.state.tick; rec.trying = 0;
    return;
  }
  if (t) rec.trying += WATCH_EVERY;
}

/** Drops the watch's records of an ant (dead). */
export function forgetStall(r: LocoRuntime, id: number): void {
  if (r.stalls.size > 0) r.stalls.delete(id);
  if (r.overriddenTick.size > 0) r.overriddenTick.delete(id);
}

/** Drops the records of dead and removed ants (call every tick; works every PRUNE_EVERY ticks). */
export function pruneStalls(sim: Sim, r: LocoRuntime): void {
  if (sim.state.tick % PRUNE_EVERY !== 0) return;
  const ants = sim.stores.ants;
  for (const id of r.stalls.keys()) if (!ants.get(id)?.alive) r.stalls.delete(id);
  for (const id of r.overriddenTick.keys()) if (!ants.get(id)?.alive) r.overriddenTick.delete(id);
}

/** Ants stalled now (time trying within the window >= stallWindowS), in id order. */
export function stalledAnts(sim: Sim, r: LocoRuntime): StallInfo[] {
  const out: StallInfo[] = [];
  const now = sim.state.tick, bu = sim.world.bu, limit = r.P.stallTicks;
  const ids = [...r.stalls.keys()].sort((a, b) => a - b);
  for (const id of ids) {
    const rec = r.stalls.get(id)!;
    const ant = sim.stores.ants.get(id);
    if (!ant || !ant.alive) { r.stalls.delete(id); continue; }
    if (rec.trying < limit) continue;
    const t = ant.target;
    out.push({
      id, ticks: rec.trying, spanTicks: now - rec.tick,
      posBU: { x: ant.pos.x / bu, y: ant.pos.y / bu, z: ant.pos.z / bu }, up: { ...ant.up },
      task: ant.task, state: ant.state, navMode: ant.nav.mode, navStatus: ant.nav.status, medium: ant.medium, nestId: ant.nestId,
      destBU: { x: ant.nav.dest.x / bu, y: ant.nav.dest.y / bu, z: ant.nav.dest.z / bu },
      target: t ? `${t.kind}:${t.id}` : 'none',
    });
  }
  return out;
}

const f1 = (v: number) => v.toFixed(1), f2 = (v: number) => v.toFixed(2);

/** One line per stalled ant (invariant detail). */
export function formatStall(s: StallInfo): string {
  const p = s.posBU, d = s.destBU, u = s.up;
  return `ant ${s.id} stalled ${s.ticks} ticks (of ${s.spanTicks}) at (${f1(p.x)}, ${f1(p.y)}, ${f1(p.z)}) BU up (${f2(u.x)}, ${f2(u.y)}, ${f2(u.z)}) `
    + `${s.task}/${s.state} nav ${s.navMode} ${s.navStatus} ${s.medium} nest ${s.nestId} dest (${f1(d.x)}, ${f1(d.y)}, ${f1(d.z)}) target ${s.target}`;
}
