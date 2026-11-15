// Relations per unordered colony pair (GDD 05 §3.7): records, escalation gains, the state machine run by the
// hourly update, and the queries combat and the UI read. Light: types, balance and state helpers only.

import type { RelationState, RivalRelation, SimState } from '@/sim/types';
import {
  E_HALF_LIFE_GD, E_PEACE_BELOW, E_SKIRMISH_AT, E_SKIRMISH_DOWN, E_TENSION_AT, E_WAR_AT, E_WAR_DOWN, RIVAL_LEVERS,
  TRUCE_E_CAP, TRUCE_GD, WAR_MIN_N, WAR_STALE_GD,
} from '@/sim/balance/rivals';
import { TICKS_PER_DAY } from '@/sim/time';
import { pairOf, relExt, type StateCtx } from './state';

/** The relation record of a pair, undefined when the pair never met. */
export function findRelation(state: SimState, a: number, b: number): RivalRelation | undefined {
  const [x, y] = pairOf(a, b);
  return state.rivals.relations.find((r) => r.a === x && r.b === y);
}

/** The pair's record, created in `peace` when missing. */
export function ensureRelation(state: SimState, a: number, b: number): RivalRelation {
  const [x, y] = pairOf(a, b);
  let r = state.rivals.relations.find((q) => q.a === x && q.b === y);
  if (!r) {
    r = { a: x, b: y, state: 'peace', e: 0, stateSinceTick: state.tick, warFront: [] };
    state.rivals.relations.push(r);
  }
  return r;
}

/** Relation between two colonies ('peace' for a pair without a record or a colony with itself). */
export function relationOf(sim: { state: SimState }, a: number, b: number): RelationState {
  if (a === b) return 'peace';
  return findRelation(sim.state, a, b)?.state ?? 'peace';
}

/**
 * Whether ants of these colonies treat each other as foes: any two different living colonies. Whether a contact
 * becomes a fight is the encounter roll's (combat attackChance, which reads the relation state); peace only means
 * that most contacts end in a display.
 */
export function isHostile(sim: StateCtx, a: number, b: number): boolean {
  if (a === b) return false;
  return !!sim.stores.colonies.get(a) && !!sim.stores.colonies.get(b);
}

/** Adds escalation to a pair; gains are divided by the difficulty's warThresholdMult (GDD 05 §3.7, §5). */
export function addEscalation(sim: StateCtx, a: number, b: number, gain: number): void {
  if (a === b || gain <= 0 || !isHostile(sim, a, b)) return;
  const r = ensureRelation(sim.state, a, b);
  const mult = RIVAL_LEVERS[sim.state.config.difficulty.preset]?.warThresholdMult ?? 1;
  r.e += gain / mult;
  if (r.state === 'truce') r.e = Math.min(r.e, TRUCE_E_CAP);
}

/** Hourly decay factor of E (half-life E_HALF_LIFE_GD) for a step of dtGd. */
export function escalationDecay(dtGd: number): number {
  return Math.pow(0.5, dtGd / E_HALF_LIFE_GD);
}

export interface PairFacts {
  /** Abstract (rival) or simulated (player) worker counts of both colonies. */
  nA: number;
  nB: number;
  winter: boolean;
}

/**
 * The next state of a relation (GDD 05 §3.7 table, evaluated in table order until stable). `claimStale` = the war
 * lasted WAR_STALE_GD without a claim change. Returns the state after all transitions.
 */
export function nextState(r: RivalRelation, f: PairFacts, tick: number, claimStaleSince: number): RelationState {
  let s = r.state;
  for (let guard = 0; guard < 6; guard++) {
    const n = step(s, r, f, tick, claimStaleSince);
    if (n === s) break;
    s = n;
    if (s === 'truce') break; // truce lasts its day; nothing chains out of it within one update
  }
  return s;
}

function step(s: RelationState, r: RivalRelation, f: PairFacts, tick: number, claimStaleSince: number): RelationState {
  const e = r.e;
  switch (s) {
    case 'peace': return e >= E_TENSION_AT ? 'tension' : 'peace';
    case 'tension': return e >= E_SKIRMISH_AT ? 'skirmish' : e < E_PEACE_BELOW ? 'peace' : 'tension';
    case 'skirmish':
      if (e >= E_WAR_AT && f.nA >= WAR_MIN_N && f.nB >= WAR_MIN_N && !f.winter) return 'war';
      return e < E_SKIRMISH_DOWN ? 'tension' : 'skirmish';
    case 'war': {
      if (e < E_WAR_DOWN) return 'truce';
      const warStart = r.state === 'war' ? r.stateSinceTick : tick;
      const since = Math.max(warStart, claimStaleSince);
      return tick - since >= WAR_STALE_GD * TICKS_PER_DAY ? 'truce' : 'war';
    }
    case 'truce': {
      const since = r.state === 'truce' ? r.stateSinceTick : tick;
      if (tick - since < TRUCE_GD * TICKS_PER_DAY) return 'truce';
      return e >= E_SKIRMISH_AT ? 'skirmish' : 'tension';
    }
  }
}

/** The war-staleness reference tick of a pair (last claim change, never before the war began). */
export function claimStaleSince(state: SimState, r: RivalRelation): number {
  return relExt(state, r.a, r.b).claimChangeTick;
}

/** Removes every relation of a colony (destroyed). */
export function dropRelationsOf(state: SimState, colonyId: number): void {
  state.rivals.relations = state.rivals.relations.filter((r) => r.a !== colonyId && r.b !== colonyId);
  const m = state.rivals.module;
  if (m) m.relations = m.relations.filter((r) => r.a !== colonyId && r.b !== colonyId);
}

/** Is the colony at war with anyone (one war at a time, I9: the first war found)? */
export function warOf(state: SimState, colonyId: number): RivalRelation | undefined {
  return state.rivals.relations.find((r) => r.state === 'war' && (r.a === colonyId || r.b === colonyId));
}

/** Highest relation state of a colony with anyone, by escalation rank. */
export function worstRelation(state: SimState, colonyId: number): RelationState {
  const rank: Record<RelationState, number> = { peace: 0, truce: 1, tension: 2, skirmish: 3, war: 4 };
  let best: RelationState = 'peace';
  for (const r of state.rivals.relations) {
    if (r.a !== colonyId && r.b !== colonyId) continue;
    if (rank[r.state] > rank[best]) best = r.state;
  }
  return best;
}
