// Progression bookkeeping (progression.engine, plain data, created on first use) and small shared helpers:
// the date stamp of a record, the player colony and a cheap census of it.

import type { Ant, Colony, DateStamp, ProgressionEngineState, Sim } from '@/sim/types';
import { currentDayOfYear, currentYear, TICKS_PER_DAY } from '@/sim/time';

export function engineOf(sim: Sim): ProgressionEngineState {
  const p = sim.state.progression;
  if (!p.engine) {
    p.engine = {
      nextJournalId: p.journal.entries.reduce((m, e) => Math.max(m, e.id + 1), 1),
      nextAlertId: p.alerts.reduce((m, a) => Math.max(m, a.id + 1), 1),
      alertCleared: {}, aimQueue: [], mem: {}, hourAcc: {}, dayAcc: {}, recentDeathTicks: [], trails: {},
      seasonWeather: {}, weatherSeen: {},
    };
  }
  return p.engine;
}

/** Named number in the trigger memory (0 when unset). */
export function memGet(sim: Sim, key: string, fallback = 0): number {
  return engineOf(sim).mem[key] ?? fallback;
}

export function memSet(sim: Sim, key: string, v: number): void {
  engineOf(sim).mem[key] = v;
}

export function memAdd(sim: Sim, key: string, dv: number): number {
  const m = engineOf(sim).mem;
  m[key] = (m[key] ?? 0) + dv;
  return m[key];
}

export function dateNow(sim: Sim): DateStamp {
  return { tick: sim.state.tick, doy: currentDayOfYear(sim.state), year: currentYear(sim.state) };
}

/** The player's colony (colonies[0]); undefined before the game placed one. */
export function playerColony(sim: Sim): Colony | undefined {
  const c = sim.state.colonies[0];
  return c && c.isPlayer ? c : undefined;
}

export function isPlayerColonyId(sim: Sim, colonyId: number): boolean {
  const c = playerColony(sim);
  return !!c && c.id === colonyId;
}

/** True if the ant belongs to the player colony. */
export function isPlayerAnt(sim: Sim, ant: Ant | undefined): boolean {
  return !!ant && isPlayerColonyId(sim, ant.colony);
}

export const WORKER_CASTES: ReadonlySet<string> = new Set(['worker', 'minor', 'media', 'major']);

/** Live counts of the player colony, built by one pass over the ants (no caching: callers poll sparingly). */
export interface Census {
  /** Adult simulated workers N (no weights). */
  workers: number;
  /** Adults by caste. */
  byCaste: Record<string, number>;
  /** All living adults, queens included. */
  living: number;
  /** Workers outside the nest (on the surface, not in a cavity). */
  outside: number;
  queenAlive: boolean;
}

export function censusOf(sim: Sim): Census {
  const out: Census = { workers: 0, byCaste: {}, living: 0, outside: 0, queenAlive: false };
  const col = playerColony(sim);
  if (!col) return out;
  for (const a of sim.stores.ants.list) {
    if (!a.alive || a.colony !== col.id) continue;
    out.living++;
    out.byCaste[a.caste] = (out.byCaste[a.caste] ?? 0) + 1;
    if (WORKER_CASTES.has(a.caste)) {
      out.workers++;
      if (a.nestId < 0 && a.medium !== 'cavity') out.outside++;
    }
    if (a.caste === 'queen') out.queenAlive = true;
  }
  return out;
}

/** Colony age in game days since the first egg (or since the colony was placed when there was no founding). */
export function colonyAgeDays(sim: Sim): number {
  const ft = sim.state.env.calendar.foundingTick;
  const col = playerColony(sim);
  const from = ft >= 0 ? ft : col ? col.foundedTick : -1;
  return from < 0 ? 0 : Math.max(0, sim.state.tick - from) / TICKS_PER_DAY;
}
