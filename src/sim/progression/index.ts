// Progression API (GDD 06 §7-10, §5.13; GDD 08 §6, §4.4; GDD 02 §13-14): colony stages, milestones and the journal,
// aims, statistics series, the diagnostics registry with cause chains, the alert engine, codex observations, deaths,
// difficulty history. Owner: progression. Journal entries, alerts and aims in state carry ids and token values; the
// interface words them through src/content/text (never imported here).

import type { CodexId, CommandHandlerMap, CustomRules, Sim, System } from '@/sim/types';
import { allCodexIds } from '@/sim/types';
import {
  DIAGNOSTICS_EVERY, DIAGNOSTICS_OFFSET, DIFFICULTY_PARAMS, HOURLY_EVERY, MILESTONE_THUMBS_MAX, PROGRESSION_POLL_EVERY,
  PROGRESSION_POLL_OFFSET, PROGRESSION_STATS_OFFSET, resolveRules,
} from '@/sim/balance';
import { clonePlain } from '@/sim/entities';
import { censusOf } from './engine';
import { attachProgression } from './events';
import { triggersOnPoll, unlockCodex } from './milestones';
import { evaluateStage } from './stage';
import { evaluateAims } from './aims';
import { checkLastAnts } from './deaths';
import { sampleProgressionHour } from './stats';
import { acknowledgeAlert } from './alerts';
import { refreshDiagnostics } from './diagnostics';
import { detectDiscoveries } from './discovery';

export { raiseAlert, clearAlert, acknowledgeAlert, activeAlerts, alertKey, type AlertRequest } from './alerts';
export { recordMilestone, unlockCodex, hasMilestone } from './milestones';
export {
  publishDiagnostic, retractDiagnostic, getDiagnostic, rankedDiagnostics, overallStatus, causeChain, causeTree,
  worstCauseChain, sanitizeDiagnostic, DIAGNOSTIC_ALERTS, type CauseLink, type CauseNode,
} from './diagnostics';
export { journalEntries } from './journal';
export { currentAims, queenHandedOver, AIM_RULES } from './aims';
export { nextStage, stageThresholds, thresholdsOf, colonyAgeYears, type StageThresholds } from './stage';
export { attachProgression } from './events';
export { MILESTONE_RULES } from './milestoneRules';
export { CODEX_RULES } from './codexRules';
export { censusOf as progressionCensus } from './engine';
export {
  milestoneList, completedAims, eventLog, colonyHealth, historySeries, historySeriesIds, deathSummary, stageInfo,
  codexSeenIds, type DeathSummary,
} from './queries';

/** Polled checks: milestone and codex state triggers, stage, aims, `last-ants`, peak workers. */
function poll(sim: Sim): void {
  const census = censusOf(sim);
  const p = sim.state.progression;
  if (census.workers > p.peakWorkers) p.peakWorkers = census.workers;
  evaluateStage(sim, census);
  detectDiscoveries(sim);
  triggersOnPoll(sim, { census });
  evaluateAims(sim, census);
  checkLastAnts(sim, census);
}

/**
 * Milestones, journal entries, aims, stage, codex observations. Runs every tick only to install the event listener
 * before any flush (also after a load); the state checks run every PROGRESSION_POLL_EVERY ticks.
 */
export const progressionSystem: System = {
  name: 'progression', phase: 'progression',
  run: (sim) => {
    attachProgression(sim);
    if ((sim.state.tick + PROGRESSION_POLL_OFFSET) % PROGRESSION_POLL_EVERY === 0) poll(sim);
  },
};

/** Hourly statistics series of the journal graphs (GDD 06 §9.2). */
export const progressionStatsSystem: System = {
  name: 'progression-stats', phase: 'progression', every: HOURLY_EVERY, offset: PROGRESSION_STATS_OFFSET,
  run: (sim) => sampleProgressionHour(sim),
};

/** Keeps the registry clean: non-finite values from direct writers, status changes of records written directly. */
export const diagnosticsSystem: System = {
  name: 'diagnostics', phase: 'progression', every: DIAGNOSTICS_EVERY, offset: DIAGNOSTICS_OFFSET,
  run: (sim) => refreshDiagnostics(sim),
};

export const systems: readonly System[] = [progressionSystem, progressionStatsSystem, diagnosticsSystem];

/** Rules fixed at world generation (GDD 06 §14.1): setDifficulty never changes them mid-game. */
const GENERATION_RULES: readonly (keyof CustomRules)[] = ['seasonLengthDays', 'startSeason', 'rivals'];

const CODEX_ID_SET: ReadonlySet<string> = new Set(allCodexIds());

export const commandHandlers: Partial<CommandHandlerMap> = {
  acknowledgeAlert: (sim, c) => {
    acknowledgeAlert(sim, c.alertId);
  },
  storeThumbnail: (sim, c) => {
    const list = sim.state.progression.milestoneThumbs.filter((t) => t.milestoneId !== c.milestoneId);
    list.push({ milestoneId: c.milestoneId, dataUrl: c.dataUrl });
    while (list.length > MILESTONE_THUMBS_MAX) list.shift();
    sim.state.progression.milestoneThumbs = list;
  },
  /** D4.18 / D1.12: a preset and/or rule overrides. Rules fixed at generation are never changed mid-game. */
  setDifficulty: (sim, c) => {
    // Preset and rule values were checked by the command layer (commands.ts PAYLOAD_GUARDS).
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
    if (!CODEX_ID_SET.has(c.id)) {
      sim.emit({ type: 'command-rejected', commandType: 'cheat.unlockCodex', reason: 'unknown-id', detail: c.id });
      return;
    }
    unlockCodex(sim, c.id as CodexId);
  },
};
