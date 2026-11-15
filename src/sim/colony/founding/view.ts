// A plain-data read of the opening for the game flow and the UI (no state is changed here): phase, the queen's
// meters, the site read-out, readiness, clutch and forecast, the time-lapse record and the outcome.

import type { OpeningPhase, Sim, SiteWord, FoundingFailCause, SpeciesId } from '@/sim/types';
import { SITE_FACTORS } from '@/sim/types';
import { TICKS_PER_DAY } from '@/sim/time';
import { FB, bbGet, foundingNest, foundingQueen, openingOf, phaseAgeGd, queenOf, speciesOf } from './access';
import { clutchForecast, clutchLimit, eggsLaid } from './clutch';
import { desiccationRate, reserveDrainPerGd } from './exposure';
import { failCauseOf } from './failure';
import { undoRefusal } from './commands';
import { lapseCounters } from './lapse';
import { readoutActive } from './readout';
import { factorWord, siteProfile } from './siteScore';

export interface FoundingView {
  phase: OpeningPhase;
  attempt: number;
  retriesLeft: number;
  /** "Undo founding: try another site" is offered now (GDD 06 §5.14: failure card, or until the first lay). */
  canUndo: boolean;
  /** Queen meters 0..1 (null after hand-over). */
  reserves: number | null;
  desiccation: number | null;
  health: number | null;
  /** Rates per GD (UI arrows), 0 when unknown. */
  reserveDrainPerGd: number;
  desiccationPerGd: number;
  wings: boolean;
  /** Site read-out (null when none showing in `search`); in later phases the dig site's values. */
  site: { active: boolean; factors: { id: string; value: number; word: string }[]; q: number; word: SiteWord | null } | null;
  /** Readiness bars (dig / seal): total R, depth and volume 0..1, ready flag. */
  readiness: { r: number; depth: number; volume: number; ready: boolean } | null;
  sealed: boolean;
  clutch: { eggs: number; batches: number; limit: number; forecast: { expected: number; range: [number, number]; reserves: number; safeEggs: number } | null } | null;
  /** Game days since sealing (lay prompt after 1 GD). */
  sealedGd: number;
  timelapse: { progress: number; stage: string; counters: Record<string, number>; skipped: boolean; startTick: number; endTick: number } | null;
  outcome: { workers: number; reserves: number } | null;
  failCause: FoundingFailCause | null;
}

export function foundingView(sim: Sim): FoundingView | null {
  const op = openingOf(sim);
  if (!op) return null;
  const q = foundingQueen(sim);
  const anyQueen = queenOf(sim);
  const nest = foundingNest(sim);
  const f = q?.queen?.founding ?? null;
  const def = speciesOf(sim);
  const prof = siteProfile(def.id as SpeciesId);
  const rawOf = (id: string): number | undefined => {
    const key = id === 'moisture' ? FB.siteTheta : id === 'warmth' ? FB.siteTempC : null;
    const v = key && q ? q.bb[key] : undefined;
    return v === undefined ? undefined : v;
  };
  const showSite = op.siteFactors.length === SITE_FACTORS.length && (op.siteWord !== null || op.siteQ > 0);
  const site = showSite ? {
    active: op.phase === 'search' ? (q ? readoutActive(sim, q) : false) : op.phase === 'dig',
    factors: SITE_FACTORS.map((id, i) => ({ id, value: op.siteFactors[i] ?? 0, word: factorWord(id, op.siteFactors[i] ?? 0, rawOf(id), prof.toptC) })),
    q: op.siteQ, word: op.siteWord,
  } : null;
  let readiness: FoundingView['readiness'] = null;
  if (nest?.founding && (op.phase === 'dig' || op.phase === 'seal' || op.phase === 'search') && nest.founding.state !== 'site-search') {
    const vmin = def.opening.vMinBu3, bu = sim.world.bu;
    const dmin = def.opening.dMinOpenBu;
    readiness = {
      r: nest.founding.readiness,
      depth: Math.min(1, op.shaftDepthBu / dmin),
      volume: Math.min(1, (op.chamberVoxels * (sim.carve.voxel / bu) ** 3) / vmin),
      ready: nest.founding.state === 'ready' || nest.founding.state === 'sealed',
    };
  }
  let clutch: FoundingView['clutch'] = null;
  if (q && nest && (op.phase === 'lay' || op.phase === 'timelapse')) {
    const eggs = eggsLaid(q);
    const fc = eggs > 0 ? clutchForecast(sim, op, q, nest, eggs) : null;
    clutch = {
      eggs, batches: op.layBatches, limit: clutchLimit(sim, q, nest),
      forecast: fc ? { expected: fc.expected, range: fc.range, reserves: fc.reserves, safeEggs: fc.safeEggs } : null,
    };
  }
  const tl = sim.state.player.timelapse;
  const timelapse = tl && tl.kind === 'founding' ? {
    progress: tl.progress, stage: tl.stage, counters: { ...tl.counters }, skipped: op.lapse?.skipped ?? false,
    startTick: tl.startTick, endTick: tl.endTick,
  } : null;
  let outcome: FoundingView['outcome'] = null;
  const m = /^workers:(\d+);reserves:([\d.]+)/.exec(op.lapse?.outcome ?? '');
  if (m) outcome = { workers: Number(m[1]), reserves: Number(m[2]) };
  else if (op.phase === 'timelapse' && q) {
    const c = lapseCounters(sim, q);
    outcome = { workers: c.workers, reserves: c.reserves };
  }
  const sealedTick = nest?.founding?.sealedTick ?? -1;
  return {
    phase: op.phase, attempt: op.attempt,
    retriesLeft: Math.max(0, sim.state.config.difficulty.params.openingRetries - op.retriesUsed),
    canUndo: undoRefusal(sim) === null,
    reserves: f ? Math.max(0, f.reserveLoads / f.R0) : null,
    desiccation: f ? f.desiccation : null,
    health: q ? q.hp / q.maxHp : anyQueen && anyQueen.alive ? anyQueen.hp / anyQueen.maxHp : null,
    reserveDrainPerGd: q && f ? reserveDrainPerGd(sim, q) / f.R0 : 0,
    desiccationPerGd: q && f ? desiccationRate(sim, q) : 0,
    wings: f ? f.wings : false,
    site, readiness, sealed: op.sealed, clutch,
    sealedGd: sealedTick >= 0 ? (sim.state.tick - sealedTick) / TICKS_PER_DAY : 0,
    timelapse, outcome, failCause: failCauseOf(op),
  };
}

/** Phase age (GD) of the founding queen; exported for the flow's prompts. */
export function foundingPhaseAgeGd(sim: Sim): number {
  return phaseAgeGd(sim, foundingQueen(sim));
}

/** Dig bites the queen has started so far (diagnostics, tests). */
export function foundingBites(sim: Sim): number {
  const q = foundingQueen(sim);
  return q ? bbGet(q, FB.bites, 0) : 0;
}
