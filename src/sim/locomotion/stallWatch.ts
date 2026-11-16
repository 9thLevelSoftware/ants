// Stall watch (viab-loco item 1): an ant whose nav status is 'moving' but whose position stays within
// LOCO_TUNING.stallMoveBU of one point for stallWindowS game seconds is stalled. The locomotion system feeds every
// ant through watchStall each tick; the `walker-stall` invariant (index.ts) reports the stalled ones with what a
// diagnosis needs. Ants that cannot or must not move are not watched: the possessed ant, ants the cold holds
// still, stunned ants, ants a movement override (seizure, pin, drag) moved this tick, and ants in the air.
//
// Runtime only (a diagnostic, never read by the simulation): a restored game starts its windows afresh.

import type { Ant, Sim } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import type { LocoRuntime } from './runtime';
import { tempSpeedFactor } from './speed';
import { isStunned } from './weather';

/** Where an ant's current stall window started. */
export interface StallRecord {
  x: number; y: number; z: number;
  tick: number;
}

/** A stalled ant, for reports. */
export interface StallInfo {
  id: number;
  /** Ticks without leaving the stall sphere. */
  ticks: number;
  /** Position and surface normal; BU for the position. */
  posBU: { x: number; y: number; z: number };
  up: { x: number; y: number; z: number };
  task: string;
  state: string;
  navMode: string;
  medium: string;
  nestId: number;
  /** Trip destination (nav.dest, BU) and the behaviour's target slot (kind:id). */
  destBU: { x: number; y: number; z: number };
  target: string;
}

/** Below this temperature speed factor an ant is held still by the cold, not stalled (as tools/sim/lifeMetrics). */
const ABLE_TEMP_FACTOR = 0.05;

function watched(sim: Sim, ant: Ant, r: LocoRuntime): boolean {
  if (ant.nav.status !== 'moving' || ant.medium === 'air') return false;
  if ((ant.flags & AntFlag.POSSESSED) !== 0) return false;
  const held = r.overriddenTick.get(ant.id);
  if (held !== undefined) {
    if (held === sim.state.tick) return false;
    r.overriddenTick.delete(ant.id);
  }
  if (isStunned(sim, ant)) return false;
  return tempSpeedFactor(sim, ant) > ABLE_TEMP_FACTOR;
}

/** Updates the ant's stall window (call once per tick after the ant's step, also when the LOD skipped it). */
export function watchStall(sim: Sim, ant: Ant, r: LocoRuntime): void {
  const m = r.stalls;
  if (!ant.alive || !watched(sim, ant, r)) { if (m.size > 0) m.delete(ant.id); return; }
  const rec = m.get(ant.id);
  const lim = r.P.stallMove;
  if (rec) {
    const dx = ant.pos.x - rec.x, dy = ant.pos.y - rec.y, dz = ant.pos.z - rec.z;
    if (dx * dx + dy * dy + dz * dz < lim * lim) return;
    rec.x = ant.pos.x; rec.y = ant.pos.y; rec.z = ant.pos.z; rec.tick = sim.state.tick;
    return;
  }
  m.set(ant.id, { x: ant.pos.x, y: ant.pos.y, z: ant.pos.z, tick: sim.state.tick });
}

/** Ants stalled now (window >= stallWindowS), in id order. */
export function stalledAnts(sim: Sim, r: LocoRuntime): StallInfo[] {
  const out: StallInfo[] = [];
  const now = sim.state.tick, bu = sim.world.bu, limit = r.P.stallTicks;
  const ids = [...r.stalls.keys()].sort((a, b) => a - b);
  for (const id of ids) {
    const rec = r.stalls.get(id)!;
    const ant = sim.stores.ants.get(id);
    if (!ant) { r.stalls.delete(id); continue; }
    if (now - rec.tick < limit) continue;
    const t = ant.target;
    out.push({
      id, ticks: now - rec.tick,
      posBU: { x: ant.pos.x / bu, y: ant.pos.y / bu, z: ant.pos.z / bu }, up: { ...ant.up },
      task: ant.task, state: ant.state, navMode: ant.nav.mode, medium: ant.medium, nestId: ant.nestId,
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
  return `ant ${s.id} stalled ${s.ticks} ticks at (${f1(p.x)}, ${f1(p.y)}, ${f1(p.z)}) BU up (${f2(u.x)}, ${f2(u.y)}, ${f2(u.z)}) `
    + `${s.task}/${s.state} nav ${s.navMode} ${s.medium} nest ${s.nestId} dest (${f1(d.x)}, ${f1(d.y)}, ${f1(d.z)}) target ${s.target}`;
}
