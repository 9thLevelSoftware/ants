// Bites and sprays that land on a creature (GDD 05 §2.1): deterrence (half-life 20 s; +0.08 per bite x attacker
// mass^(2/3), +0.35 x acid sensitivity per spray), harassment (bite +1, spray +3) and the recent-biter record.
// Combat should report each hit through noteCreatureHit (index.ts); damage it applies without a report is still
// noticed here from the hp drop (counted as one bite of a standard worker).

import type { Creature, Sim } from '@/sim/types';
import {
  DETERRENCE_HALF_LIFE_S, DETERRENCE_PER_BITE, DETERRENCE_PER_SPRAY, HARASS_BITE, HARASS_SPRAY,
} from '@/sim/balance/creatures';
import { TICKS_PER_SECOND } from '@/sim/time';
import { statsOf } from './common';

export type HitKind = 'bite' | 'spray' | 'sting';

const TICK_S = 1 / TICKS_PER_SECOND;
const DECAY_PER_TICK = Math.pow(0.5, TICK_S / DETERRENCE_HALF_LIFE_S);
/** Biter records older than this are dropped, s. */
const BITER_MEMORY_S = 5;

/** Records one hit: deterrence, harassment, the biter. */
export function recordHit(sim: Sim, c: Creature, antId: number, kind: HitKind): void {
  const ant = sim.stores.ants.get(antId);
  const mass = ant ? ant.massMg : 1;
  if (kind === 'spray') {
    c.deterrence += DETERRENCE_PER_SPRAY * statsOf(c).acidSens;
    c.harass += HARASS_SPRAY;
  } else {
    c.deterrence += DETERRENCE_PER_BITE * Math.pow(Math.max(0.01, mass), 2 / 3);
    c.harass += HARASS_BITE;
  }
  if (antId >= 0) c.bb[`bit.${antId}`] = sim.state.tick;
  c.bb.noteTick = sim.state.tick;
  c.bb.lastHp = c.hp;
  pruneBiters(sim, c);
}

function pruneBiters(sim: Sim, c: Creature): void {
  const old = sim.state.tick - BITER_MEMORY_S * TICKS_PER_SECOND;
  for (const k of Object.keys(c.bb)) if (k.startsWith('bit.') && c.bb[k] < old) delete c.bb[k];
}

/** Distinct ants that hit the creature within the last `withinS` seconds. */
export function distinctBiters(sim: Sim, c: Creature, withinS: number): number {
  const since = sim.state.tick - withinS * TICKS_PER_SECOND;
  let n = 0;
  for (const k of Object.keys(c.bb)) if (k.startsWith('bit.') && c.bb[k] >= since) n++;
  return n;
}

/**
 * Per tick: deterrence decay, and hp lost without a report counts as a bite of a standard worker. Returns true
 * when such an unreported hit was detected this tick (the caller runs the kind's hit reaction).
 */
export function hitBookkeeping(sim: Sim, c: Creature): boolean {
  if (c.deterrence > 0) c.deterrence = c.deterrence < 1e-4 ? 0 : c.deterrence * DECAY_PER_TICK;
  const last = c.bb.lastHp ?? c.hp;
  let unreported = false;
  if (c.hp < last - 1e-9 && c.bb.noteTick !== sim.state.tick) {
    recordHit(sim, c, -1, 'bite');
    unreported = true;
  }
  c.bb.lastHp = c.hp;
  return unreported;
}
