// Lifecycle shells of bite, bite-hold, spray-acid, sting, dodge, release-alarm and tend-aphid (GDD 01 §7.3). Reach,
// cooldowns, charges and events live here; damage, locks, the bite/special permissions, the dodge displacement and
// droplets are delegated to their owners (combat, ecology) through the ports. Combat no longer patches this table.

import type { ActionFailReason, Ant, Sim, TargetRef } from '@/sim/types';
import {
  ALARM_PUFF, BITE_CYCLE_S, SPRAY_DAMAGE_PER_MG23, BITE_S, RELEASE_ALARM_COOLDOWN_S, RELEASE_ALARM_S, SPRAY_ALARM, SPRAY_CONE_DEG, SPRAY_COOLDOWN_S,
  SPRAY_RANGE_L, SPRAY_RELEASE_S, SPRAY_WINDUP_S, TEND_APHID_STROKE_S, ACID_REGEN_S,
} from '@/sim/balance/actions';
import { BITE_PER_MG23 } from '@/sim/balance';
import { STING_S, STING_WINDUP_S } from '@/sim/balance/combat';
import { TICKS_PER_SECOND } from '@/sim/time';
import { antLengthMm, inReach, placeOf } from '../geometry';
import { ports } from '../ports';
import type { ActionDef } from '../types';
import { antCasteDef } from '../workRate';

/** Cooldowns of the shells, absolute ticks in ant.bb (`cd.<action>`; 0 = ready). */
function onCooldown(sim: Sim, ant: Ant, key: string): boolean {
  return sim.state.tick < (ant.bb[key] ?? 0);
}

function hostileCheck(sim: Sim, ant: Ant, t: TargetRef): ActionFailReason | null {
  if (t.kind === 'ant') {
    const other = sim.stores.ants.get(t.id);
    if (!other || other.id === ant.id) return 'no-target';
    return other.colony === ant.colony ? 'not-allowed-here' : null;
  }
  return sim.stores.creatures.has(t.id) ? null : 'no-target';
}

/** Bite damage of the ant (GDD 05 §4.1: fixed caste stats or 1.0 x mg^(2/3) x mandible factor). */
export function biteDamage(sim: Sim, ant: Ant): number {
  const cd = antCasteDef(sim, ant);
  if (cd?.fixedStats) return cd.fixedStats.bite;
  return BITE_PER_MG23 * Math.pow(ant.massMg, 2 / 3) * (cd ? cd.mandibleFactor : 1);
}


/** Bite cycle of the ant's caste, s (GDD 05 §4.1: shared by the AI and the player); BITE_CYCLE_S without one. */
function biteCycleS(sim: Sim, ant: Ant): number {
  const s = ports.combatStats(sim, ant)?.biteCycleS;
  return s !== undefined && s > 0 ? s : BITE_CYCLE_S;
}

export const biteDef: ActionDef = {
  id: 'bite', kind: 'timed', targets: ['ant', 'creature'], preempts: true, cancellable: true, pose: 'bite',
  // no fixed cue: combat emits `bite` with the target's hardness as its strength (audio crunch on hard prey only)
  cue: null,
  check: (sim, ant, t) => hostileCheck(sim, ant, t) ?? (onCooldown(sim, ant, 'cd.bite') ? 'cooldown' : null)
    ?? (ports.combatMayBite(sim, ant, t.kind, t.id) ? null : 'blocked'), // stunned, or pinned and not facing it
  durationS: () => BITE_S,
  onBegin: (sim, ant) => { ant.bb['cd.bite'] = sim.state.tick + Math.max(1, Math.round(biteCycleS(sim, ant) * TICKS_PER_SECOND)); },
  // combat resolves the bite with the attacker named: hit chance, M(n), armour, events, the hardness cue
  effect: (sim, ant, t) => ports.applyDamage(sim, t.kind, t.id, biteDamage(sim, ant), 'combat', ant.id),
};

/** `sting` (myrmicines; GDD 05 §4.4): contact, venom and repellent are combat's. */
export const stingDef: ActionDef = {
  id: 'sting', kind: 'timed', targets: ['ant', 'creature'], preempts: true, cancellable: true, pose: 'sting', cue: null,
  windupFrac: STING_WINDUP_S / STING_S,
  check: (sim, ant, t) => ports.combatStingRefusal(sim, ant, t),
  reachable: (sim, ant, t) => ports.combatStingContact(sim, ant, t),
  durationS: () => STING_S,
  effect: (sim, ant, t) => ports.combatStingHit(sim, ant, t.kind === 'creature' ? 'creature' : 'ant', t.id),
};

/** `dodge` (GDD 05 §4.8): instant here; combat's movement override then carries the 3 L displacement. */
export const dodgeDef: ActionDef = {
  id: 'dodge', kind: 'instant', targets: ['none'], cancellable: false, preempts: true, pose: 'hurry', cue: null,
  check: (sim, ant) => ports.combatDodgeRefusal(sim, ant),
  durationS: () => 0,
  effect: (sim, ant) => (ports.combatStartDodge(sim, ant) ? 1 : 'blocked'),
};

export const biteHoldDef: ActionDef = {
  id: 'bite-hold', kind: 'continuous', targets: ['ant', 'creature'], cancellable: true, ignoresDamage: true,
  scalesWithWork: false, pose: 'hold', cue: 'grapple',
  check: hostileCheck,
  durationS: () => 0,
  // The lock itself (slots, pair lock, holder slow-down, dragging) is the combat module's.
  tick(sim, ant, t) {
    if (ant.combat?.lock) return ant.combat.lock.targetId === t.id ? 'continue' : 'done';
    if (ant.bb['act.held'] === 1) return 'done'; // held before, lock lost
    if (!ports.beginGrapple(sim, ant.id, t.kind === 'ant' ? 'ant' : 'creature', t.id)) return 'blocked';
    ant.bb['act.held'] = 1;
    return 'continue';
  },
  onEnd: (sim, ant) => {
    ant.bb['act.held'] = 0;
    ports.releaseGrapple(sim, ant.id);
  },
};

const hitPlace = { pos: { x: 0, y: 0, z: 0 }, radius: 0 };

/** Hostile ants and creatures inside the spray cone (60°, 1.5 L), in id order. */
function sprayTargets(sim: Sim, ant: Ant): TargetRef[] {
  const range = SPRAY_RANGE_L * antLengthMm(sim, ant);
  const out: TargetRef[] = [];
  const ids: number[] = [];
  const consider = (kind: 'ant' | 'creature', id: number): void => {
    const t = { kind, id, pos: { x: 0, y: 0, z: 0 } };
    const p = placeOf(sim, ant, t, hitPlace);
    if (p && inReach(sim, ant, p, range, SPRAY_CONE_DEG / 2)) out.push({ kind, id, pos: { ...p.pos } });
  };
  for (const id of sim.index.queryAnts(ant.pos, range * 2, ids).slice().sort((a, b) => a - b)) {
    const other = sim.stores.ants.get(id);
    if (other && other.colony !== ant.colony) consider('ant', id);
  }
  for (const id of sim.index.queryCreatures(ant.pos, range * 2, ids).slice().sort((a, b) => a - b)) consider('creature', id);
  return out;
}

export const sprayAcidDef: ActionDef = {
  id: 'spray-acid', kind: 'timed', targets: ['none'], preempts: true, cancellable: true, pose: 'spray',
  cue: 'acid-spray', windupFrac: SPRAY_WINDUP_S / (SPRAY_WINDUP_S + SPRAY_RELEASE_S),
  check: (sim, ant) => (ports.combatSprayDisabled(ant) ? 'conditions' // gaster wound: the special does not work
    : ant.acid < 1 ? 'no-reserve' : onCooldown(sim, ant, 'cd.spray') ? 'cooldown' : null),
  durationS: () => SPRAY_WINDUP_S + SPRAY_RELEASE_S,
  effect(sim, ant) {
    if (ant.acid < 1) return 'no-reserve';
    const tick = sim.state.tick;
    ant.acid -= 1;
    if (ant.acidRegenTick <= tick) ant.acidRegenTick = tick + acidRegenTicks(sim, ant);
    ant.bb['cd.spray'] = tick + SPRAY_COOLDOWN_S * TICKS_PER_SECOND;
    ports.deposit(sim, ant.colony, 'alarm', ant.pos, SPRAY_ALARM);
    const colony = sim.stores.colonies.get(ant.colony);
    const std = (colony ? sim.getSpecies(colony.species)?.stdMassMg : undefined) ?? 1;
    const dmg = SPRAY_DAMAGE_PER_MG23 * Math.pow(ant.massMg / std, 2 / 3);
    const hits = sprayTargets(sim, ant);
    for (const h of hits) ports.applyDamage(sim, h.kind, h.id, dmg, 'combat', ant.id);
    return hits.length;
  },
};

/** Ticks per acid charge for the ant's species. */
export function acidRegenTicks(sim: Sim, ant: Ant): number {
  const colony = sim.stores.colonies.get(ant.colony);
  const acid = colony ? sim.getSpecies(colony.species)?.combat.acid : null;
  return (acid?.regenS ?? ACID_REGEN_S) * TICKS_PER_SECOND;
}

export const releaseAlarmDef: ActionDef = {
  id: 'release-alarm', kind: 'timed', targets: ['none'], preempts: true, cancellable: true, pose: 'alarm',
  cue: 'alarm-burst',
  check: (sim, ant) => (onCooldown(sim, ant, 'cd.alarm') ? 'cooldown' : null),
  durationS: () => RELEASE_ALARM_S,
  effect(sim, ant) {
    ant.bb['cd.alarm'] = sim.state.tick + RELEASE_ALARM_COOLDOWN_S * TICKS_PER_SECOND;
    ports.deposit(sim, ant.colony, 'alarm', ant.pos, ALARM_PUFF);
    ports.raiseAlarm(sim, ant.colony, ant.pos, ALARM_PUFF);
    return ALARM_PUFF;
  },
};

export const tendAphidDef: ActionDef = {
  id: 'tend-aphid', kind: 'timed', targets: ['source', 'creature'], cancellable: true, repeatable: true,
  pose: 'stroke', cue: 'antennate',
  check(sim, ant, t) {
    if (t.kind === 'source') {
      const s = sim.stores.sources.get(t.id);
      if (!s || s.herdId < 0) return 'no-target';
    } else if (sim.stores.creatures.get(t.id)?.kind !== 'aphid') return 'no-target';
    return ant.cropC + ant.cropP >= ant.cropCap - 1e-9 ? 'crop-full' : null;
  },
  durationS: () => TEND_APHID_STROKE_S,
  // Tier 2: the droplet (APHID_DROPLET from the herd's buffer) is the ecology-plants task's; tending is recorded.
  effect(sim, ant, t) {
    if (t.kind === 'source') {
      const s = sim.stores.sources.get(t.id);
      if (s) s.tendedBy = ant.colony;
    }
    return 0;
  },
};
