// Per-source intake bookkeeping for the diagnostics (which source fed which colony how much).
//
// A derived runtime record, NOT persisted: the contracts have no per-source intake field yet (reported). It holds
// the current and the previous game day; nothing in the simulation reads it, so losing it on load changes no
// behaviour, only the first day's diagnostics. Harvests are recorded here automatically; the colony module calls
// recordDelivery when a forager unloads food from a source.

import type { FoodKind, FoodVariant, Sim, SimState } from '@/sim/types';
import { TICKS_PER_DAY } from '@/sim/time';

export interface SourceIntake {
  sourceId: number;
  kind: FoodKind;
  variant: FoodVariant | null;
  /** Loads taken at the source by the colony's ants. */
  harvestedC: number;
  harvestedP: number;
  /** Loads delivered to the colony from this source. */
  deliveredC: number;
  deliveredP: number;
  /** Harvest actions that took something. */
  harvests: number;
}

interface DayBook {
  day: number;
  /** colony id -> source id -> intake */
  today: Record<string, Record<string, SourceIntake>>;
  yesterday: Record<string, Record<string, SourceIntake>>;
}

const books = new WeakMap<SimState, DayBook>();

function book(sim: Sim): DayBook {
  const day = Math.floor(sim.state.tick / TICKS_PER_DAY);
  let b = books.get(sim.state);
  if (!b) {
    b = { day, today: {}, yesterday: {} };
    books.set(sim.state, b);
  }
  if (b.day !== day) {
    b.yesterday = b.day === day - 1 ? b.today : {};
    b.today = {};
    b.day = day;
  }
  return b;
}

function entry(sim: Sim, colonyId: number, sourceId: number): SourceIntake {
  const t = book(sim).today;
  const col = (t[colonyId] ??= {});
  let e = col[sourceId];
  if (!e) {
    const s = sim.stores.sources.get(sourceId);
    e = {
      sourceId, kind: s?.kind ?? 'crumb', variant: s?.variant ?? null, harvestedC: 0, harvestedP: 0,
      deliveredC: 0, deliveredP: 0, harvests: 0,
    };
    col[sourceId] = e;
  }
  return e;
}

/** Records what a harvest took (called by harvest). */
export function recordHarvest(sim: Sim, colonyId: number, sourceId: number, c: number, p: number): void {
  const e = entry(sim, colonyId, sourceId);
  e.harvestedC += c;
  e.harvestedP += p;
  e.harvests++;
}

/** Hook for the colony module: a delivery of food that came from this source. */
export function recordDelivery(sim: Sim, colonyId: number, sourceId: number, c: number, p: number): void {
  if (sourceId < 0) return;
  const e = entry(sim, colonyId, sourceId);
  e.deliveredC += c;
  e.deliveredP += p;
}

/** Intake per source of a colony for today (default) or yesterday, largest delivered + harvested first. */
export function sourceIntake(sim: Sim, colonyId: number, day: 'today' | 'yesterday' = 'today'): SourceIntake[] {
  const b = book(sim);
  const col = (day === 'today' ? b.today : b.yesterday)[colonyId] ?? {};
  const total = (e: SourceIntake): number => e.deliveredC + e.deliveredP + e.harvestedC + e.harvestedP;
  return Object.values(col).sort((a, z) => total(z) - total(a) || a.sourceId - z.sourceId);
}
