// Progression API: milestones, journal, stage, codex, alerts, diagnostics aggregation, difficulty history, lineage
// record. STUB written by F1b/F1c with final signatures; owner: progression.

import type { ActiveAlert, CodexId, CommandHandlerMap, CustomRules, Diagnostic, MilestoneId, Sim, System } from '@/sim/types';
import {
  DIAGNOSTICS_EVERY, DIAGNOSTICS_OFFSET, DIFFICULTY_PARAMS, MILESTONE_THUMBS_MAX, resolveRules,
} from '@/sim/balance';
import { clonePlain } from '@/sim/entities';

/** Milestones, journal entries, aims, stage, codex observations. Stub: progression. */
export const progressionSystem: System = { name: 'progression', phase: 'progression', run: () => {} };
/** Collects module diagnostics, status hysteresis, alerts on status change. Stub: progression. */
export const diagnosticsSystem: System = {
  name: 'diagnostics', phase: 'progression', every: DIAGNOSTICS_EVERY, offset: DIAGNOSTICS_OFFSET, run: () => {},
};

export const systems: readonly System[] = [progressionSystem, diagnosticsSystem];

/** Alert fields a module supplies; progression fills id, ticks, count and acknowledgement. */
export type AlertRequest = Omit<ActiveAlert, 'id' | 'raisedTick' | 'updatedTick' | 'count' | 'acknowledged'>;

/** Raises or updates an alert (dedupe by kind:subjectId); returns its id, -1 if suppressed. Stub: -1. */
export function raiseAlert(_sim: Sim, _alert: AlertRequest): number {
  return -1;
}

export function clearAlert(_sim: Sim, _kind: ActiveAlert['kind'], _subjectId: number): void {}

/** Records a milestone once; true if newly reached. Stub: false. */
export function recordMilestone(_sim: Sim, _id: MilestoneId): boolean {
  return false;
}

/** Records a codex observation for this game (codexSeen) and emits `codex.unlocked` once; true if new. Stub: false. */
export function unlockCodex(_sim: Sim, _id: CodexId): boolean {
  return false;
}

/** Publishes (replaces) a diagnostic record by id; emits `diagnostic-changed` on status change. Stub: no-op. */
export function publishDiagnostic(_sim: Sim, _d: Diagnostic): void {}

/** Rules fixed at world generation (GDD 06 §14.1): setDifficulty never changes them mid-game. */
const GENERATION_RULES: readonly (keyof CustomRules)[] = ['seasonLengthDays', 'startSeason', 'rivals'];

export const commandHandlers: Partial<CommandHandlerMap> = {
  acknowledgeAlert: (sim, c) => {
    const a = sim.state.progression.alerts.find((x) => x.id === c.alertId);
    if (a) a.acknowledged = true;
  },
  storeThumbnail: (sim, c) => {
    const list = sim.state.progression.milestoneThumbs.filter((t) => t.milestoneId !== c.milestoneId);
    list.push({ milestoneId: c.milestoneId, dataUrl: c.dataUrl });
    while (list.length > MILESTONE_THUMBS_MAX) list.shift();
    sim.state.progression.milestoneThumbs = list;
  },
  /** D4.18 / D1.12: a preset and/or rule overrides. Rules fixed at generation are never changed mid-game. */
  setDifficulty: (sim, c) => {
    const cfg = sim.state.config;
    const d = cfg.difficulty;
    if (c.preset !== undefined && c.preset !== d.preset) {
      d.preset = c.preset;
      d.params = clonePlain(DIFFICULTY_PARAMS[c.preset]);
      sim.state.progression.difficultyHistory.push({ tick: sim.state.tick, preset: c.preset });
    }
    const incoming: Partial<CustomRules> = { ...(c.custom ?? {}) };
    for (const k of GENERATION_RULES) delete incoming[k];
    const custom: Partial<CustomRules> = { ...d.custom, ...incoming };
    for (const k of Object.keys(custom) as (keyof CustomRules)[]) if (custom[k] === undefined) delete custom[k];
    d.custom = custom;
    const { seasonLengthDays, startSeason, rivals } = cfg.rules;
    cfg.rules = { ...resolveRules(d.preset, custom, seasonLengthDays), seasonLengthDays, startSeason, rivals };
  },
  'cheat.unlockCodex': (sim, c) => {
    sim.state.progression.codexSeen[c.id] = sim.state.tick;
  },
};
