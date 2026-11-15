// Engage and retreat decisions (GDD 05 §3.6, §4.5, §4.6, §4.9): the attack roll of an encounter, θ_fight by role,
// the recruit cap, the retreat thresholds and the stance directive. Pure queries over state.

import type { Ant, Colony, Sim } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import {
  ATTACK_MASS_CLAMP, ATTACK_SKIRMISH_ADD, ATTACK_TRUCE_MULT, ATTACK_VS_FOUNDING_QUEEN, FIGHT_RECRUIT_MIN,
  FIGHT_RECRUIT_SHARE, FIGHT_RECRUIT_SHARE_INVADED, RETREAT_RADIUS_L, RETREAT_RATIO, STANCE_ATTACK_MULT,
  TERR_CLAIM_MIN, TERR_CLAIM_RATIO, TERR_FACTOR, TERR_NEAR_ENTRANCE_BU, THETA_FIGHT_FRONT, THETA_FIGHT_NURSE,
  THETA_FIGHT_NURSE_INVADED, THETA_FIGHT_SURFACE,
} from '@/sim/balance/combat';
import { getRivalSpecies } from '@/sim/species';
import { relationOf } from '@/sim/rivals';
import { combatStats, fightStrength, healthOf, retreatHealth } from './stats';
import { antLenMm, combatFlags, dist, isParalysed, isPossessed, isSeized } from './state';

const ids: number[] = [];

/** Aggression of a colony: the rival model's agg, else the species base aggression. */
export function colonyAggression(sim: Sim, col: Colony | undefined): number {
  if (!col) return 0.5;
  if (col.rival) return col.rival.agg;
  return sim.getSpecies(col.species)?.combat.aggression ?? getRivalSpecies(col.species)?.aggression ?? 0.5;
}

export type TerritoryKind = 'own' | 'contested' | 'foreign' | 'none';

/** Claim state of the cell under p for a colony (GDD 05 §3.5), 'none' when there is no territory grid. */
export function territoryAt(sim: Sim, colonyId: number, p: { x: number; z: number }): TerritoryKind {
  const t = sim.state.rivals.territory;
  if (t.marks.length === 0 || t.cell <= 0) return 'none';
  const cx = Math.floor(p.x / t.cell), cz = Math.floor(p.z / t.cell);
  if (cx < 0 || cz < 0 || cx >= t.w || cz >= t.h) return 'none';
  const base = (cz * t.w + cx) * t.slots;
  const mine = t.slotColony.indexOf(colonyId);
  let best = -1, bestV = 0, second = 0;
  for (let s = 0; s < t.slots; s++) {
    const v = t.marks[base + s];
    if (v > bestV) { second = bestV; bestV = v; best = s; } else if (v > second) second = v;
  }
  if (bestV < TERR_CLAIM_MIN) return 'none';
  if (second >= TERR_CLAIM_MIN && bestV < TERR_CLAIM_RATIO * second) {
    return mine >= 0 && t.marks[base + mine] >= TERR_CLAIM_MIN ? 'contested' : 'foreign';
  }
  return best === mine ? 'own' : 'foreign';
}

function nearOwnEntrance(sim: Sim, ant: Ant): boolean {
  const col = sim.stores.colonies.get(ant.colony);
  if (!col) return false;
  const r = TERR_NEAR_ENTRANCE_BU * sim.world.bu;
  for (const nid of col.nestIds) {
    const n = sim.stores.nests.get(nid);
    if (n) for (const e of n.entrances) if (dist(e.pos, ant.pos) <= r) return true;
  }
  return ant.nestId >= 0 && sim.stores.nests.get(ant.nestId)?.colony === ant.colony;
}

/** terrF of the attack roll. */
export function territoryFactor(sim: Sim, ant: Ant): number {
  if (nearOwnEntrance(sim, ant)) return TERR_FACTOR.nearEntrance;
  const k = territoryAt(sim, ant.colony, ant.pos);
  return k === 'own' ? TERR_FACTOR.own : k === 'foreign' ? TERR_FACTOR.foreign : TERR_FACTOR.contested;
}

/** stanceF: the player colony's stance directive (other colonies 1). */
export function stanceFactor(sim: Sim, col: Colony | undefined): number {
  if (!col || !col.isPlayer) return 1;
  return STANCE_ATTACK_MULT[col.directives.stance] ?? 1;
}

/** A founding queen of the player colony on gentle is never attacked (GDD 05 §3.10). */
function protectedQueen(sim: Sim, other: Ant): boolean {
  if (other.caste !== 'queen' || (other.flags & AntFlag.FOUNDING) === 0) return false;
  const col = sim.stores.colonies.get(other.colony);
  return !!col && col.isPlayer && sim.state.config.difficulty.preset === 'gentle';
}

/**
 * Attack roll probability of `ant` against `other` on recognition (GDD 05 §3.6):
 * p = agg x terrF x stanceF x clamp(myMass / theirMass, 0.5, 1.5)^0.5 (x1.5 against a founding queen), capped 1;
 * truce x0.6, skirmish +0.1 in contested cells.
 */
export function attackChance(sim: Sim, ant: Ant, other: Ant): number {
  if (protectedQueen(sim, other)) return 0;
  const col = sim.stores.colonies.get(ant.colony);
  const ratio = Math.min(ATTACK_MASS_CLAMP[1], Math.max(ATTACK_MASS_CLAMP[0], ant.massMg / Math.max(1e-6, other.massMg)));
  let p = colonyAggression(sim, col) * territoryFactor(sim, ant) * stanceFactor(sim, col) * Math.sqrt(ratio);
  if (other.caste === 'queen' && (other.flags & AntFlag.FOUNDING) !== 0) p *= ATTACK_VS_FOUNDING_QUEEN;
  const rel = relationOf(sim, ant.colony, other.colony);
  if (rel === 'truce') p *= ATTACK_TRUCE_MULT;
  else if (rel === 'skirmish' && territoryAt(sim, ant.colony, ant.pos) === 'contested') p += ATTACK_SKIRMISH_ADD;
  return Math.max(0, Math.min(1, p));
}

/** θ_fight of an ant (GDD 05 §4.5): front-line roles 0.3, other surface workers 0.5, nurses 0.9 (0.6 if invaded). */
export function fightThreshold(sim: Sim, ant: Ant, nestInvaded: boolean): number {
  const t = ant.task;
  if (t === 'forage' || t === 'scout' || t === 'tend' || t === 'guard' || t === 'patrol' || t === 'fight') return THETA_FIGHT_FRONT;
  if (t === 'nurse' || t === 'queen-care') return nestInvaded && ant.nestId >= 0 ? THETA_FIGHT_NURSE_INVADED : THETA_FIGHT_NURSE;
  return THETA_FIGHT_SURFACE;
}

/** Recruit cap of a colony: max(10, 25 % of its workers), 60 % while its nest is invaded. */
export function recruitCap(col: Colony, nestInvaded: boolean): number {
  const share = nestInvaded ? FIGHT_RECRUIT_SHARE_INVADED : FIGHT_RECRUIT_SHARE;
  return Math.max(FIGHT_RECRUIT_MIN, Math.floor(share * col.livingAnts));
}

/** Hostile and friendly fighting strength within RETREAT_RADIUS_L of the ant (friendly includes the ant). */
export function localStrength(sim: Sim, ant: Ant): { hostile: number; friendly: number } {
  const r = RETREAT_RADIUS_L * antLenMm(sim, ant);
  sim.index.queryAnts(ant.pos, r, ids);
  let hostile = 0, friendly = 0;
  for (const id of ids) {
    const a = sim.stores.ants.get(id);
    if (!a || !a.alive || dist(a.pos, ant.pos) > r) continue;
    if (a.colony === ant.colony) friendly += fightStrength(sim, a);
    else hostile += fightStrength(sim, a);
  }
  if (!ids.includes(ant.id)) friendly += fightStrength(sim, ant);
  return { hostile, friendly };
}

export type RetreatReason = 'health' | 'outnumbered' | null;

/**
 * Should the ant retreat now (GDD 05 §4.6)? Health below RETREAT_HEALTH (0.35 outside, 0.15 in its own nest,
 * species overrides), or hostile strength within 5 L >= 2.5 x friendly outside own-claimed ground. Pinned or
 * seized ants cannot flee; `cheat.combatFlags {noRetreat}` disables it.
 */
export function retreatReason(sim: Sim, ant: Ant): RetreatReason {
  if (combatFlags(sim).noRetreat) return null;
  if (ant.combat?.pinned || isSeized(ant) || isParalysed(sim, ant)) return null;
  if (healthOf(ant) < retreatHealth(sim, ant)) return 'health';
  if (territoryAt(sim, ant.colony, ant.pos) === 'own') return null;
  const s = localStrength(sim, ant);
  return s.hostile > 0 && s.hostile >= RETREAT_RATIO * s.friendly ? 'outnumbered' : null;
}

/** An ant the colony's AI may send into a fight (worker castes, not possessed, not dormant). */
export function canFight(ant: Ant): boolean {
  return ant.alive && !isPossessed(ant) && (ant.flags & AntFlag.DORMANT) === 0
    && (ant.caste === 'worker' || ant.caste === 'minor' || ant.caste === 'media' || ant.caste === 'major');
}

/** Combat stats shortcut for behaviours (bite cycle etc.). */
export { combatStats };
