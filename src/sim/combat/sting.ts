// The myrmicine `sting` (GDD 05 §4.4, GDD 01 §7.3 T3; rival Tetramorium / Myrmica / fugax in T2): in contact
// (a lock either way, or within 0.3 L), wind-up 0.3 s of a 0.6 s strike, damage 2.0 x m^(2/3) x venom over 2 s
// (rival-only species: their catalogue sting damage), cooldown 5 s; the thief ant's repellent sting also makes the
// target flee for 3 s. The action library has no `sting` shell yet, so combat registers this one (dodge.ts).

import type { ActionFailReason, Ant, Sim, TargetRef } from '@/sim/types';
import {
  ALARM_BITTEN, STING_ACID_S, STING_CONTACT_L, STING_COOLDOWN_S, STING_PER_MG23, STING_REPEL_SPECIES, STING_S, STING_VENOM,
  STING_WINDUP_S,
} from '@/sim/balance/combat';
import type { ActionDef } from '@/sim/ants/actions/types';
import { getRivalSpecies } from '@/sim/species';
import { noteCreatureHit } from '@/sim/ecology/creatures';
import { sprayDisabled } from './acid';
import { alarmBurst } from './alarm';
import { startRetreat } from './fight';
import { noteFightActivity } from './fightRecord';
import { combatStats } from './stats';
import { antLenMm, bodyOf, bodyPos, bodyRadius, CB, dist, ensureCombat, ticksOf } from './state';

function speciesOf(sim: Sim, ant: Ant): string {
  return sim.stores.colonies.get(ant.colony)?.species ?? sim.species.id;
}

/** Damage of one sting of this ant. */
export function stingDamage(sim: Sim, ant: Ant): number {
  const sp = speciesOf(sim, ant);
  const rival = getRivalSpecies(sp as never);
  if (rival && rival.special === 'sting') return rival.specialPower;
  return STING_PER_MG23 * Math.pow(Math.max(0, ant.massMg), 2 / 3) * (STING_VENOM[sp] ?? 1);
}

/** In contact for a sting: a lock either way, or bodies within 0.3 L. */
function inContact(sim: Sim, ant: Ant, t: TargetRef): boolean {
  const l = ant.combat?.lock;
  if (l && l.targetKind === t.kind && l.targetId === t.id) return true;
  if (t.kind === 'ant' && ant.combat?.heldBy.includes(t.id)) return true;
  const b = bodyOf(sim, t.kind, t.id);
  if (!b) return false;
  return dist(ant.pos, bodyPos(b)) - ant.radius - bodyRadius(b) <= STING_CONTACT_L * antLenMm(sim, ant);
}

function stingRefusal(sim: Sim, ant: Ant, t: TargetRef): ActionFailReason | null {
  if (combatStats(sim, ant).special !== 'sting') return 'species';
  if (sprayDisabled(ant)) return 'conditions';
  const b = bodyOf(sim, t.kind, t.id);
  if (!b) return 'no-target';
  if (b.kind === 'ant' && b.ant.colony === ant.colony) return 'not-allowed-here';
  if ((ant.combat?.specialCdTick ?? 0) > sim.state.tick) return 'cooldown';
  return inContact(sim, ant, t) ? null : 'out-of-reach';
}

/** The sting's effect on its target: venom over 2 s, the repellent flee, events. Returns the venom scheduled. */
export function stingHit(sim: Sim, ant: Ant, kind: 'ant' | 'creature', id: number): number {
  const b = bodyOf(sim, kind, id);
  if (!b) return 0;
  ensureCombat(ant).specialCdTick = sim.state.tick + ticksOf(STING_COOLDOWN_S);
  const total = stingDamage(sim, ant);
  const bb = b.kind === 'ant' ? b.ant.bb : b.c.bb;
  const ticks = Math.max(1, ticksOf(STING_ACID_S));
  bb[CB.acidLeft] = (bb[CB.acidLeft] ?? 0) + total;
  bb[CB.acidRate] = Math.max(bb[CB.acidRate] ?? 0, total / ticks);
  bb[CB.acidBy] = ant.id;
  noteFightActivity(sim, ant);
  if (b.kind === 'creature') noteCreatureHit(sim, id, ant.id, 'sting');
  else {
    noteFightActivity(sim, b.ant);
    alarmBurst(sim, b.ant.colony, b.ant.pos, ALARM_BITTEN, 'stung', ant.id);
    if (STING_REPEL_SPECIES.includes(speciesOf(sim, ant))) startRetreat(sim, b.ant);
  }
  sim.emit({ type: 'combat-hit', attackerId: ant.id, targetId: id, dmg: total, kind: 'sting' });
  return total;
}

export const stingDef: ActionDef = {
  id: 'sting', kind: 'timed', targets: ['ant', 'creature'], preempts: true, cancellable: true, pose: 'sting', cue: null,
  windupFrac: STING_WINDUP_S / STING_S,
  check: (sim, ant, t) => stingRefusal(sim, ant, t),
  reachable: (sim, ant, t) => inContact(sim, ant, t),
  durationS: () => STING_S,
  effect: (sim, ant, t) => stingHit(sim, ant, t.kind === 'creature' ? 'creature' : 'ant', t.id),
};
