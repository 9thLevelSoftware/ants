// Colony stages (GDD 06 §7): descriptive, never gating. `founding` -> `first-workers` (>= 1 adult worker) ->
// `growing` (N >= growThreshold) -> `mature` (N >= matureThreshold and colony age >= matureAgeYears); a mature
// colony returns to `growing` below STAGE_MATURE_HYSTERESIS x matureThreshold (a note, not a failure). Thresholds
// are in simulated workers, scaled by the difficulty's matureGateMult. Flags: orphaned, declining, dormant.

import type { Sim, SpeciesDef, StageId } from '@/sim/types';
import { SEASONS } from '@/sim/types';
import {
  STAGE_DECLINE_DAYS, STAGE_DECLINE_FRAC, STAGE_MATURE_AGE_BY_PRESET, STAGE_MATURE_HYSTERESIS,
} from '@/sim/balance';
import { calendarTick, currentSeason, dayOf, daysPerYear } from '@/sim/time';
import { colonyAgeDays, memGet, memSet, playerColony, type Census } from './engine';
import { addJournal } from './journal';

export interface StageThresholds {
  grow: number;
  mature: number;
  matureAgeYears: number;
}

export function stageThresholds(species: SpeciesDef, preset: string, matureGateMult: number): StageThresholds {
  const age = STAGE_MATURE_AGE_BY_PRESET[species.id]?.[preset] ?? species.reproduction.matureAgeYears;
  return {
    grow: species.scale.growThreshold * matureGateMult,
    mature: species.scale.matureThreshold * matureGateMult,
    matureAgeYears: age,
  };
}

/** The stage that follows `prev` for N workers at a colony age (pure; the table test in stage.test.ts). */
export function nextStage(prev: StageId, workers: number, ageYears: number, t: StageThresholds): StageId {
  if (prev === 'founding' && workers < 1) return 'founding';
  if (prev === 'mature') return workers < STAGE_MATURE_HYSTERESIS * t.mature ? 'growing' : 'mature';
  if (workers >= t.mature && ageYears >= t.matureAgeYears) return 'mature';
  if (prev === 'growing' || workers >= t.grow) return 'growing';
  return 'first-workers';
}

export function thresholdsOf(sim: Sim): StageThresholds {
  const d = sim.state.config.difficulty;
  const mult = typeof d.params.matureGateMult === 'number' ? d.params.matureGateMult : 1;
  return stageThresholds(sim.species, d.preset, mult);
}

export function colonyAgeYears(sim: Sim): number {
  return colonyAgeDays(sim) / daysPerYear(sim.state.config);
}

/** Marks the stage for re-evaluation at the next poll (a stage-relevant event). */
export function markStageDirty(sim: Sim): void {
  memSet(sim, 'stageDirty', 1);
}

/** Daily bookkeeping at local midnight and stage changes; returns true when the stage changed. */
export function evaluateStage(sim: Sim, census: Census): boolean {
  const st = sim.state.progression.stage;
  const col = playerColony(sim);
  if (!col) return false;
  const day = dayOf(calendarTick(sim.state));
  const newDay = st.lastEvalTick < 0 || dayOf(st.lastEvalTick + sim.state.env.calendar.startTick) !== day;
  if (!newDay && memGet(sim, 'stageDirty') === 0) return false;
  memSet(sim, 'stageDirty', 0);
  st.flags.orphaned = col.orphanedAtTick >= 0 || sim.state.progression.milestones['ms-queen-lost'] !== undefined;
  st.flags.dormant = sim.state.env.winter.phase === 'lapse';
  if (newDay) {
    st.lastEvalTick = sim.state.tick;
    const hist = st.popAtEval;
    const oldest = hist.length >= STAGE_DECLINE_DAYS ? hist[hist.length - STAGE_DECLINE_DAYS] : 0;
    const winter = currentSeason(sim.state) === SEASONS[3];
    st.flags.declining = !winter && oldest > 0 && census.workers <= (1 - STAGE_DECLINE_FRAC) * oldest;
    hist.push(census.workers);
    while (hist.length > STAGE_DECLINE_DAYS) hist.shift();
  }
  const to = nextStage(st.id, census.workers, colonyAgeYears(sim), thresholdsOf(sim));
  if (to === st.id) return false;
  const from = st.id;
  st.id = to;
  sim.emit({ type: 'stage.changed', from, to });
  addJournal(sim, 'stage', `stage.${to}`, {}, from === 'mature' ? [`from:${from}`] : []);
  return true;
}
