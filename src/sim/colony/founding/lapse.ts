// The first-brood time-lapse (GDD 06 §5.11; GDD 08 §7.10 `player.timelapse`): the real simulation keeps running,
// tick by tick, with the queen's care automated (care.ts); the game only chooses how many ticks it runs per frame
// (watching or skipping reach the same end tick with the same state). This file starts the lapse, keeps the
// overlay record (progress, stage, counters, beats) and decides its end: first eclosion + 0.4 GD.

import type { Ant, Nest, OpeningState, Sim, TimelapseState } from '@/sim/types';
import { FOUND_END_AFTER_ECLOSION_GD, TIMELAPSE_BEATS, TIMELAPSE_SPAN_GUESS_GD } from '@/sim/balance/founding';
import { TICKS_PER_DAY } from '@/sim/time';
import { isWorkerCaste } from '../census';
import { FB, bbGet, playerColonyOf, setPhase, speciesOf } from './access';
import { cellTempC } from './clutch';
import { devTimeGd } from './model';

/** Beat names by playback fraction (GDD 06 §5.11 script). */
const BEAT_NAMES = ['eggs', 'larvae', 'pupae', 'cocoons', 'eclosion', 'final'] as const;

export function beatAt(p: number): (typeof BEAT_NAMES)[number] {
  let i = 0;
  while (i < TIMELAPSE_BEATS.length && p >= TIMELAPSE_BEATS[i]) i++;
  return BEAT_NAMES[i];
}

/** Counts for the overlay: brood by stage, adult workers, eggs eaten and brood lost, reserves 0..1. */
export function lapseCounters(sim: Sim, q: Ant | undefined): Record<string, number> {
  const col = playerColonyOf(sim);
  const c: Record<string, number> = { eggs: 0, larvae: 0, pupae: 0, workers: 0, eaten: 0, lost: 0, reserves: 0 };
  if (!col) return c;
  for (const b of sim.stores.brood.list) {
    if (!b.alive || b.colony !== col.id) continue;
    if (b.stage === 'egg') c.eggs++;
    else if (b.stage === 'larva') c.larvae++;
    else c.pupae++;
  }
  for (const a of sim.stores.ants.list) if (a.alive && a.colony === col.id && isWorkerCaste(a.caste)) c.workers++;
  if (q) {
    const laid = q.queen?.founding?.eggsLaid ?? 0;
    c.eaten = bbGet(q, FB.eaten, 0);
    c.lost = Math.max(0, laid - (c.eggs + c.larvae + c.pupae) - bbGet(q, FB.eclosed, 0));
    const f = q.queen?.founding;
    c.reserves = f ? Math.max(0, f.reserveLoads / f.R0) : 0;
  }
  return c;
}

/**
 * Re-estimates the end tick from the development of the most advanced brood item so far (the real chamber
 * temperature varies; the first guess used the temperature at the start). Keeps the progress bar honest.
 */
function reestimateEnd(sim: Sim, tl: TimelapseState): void {
  const col = playerColonyOf(sim);
  const def = speciesOf(sim);
  const g = def.life.stageGd, total = g.egg + g.larva + g.pupa;
  let best = 0;
  for (const b of sim.stores.brood.list) {
    if (!b.alive || (col && b.colony !== col.id)) continue;
    const done = b.stage === 'egg' ? b.progress * g.egg : b.stage === 'larva' ? g.egg + b.progress * g.larva : g.egg + g.larva + b.progress * g.pupa;
    if (done > best) best = done;
  }
  const frac = best / total, elapsed = sim.state.tick - tl.startTick;
  if (frac < 0.05 || elapsed <= 0) return;
  tl.endTick = tl.startTick + Math.round(elapsed / frac + FOUND_END_AFTER_ECLOSION_GD * TICKS_PER_DAY);
}

/** Starts the lapse: phase, records; from now on the queen's care is automatic. */
export function beginLapse(sim: Sim, op: OpeningState, q: Ant, nest: Nest, skipped = false): void {
  const def = speciesOf(sim);
  const span = devTimeGd(def, cellTempC(sim, nest, q));
  const guess = Number.isFinite(span) ? span + FOUND_END_AFTER_ECLOSION_GD : TIMELAPSE_SPAN_GUESS_GD;
  const start = sim.state.tick;
  op.lapse = { startTick: start, endTick: -1, skipped, outcome: '' };
  const tl: TimelapseState = {
    kind: 'founding', startTick: start, endTick: start + Math.round(guess * TICKS_PER_DAY), progress: 0, stage: 'eggs',
    counters: lapseCounters(sim, q), interrupt: null,
  };
  sim.state.player.timelapse = tl;
  // She stays possessed (the camera stays with her in the cell) but her care is automatic: her intent is held at
  // rest for the whole lapse (system.ts), so watching and skipping run the same simulation.
  setPhase(sim, op, 'timelapse');
  sim.emit({ type: 'opening.timelapse', kind: 'start', p: 0, spanGd: guess, hazard: null });
}

/**
 * Per-tick lapse bookkeeping. Returns 'end' when the lapse is over (first eclosion + 0.4 GD reached), 'empty'
 * when every brood item is gone before any worker eclosed, else null.
 */
export function lapseTick(sim: Sim, op: OpeningState, q: Ant): 'end' | 'empty' | null {
  const tl = sim.state.player.timelapse;
  const lapse = op.lapse;
  if (!tl || !lapse) return null;
  const col = playerColonyOf(sim);
  const now = sim.state.tick;
  if (lapse.endTick < 0 && bbGet(q, FB.eclosed, 0) > 0) {
    lapse.endTick = now + Math.round(FOUND_END_AFTER_ECLOSION_GD * TICKS_PER_DAY);
    tl.endTick = lapse.endTick;
  }
  if (lapse.endTick < 0 && now % 100 === 0) reestimateEnd(sim, tl);
  const span = Math.max(1, tl.endTick - tl.startTick);
  const p = Math.min(lapse.endTick < 0 ? 0.999 : 1, Math.max(tl.progress, (now - tl.startTick) / span));
  const before = beatAt(tl.progress);
  tl.progress = p;
  if (now % 10 === 0 || p >= 1) {
    tl.counters = lapseCounters(sim, q);
    tl.stage = beatAt(p);
    if (tl.stage !== before) sim.emit({ type: 'opening.timelapse', kind: 'beat', p, spanGd: span / TICKS_PER_DAY, hazard: null });
    else if (now % 100 === 0) sim.emit({ type: 'opening.timelapse', kind: 'progress', p, spanGd: span / TICKS_PER_DAY, hazard: null });
  }
  if (lapse.endTick >= 0 && now >= lapse.endTick) return 'end';
  if (lapse.endTick < 0 && (tl.counters.eggs + tl.counters.larvae + tl.counters.pupae) === 0 && now % 10 === 0) {
    const live = col ? sim.state.brood.some((b) => b.alive && b.colony === col.id) : false;
    if (!live) return 'empty';
  }
  return null;
}
