// Context-prompt target selection (GDD 01 §9.1-9.2): candidates in reach, priority classes, scoring, and the
// hysteresis that keeps the prompt from flickering between two equally good targets.

import type { ActionFailReason, ActionId, Ant, Sim, TargetRef } from '@/sim/types';
import { TARGET_KINDS } from '@/sim/types';
import {
  PROMPT_ANGLE_WEIGHT, PROMPT_CLASS_WEIGHT, PROMPT_DIST_WEIGHT, PROMPT_HYSTERESIS, PROMPT_QUERY_PAD_BU, PROMPT_SWITCH_REAL_S,
  REACH_CONE_DEG,
} from '@/sim/balance/actions';
import { TICKS_PER_SECOND } from '@/sim/time';
import { carriedItem } from '../actions/carry';
import { entranceAtThroat, inLayingPlace } from '../actions/defs';
import { isPlugPellet } from '../actions/defs/dig';
import {
  bearingDeg, contactDistance, findEntrance, inReach, mandiblePoint, placeOf, reachMm, selfTarget, type TargetPlace,
} from '../actions/geometry';
import { canDo } from '../actions/runner';
import { isFoodItem, isLiquidSource, isPickableSource, isTearSource } from '../actions/sourceKinds';
import { casteAllows } from '../actions/workRate';
import { CTL } from './controlState';

export type PromptClass = keyof typeof PROMPT_CLASS_WEIGHT;

/** One target the possessed ant could act on, with its best actions and score. */
export interface PromptCandidate {
  target: TargetRef;
  cls: PromptClass;
  /** E tap / E hold actions; null = none. */
  primary: ActionId;
  secondary: ActionId | null;
  score: number;
  /** Whether the primary action can start now, and why not. */
  ok: boolean;
  reason: ActionFailReason | null;
}

interface Classified {
  cls: PromptClass;
  primary: ActionId;
  secondary: ActionId | null;
}

const COMMITMENTS: readonly ActionId[] = ['drag', 'bite-hold', 'hitchhike'];

function hasProtein(sim: Sim, ant: Ant): boolean {
  const it = carriedItem(sim, ant);
  return ant.cropP > 1e-9 || (it !== undefined && isFoodItem(it) && it.p > 1e-9) || ant.queen?.founding != null;
}

/** Priority class and actions for a target (null = nothing to do with it from the E key). */
function classify(sim: Sim, ant: Ant, t: TargetRef): Classified | null {
  switch (t.kind) {
    case 'brood': {
      const b = sim.stores.brood.get(t.id);
      if (!b) return null;
      if (ant.carry.kind === 'brood') return { cls: 'receiver', primary: 'put-down', secondary: null };
      if (b.stage === 'larva' && hasProtein(sim, ant)) return { cls: 'receiver', primary: 'feed-larva', secondary: 'groom' };
      return { cls: 'brood', primary: 'pick-up', secondary: 'groom' };
    }
    case 'item': {
      const it = sim.stores.items.get(t.id);
      if (!it || it.carrierIds.length > 0) return null;
      if (isFoodItem(it)) return { cls: 'food', primary: 'pick-up', secondary: it.bulk > ant.carryCap ? 'drag' : null };
      if (it.kind === 'live-aphid') return { cls: 'livestock', primary: 'pick-up', secondary: null };
      return { cls: 'item', primary: 'pick-up', secondary: null };
    }
    case 'source': {
      const s = sim.stores.sources.get(t.id);
      if (!s) return null;
      if (s.herdId >= 0) return { cls: 'livestock', primary: 'tend-aphid', secondary: null };
      if (isLiquidSource(sim, s)) return { cls: 'food', primary: 'harvest-liquid', secondary: null };
      if (isPickableSource(sim, s, ant.carryCap)) return { cls: 'food', primary: 'pick-up', secondary: null };
      return isTearSource(sim, s) ? { cls: 'food', primary: 'harvest-solid', secondary: null } : null;
    }
    case 'ant': {
      const a = sim.stores.ants.get(t.id);
      return a && a.id !== ant.id && a.colony === ant.colony ? { cls: 'nestmate', primary: 'groom', secondary: null } : null;
    }
    case 'creature':
      return sim.stores.creatures.get(t.id)?.kind === 'aphid' ? { cls: 'livestock', primary: 'tend-aphid', secondary: null } : null;
    case 'entrance': {
      const e = findEntrance(sim, t.id)?.entrance;
      if (!e) return null;
      const plugged = e.status === 'sealed' || e.status === 'sealing';
      if (isPlugPellet(carriedItem(sim, ant)) && e.status !== 'sealed') {
        return { cls: 'receiver', primary: 'seal-entrance', secondary: 'put-down' };
      }
      return plugged ? { cls: 'structure', primary: 'unseal-entrance', secondary: null } : null;
    }
    case 'none': {
      // Class 9: the queen in a chamber lays; carrying puts down; anything else grooms itself.
      if (ant.caste === 'queen' && casteAllows(sim, ant, 'lay-egg') && ant.carry.kind === 'none' && inLayingPlace(sim, ant)) {
        return { cls: 'self', primary: 'lay-egg', secondary: 'groom' };
      }
      return { cls: 'self', primary: ant.carry.kind !== 'none' ? 'put-down' : 'groom', secondary: null };
    }
    default:
      return null;
  }
}

const place: TargetPlace = { pos: { x: 0, y: 0, z: 0 }, radius: 0 };
const mp = { x: 0, y: 0, z: 0 };
const ids: number[] = [];

/**
 * Largest target radius among living entities of a kind, mm. The spatial index finds entities by their centre, so
 * a wide target (a spill, carrion) whose edge is in reach is only found when the query is widened by its radius.
 */
function largestRadiusMm(sim: Sim, ant: Ant, kind: 'item' | 'source' | 'creature'): number {
  const list = kind === 'item' ? sim.stores.items.list : kind === 'source' ? sim.stores.sources.list : sim.stores.creatures.list;
  let max = 0;
  for (const e of list) {
    if (!e.alive) continue;
    const p = placeOf(sim, ant, { kind, id: e.id, pos: e.pos }, place);
    if (p && p.radius > max) max = p.radius;
  }
  return max;
}

function considered(sim: Sim, ant: Ant): TargetRef[] {
  const out: TargetRef[] = [];
  if (ant.action && COMMITMENTS.includes(ant.action.id)) out.push(ant.action.target);
  const m = mandiblePoint(sim, ant, mp);
  const reach = reachMm(sim, ant);
  // Brood and ants are never wider than PROMPT_QUERY_PAD_BU; the other kinds are widened by their largest radius.
  const r = reach + PROMPT_QUERY_PAD_BU * sim.world.bu;
  const wide = (kind: 'item' | 'source' | 'creature'): number => Math.max(r, reach + largestRadiusMm(sim, ant, kind));
  const add = (kind: TargetRef['kind'], list: number[]): void => {
    for (const id of list.slice().sort((a, b) => a - b)) if (!(kind === 'ant' && id === ant.id)) out.push({ kind, id, pos: { x: 0, y: 0, z: 0 } });
  };
  add('brood', sim.index.queryBrood(m, r, ids));
  add('item', sim.index.queryItems(m, wide('item'), ids));
  add('source', sim.index.querySources(m, wide('source'), ids));
  add('ant', sim.index.queryAnts(m, r, ids));
  add('creature', sim.index.queryCreatures(m, wide('creature'), ids));
  const e = entranceAtThroat(sim, ant, () => true);
  if (e) out.push({ kind: 'entrance', id: e.id, pos: { ...e.pos } });
  out.push(selfTarget(ant));
  return out;
}

/** Every applicable target in reach, best first (score desc, then target kind, then id: deterministic). */
export function promptCandidates(sim: Sim, ant: Ant): PromptCandidate[] {
  const reach = reachMm(sim, ant);
  const out: PromptCandidate[] = [];
  for (const raw of considered(sim, ant)) {
    const p = placeOf(sim, ant, raw, place);
    if (!p) continue;
    const t: TargetRef = { kind: raw.kind, id: raw.id, pos: { ...p.pos } };
    const commitment = ant.action !== null && COMMITMENTS.includes(ant.action.id) && raw === ant.action.target;
    if (!commitment && t.kind !== 'none' && t.kind !== 'entrance' && !inReach(sim, ant, p)) continue;
    const c: Classified | null = commitment && ant.action
      ? { cls: 'commitment', primary: ant.action.id, secondary: null } : classify(sim, ant, t);
    if (!c) continue;
    const d = t.kind === 'none' ? 0 : contactDistance(sim, ant, p);
    const ang = t.kind === 'none' ? 0 : bearingDeg(ant, p.pos);
    const score = PROMPT_CLASS_WEIGHT[c.cls] - PROMPT_DIST_WEIGHT * (d / reach) - PROMPT_ANGLE_WEIGHT * (ang / REACH_CONE_DEG);
    const check = commitment ? { ok: true, reason: null } : canDo(sim, ant, c.primary, t);
    out.push({ target: t, cls: c.cls, primary: c.primary, secondary: c.secondary, score, ok: check.ok, reason: check.reason });
  }
  return out.sort(compareCandidates);
}

function compareCandidates(a: PromptCandidate, b: PromptCandidate): number {
  return b.score - a.score || TARGET_KINDS.indexOf(a.target.kind) - TARGET_KINDS.indexOf(b.target.kind) || a.target.id - b.target.id;
}

function sameTarget(c: PromptCandidate, kind: number, id: number): boolean {
  return TARGET_KINDS.indexOf(c.target.kind) === kind && c.target.id === id;
}

/** Real seconds one tick stands for at the current run speed. */
function realTickS(sim: Sim): number {
  return 1 / TICKS_PER_SECOND / Math.max(1, sim.state.env.time.speed);
}

function setStored(ant: Ant, kKey: string, iKey: string, c: PromptCandidate | null): void {
  ant.bb[kKey] = c ? TARGET_KINDS.indexOf(c.target.kind) : -1;
  ant.bb[iKey] = c ? c.target.id : -1;
}

/**
 * Per-tick prompt selection with hysteresis (GDD 01 §9.1 rule 3): the current target gets +PROMPT_HYSTERESIS and
 * a new winner must lead for PROMPT_SWITCH_REAL_S real seconds before it takes over (the prompt is presentation,
 * so the delay follows the run speed like the AFK clock). State lives in ant.bb (deterministic).
 */
export function updatePromptSelection(sim: Sim, ant: Ant): PromptCandidate | null {
  const list = promptCandidates(sim, ant);
  if (list.length === 0) {
    setStored(ant, CTL.promptKind, CTL.promptId, null);
    setStored(ant, CTL.challKind, CTL.challId, null);
    return null;
  }
  const cur = list.find((c) => sameTarget(c, ant.bb[CTL.promptKind] ?? -1, ant.bb[CTL.promptId] ?? -1)) ?? null;
  let best = list[0];
  for (const c of list) if (c !== best && c.score + (c === cur ? PROMPT_HYSTERESIS : 0) > best.score + (best === cur ? PROMPT_HYSTERESIS : 0)) best = c;
  if (!cur || best === cur) {
    setStored(ant, CTL.promptKind, CTL.promptId, best);
    setStored(ant, CTL.challKind, CTL.challId, null);
    return best;
  }
  if (sameTarget(best, ant.bb[CTL.challKind] ?? -1, ant.bb[CTL.challId] ?? -1)) {
    const led = (ant.bb[CTL.challRealS] ?? 0) + realTickS(sim);
    ant.bb[CTL.challRealS] = led;
    if (led >= PROMPT_SWITCH_REAL_S - 1e-9) {
      setStored(ant, CTL.promptKind, CTL.promptId, best);
      setStored(ant, CTL.challKind, CTL.challId, null);
      return best;
    }
  } else {
    setStored(ant, CTL.challKind, CTL.challId, best);
    ant.bb[CTL.challRealS] = 0;
  }
  return cur;
}

/** The selected candidate without advancing the hysteresis (queries): the stored target if still valid, else best. */
export function selectedCandidate(sim: Sim, ant: Ant): PromptCandidate | null {
  const list = promptCandidates(sim, ant);
  return list.find((c) => sameTarget(c, ant.bb[CTL.promptKind] ?? -1, ant.bb[CTL.promptId] ?? -1)) ?? list[0] ?? null;
}
