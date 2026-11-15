// Shapes of the table-driven triggers (milestones, codex entries) and the helpers their predicates share.
// A rule fires at most once per game: from an event (`on`), from a state check (`poll`, every
// PROGRESSION_POLL_EVERY ticks), or right after a milestone (`afterMilestone`). A predicate returns the token values
// of the journal text when the rule fires, or null.

import type { Ant, Chamber, MilestoneId, Nest, Sim, SimEventOf, SimEventType, SpeciesId } from '@/sim/types';
import type { Census } from './engine';
import { playerColony } from './engine';
import type { Tokens } from './journal';

export type EventPredicates = { [K in SimEventType]?: (sim: Sim, e: SimEventOf<K>) => Tokens | null };

export interface PollContext {
  census: Census;
}

export interface TriggerRule<Id extends string> {
  id: Id;
  /** Species that have the mechanic; omitted = every species. */
  species?: readonly SpeciesId[];
  on?: EventPredicates;
  poll?: (sim: Sim, ctx: PollContext) => Tokens | null;
  afterMilestone?: MilestoneId;
}

/** "Fired, no tokens". A fresh object each time so no caller can share and mutate it. */
export const yes = (): Tokens => ({});
export const when = (cond: boolean): Tokens | null => (cond ? {} : null);

/** Index of rules by the event types they listen to. */
export function indexByEvent<Id extends string>(rules: readonly TriggerRule<Id>[]): Map<string, TriggerRule<Id>[]> {
  const m = new Map<string, TriggerRule<Id>[]>();
  for (const r of rules) {
    for (const type of Object.keys(r.on ?? {})) {
      const list = m.get(type) ?? [];
      list.push(r);
      m.set(type, list);
    }
  }
  return m;
}

export function speciesAllows(sim: Sim, rule: { species?: readonly SpeciesId[] }): boolean {
  return !rule.species || rule.species.includes(sim.state.config.species);
}

// ---- state helpers ----

export function playerNests(sim: Sim): Nest[] {
  const col = playerColony(sim);
  if (!col) return [];
  return sim.stores.nests.list.filter((n) => n.alive && n.colony === col.id);
}

export function playerChambers(sim: Sim): Chamber[] {
  const out: Chamber[] = [];
  for (const n of playerNests(sim)) out.push(...n.chambers);
  return out;
}

export function antOf(sim: Sim, id: number): Ant | undefined {
  return id >= 0 ? sim.stores.ants.get(id) : undefined;
}

export function isPlayerAntId(sim: Sim, id: number): boolean {
  const a = antOf(sim, id);
  const col = playerColony(sim);
  return !!a && !!col && a.colony === col.id;
}

export function broodIsPlayer(sim: Sim, broodId: number): boolean {
  const b = sim.stores.brood.get(broodId);
  const col = playerColony(sim);
  return !!b && !!col && b.colony === col.id;
}

/** True if the wood nest site (Camponotus, GDD 07 §6.2) belongs to the player colony. */
export function isPlayerWoodSite(sim: Sim, siteId: number): boolean {
  return !!playerColony(sim)?.wood?.sites.some((s) => s.id === siteId);
}

/** The possessed ant, when there is one. */
export function possessedAnt(sim: Sim): Ant | undefined {
  return antOf(sim, sim.state.player.possessedAntId);
}

/** Variant of a food source (null when unknown or gone). */
export function sourceVariant(sim: Sim, sourceId: number): string | null {
  const s = sim.stores.sources.get(sourceId);
  return s ? (s.variant ?? null) : null;
}

/** Species of a colony by id ('' when unknown). */
export function colonySpecies(sim: Sim, colonyId: number): string {
  return sim.stores.colonies.get(colonyId)?.species ?? '';
}
