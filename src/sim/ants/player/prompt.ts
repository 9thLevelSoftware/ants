// The context prompt for the HUD (GDD 01 §9): the selected target's primary / secondary action, the extra key
// lines (dig, share food, foot, inspect, colony orders) and plain-text labels with disabled reasons. Read-only.

import type { ActionFailReason, ActionId, ActionPrompt, Ant, Sim, TargetRef } from '@/sim/types';
import { FLOOR_NORMAL_MIN, TROPH_DONOR_MIN } from '@/sim/balance/actions';
import { carriedItem } from '../actions/carry';
import { canDo } from '../actions/runner';
import { isPossessed } from '../actions/workRate';
import { carriersNeeded } from './inspect';
import { selectedCandidate, type PromptCandidate } from './targeting';

/** Input action ids of GDD 01 §5.2 the lines belong to; the UI maps them to glyphs of the active device. */
export type PromptInput = 'interact' | 'interact-hold' | 'dig' | 'share-food' | 'foot' | 'inspect' | 'directives';

export interface PromptLine {
  input: PromptInput;
  actionId: ActionId | null;
  target: TargetRef | null;
  ok: boolean;
  reason: ActionFailReason | null;
  /** "Pick up larva", "Drink sugar — crop full". */
  text: string;
}

export interface PromptView {
  primary: PromptLine | null;
  secondary: PromptLine | null;
  /** Up to two further key lines, plus "Colony orders" for the queen after hand-over (never removed). */
  extras: PromptLine[];
}

const VERBS: Partial<Record<ActionId, string>> = {
  'pick-up': 'Pick up', 'put-down': 'Put down', 'feed-larva': 'Feed', groom: 'Groom', 'harvest-liquid': 'Drink',
  'harvest-solid': 'Tear off a piece', 'tend-aphid': 'Stroke', 'seal-entrance': 'Seal entrance',
  'unseal-entrance': 'Open entrance', 'lay-egg': 'Lay egg', drag: 'Pull', 'trophallaxis-give': 'Share food',
  'trophallaxis-receive': 'Beg food', 'dig-bite': 'Dig', drop: 'Drop', 'let-go': 'Let go', antennate: 'Inspect',
  'bite-hold': 'Let go of',
};

/** Lines that read without an object ("Dig", "Share food", "Seal entrance", "Inspect"). */
const NO_OBJECT: readonly ActionId[] = [
  'seal-entrance', 'unseal-entrance', 'lay-egg', 'harvest-solid', 'trophallaxis-give', 'trophallaxis-receive',
  'dig-bite', 'let-go', 'antennate',
];

const REASONS: Record<ActionFailReason, string> = {
  caste: 'not for this ant', species: 'not for this species', 'no-target': 'nothing here', 'out-of-reach': 'out of reach',
  blocked: 'busy', 'too-heavy': 'too heavy', 'crop-full': 'crop full', 'crop-empty': 'crop empty',
  'hands-full': 'mandibles full', 'not-diggable': 'cannot be dug', 'no-reserve': 'no reserve left', cooldown: 'not yet',
  conditions: 'not now', 'not-allowed-here': 'not here', budget: 'no strength left today',
};

/** Plain noun for a target (GDD 01 §9.3 object names). */
export function objectName(sim: Sim, ant: Ant, t: TargetRef | null): string {
  if (!t) return '';
  switch (t.kind) {
    case 'brood': return sim.stores.brood.get(t.id)?.stage ?? 'brood';
    case 'item': {
      const it = sim.stores.items.get(t.id);
      if (!it) return 'item';
      if (it.kind === 'soil-pellet') return 'soil pellet';
      if (it.kind === 'leaf-fragment') return 'leaf piece';
      if (it.kind === 'live-aphid') return 'aphid';
      return it.kind === 'food-piece' ? (it.foodKind ?? 'crumb') : it.kind;
    }
    case 'source': return sim.stores.sources.get(t.id)?.kind ?? 'food';
    case 'ant': {
      const a = sim.stores.ants.get(t.id);
      if (!a) return 'ant';
      if (a.colony !== ant.colony) return 'stranger';
      return a.caste === 'queen' ? 'queen' : 'nestmate';
    }
    case 'creature': return sim.stores.creatures.get(t.id)?.kind ?? 'creature';
    case 'entrance': return 'entrance';
    case 'none': return 'yourself';
    default: return '';
  }
}

function lineText(sim: Sim, ant: Ant, id: ActionId, t: TargetRef | null, ok: boolean, reason: ActionFailReason | null): string {
  const verb = VERBS[id] ?? id;
  let object = NO_OBJECT.includes(id) ? '' : objectName(sim, ant, t);
  if (id === 'put-down' || id === 'drop') {
    const it = carriedItem(sim, ant);
    object = it ? objectName(sim, ant, { kind: 'item', id: it.id, pos: it.pos }) : ant.carry.kind === 'brood' ? objectName(sim, ant, { kind: 'brood', id: ant.carry.id, pos: ant.pos }) : '';
  }
  if (id === 'groom' && t?.kind === 'none') object = 'yourself';
  const text = object ? `${verb} ${object}` : verb;
  if (ok || !reason) return text;
  const needs = reason === 'too-heavy' ? carriersFor(sim, ant, t) : 0;
  return needs > 1 ? `${text} — ${REASONS[reason]} (needs about ${needs})` : `${text} — ${REASONS[reason]}`;
}

/** Ants needed to carry the target item or source unit (GDD 01 §9.3 "too heavy (needs about 3)"); 0 if none. */
function carriersFor(sim: Sim, ant: Ant, t: TargetRef | null): number {
  if (t?.kind === 'item') { const it = sim.stores.items.get(t.id); return it ? carriersNeeded(it.bulk, ant.carryCap) : 0; }
  if (t?.kind === 'source') { const s = sim.stores.sources.get(t.id); return s ? carriersNeeded(s.unitBulk, ant.carryCap) : 0; }
  return 0;
}

function line(sim: Sim, ant: Ant, input: PromptInput, id: ActionId, t: TargetRef | null, known?: PromptCandidate): PromptLine {
  const check = known ? { ok: known.ok, reason: known.reason } : canDo(sim, ant, id, t);
  return { input, actionId: id, target: t, ok: check.ok, reason: check.reason, text: lineText(sim, ant, id, t, check.ok, check.reason) };
}

/** In the air (nuptial flight): no ground action applies, so no prompt is offered ("Groom yourself" during a flight). */
function flying(ant: Ant): boolean {
  return ant.medium === 'air' || ant.alate?.flightPhase != null;
}

/** The context prompt for the possessed ant (best action on what it faces); null for other ants or nothing. */
export function currentPrompt(sim: Sim, ant: Ant): ActionPrompt | null {
  if (!isPossessed(ant) || flying(ant)) return null;
  const c = selectedCandidate(sim, ant);
  return c ? { actionId: c.primary, target: c.target, ok: c.ok, reason: c.reason } : null;
}

/** The queen after hand-over opens Directives from possession ("I  Colony orders", GDD 01 §2). */
function colonyOrdersLine(sim: Sim, ant: Ant): PromptLine | null {
  const opening = sim.state.player.opening;
  if (ant.caste !== 'queen' || (opening !== null && !opening.done)) return null;
  return { input: 'directives', actionId: null, target: null, ok: true, reason: null, text: 'Colony orders' };
}

/** Full prompt for the HUD: primary, secondary and extra key lines. */
export function promptView(sim: Sim, ant: Ant): PromptView {
  const view: PromptView = { primary: null, secondary: null, extras: [] };
  if (!isPossessed(ant) || flying(ant)) return view;
  const c = selectedCandidate(sim, ant);
  if (c) {
    view.primary = line(sim, ant, 'interact', c.primary, c.target, c);
    if (c.secondary) view.secondary = line(sim, ant, 'interact-hold', c.secondary, c.target);
  }
  const extras: PromptLine[] = [];
  const dig = line(sim, ant, 'dig', 'dig-bite', null);
  if (dig.reason !== 'caste' && dig.reason !== 'species') extras.push(dig);
  if (c?.target.kind === 'ant' && c.cls === 'nestmate') {
    const give = ant.cropC + ant.cropP > TROPH_DONOR_MIN;
    extras.push(line(sim, ant, 'share-food', give ? 'trophallaxis-give' : 'trophallaxis-receive', c.target));
  }
  if (ant.up.y < FLOOR_NORMAL_MIN) extras.push(line(sim, ant, 'foot', 'let-go', null));
  else if (ant.carry.kind !== 'none') extras.push(line(sim, ant, 'foot', 'drop', null));
  if (c && c.target.kind !== 'none') extras.push(line(sim, ant, 'inspect', 'antennate', c.target));
  view.extras = extras.slice(0, 2);
  const orders = colonyOrdersLine(sim, ant);
  if (orders) view.extras.push(orders);
  return view;
}
