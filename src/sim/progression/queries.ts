// Plain-data queries for the interface (journal, Colony health, alerts feed, codex): every function returns fresh
// copies, never live state.

import { tsToArray } from '@/core/timeSeries';
import type { AimId, Diagnostic, DiagnosticStatus, EventLogEntry, Sim, StageState } from '@/sim/types';
import { SEASONS } from '@/sim/types';
import { censusOf } from './engine';
import { overallStatus, rankedDiagnostics } from './diagnostics';
import { thresholdsOf, type StageThresholds } from './stage';

export function milestoneList(sim: Sim): { id: string; tick: number; doy: number; year: number }[] {
  const m = sim.state.progression.milestones;
  return Object.keys(m).map((id) => ({ id, ...m[id] })).sort((a, b) => a.tick - b.tick || a.id.localeCompare(b.id));
}

export function completedAims(sim: Sim): { id: AimId; doneTick: number }[] {
  return sim.state.progression.aims.filter((a) => a.state === 'done').map((a) => ({ id: a.id, doneTick: a.doneTick }));
}

export function eventLog(sim: Sim): EventLogEntry[] {
  return sim.state.progression.eventLog.map((e) => ({ ...e, focus: e.focus ? { ...e.focus, pos: { ...e.focus.pos } } : null, tokens: { ...(e.tokens ?? {}) } }));
}

/** The Colony health view: overall (worst) status and the ranked records. */
export function colonyHealth(sim: Sim): { overall: DiagnosticStatus; rows: Diagnostic[] } {
  return { overall: overallStatus(sim), rows: rankedDiagnostics(sim) };
}

/** A history series: the hourly ring oldest -> newest, or the daily values. Empty when the series does not exist. */
export function historySeries(sim: Sim, id: string, scale: 'hourly' | 'daily'): number[] {
  const h = sim.state.progression.history;
  if (scale === 'daily') return [...(h.daily[id] ?? [])];
  const ts = h.hourly[id];
  return ts ? tsToArray(ts) : [];
}

/** Ids of every series that has data, sorted. */
export function historySeriesIds(sim: Sim, scale: 'hourly' | 'daily'): string[] {
  const h = sim.state.progression.history;
  return Object.keys(scale === 'daily' ? h.daily : h.hourly).sort();
}

export interface DeathSummary {
  total: number;
  /** Top causes over the whole game, most first (at most 5). */
  top: { cause: string; n: number }[];
  bySeason: Record<string, number>;
  /** From the ring of recent deaths: counts by caste, by role (task at death) and surface vs underground. */
  recentByCaste: Record<string, number>;
  recentByRole: Record<string, number>;
  recentSurface: number;
  recentUnderground: number;
}

/** Causes of death (GDD 06 §9.3; the Epitaph reuses it). */
export function deathSummary(sim: Sim): DeathSummary {
  const d = sim.state.progression.deaths;
  const causes = Object.keys(d.byCause);
  const top = causes.map((cause) => ({ cause, n: d.byCause[cause] })).sort((a, b) => b.n - a.n || a.cause.localeCompare(b.cause)).slice(0, 5);
  const out: DeathSummary = {
    total: causes.reduce((n, c) => n + d.byCause[c], 0), top, bySeason: {}, recentByCaste: {}, recentByRole: {},
    recentSurface: 0, recentUnderground: 0,
  };
  SEASONS.forEach((s, i) => { out.bySeason[s] = d.bySeason[i] ?? 0; });
  for (const r of d.recent) {
    out.recentByCaste[r.caste] = (out.recentByCaste[r.caste] ?? 0) + 1;
    out.recentByRole[r.role] = (out.recentByRole[r.role] ?? 0) + 1;
    if (r.zone === null) out.recentUnderground++;
    else out.recentSurface++;
  }
  return out;
}

/** Stage with its flags, the thresholds in force and the current worker count. */
export function stageInfo(sim: Sim): { stage: StageState; thresholds: StageThresholds; workers: number } {
  const s = sim.state.progression.stage;
  return {
    stage: { ...s, flags: { ...s.flags }, popAtEval: [...s.popAtEval] },
    thresholds: thresholdsOf(sim),
    workers: censusOf(sim).workers,
  };
}

/** Codex ids observed in this game, oldest first. */
export function codexSeenIds(sim: Sim): string[] {
  const seen = sim.state.progression.codexSeen;
  return Object.keys(seen).sort((a, b) => seen[a] - seen[b] || a.localeCompare(b));
}
