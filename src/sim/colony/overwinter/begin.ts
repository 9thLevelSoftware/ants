// Begin of the overwintering (GDD 06 §6.2 "Release" and "Lapse"): the possessed ant is released, ants caught far
// outdoors may die of cold, the brood is fixed for winter (eggs hatch, cold pupae die), the aggregate model runs on the
// snapshot, its losses are applied to real ants and brood, the stores are set, the survivors age at the dormant rate
// and the clock moves to the first tick of spring. Everything after is presentation (the game's time-lapse).

import { rngFloat, rngShuffle, type RngState } from '@/core/rng';
import type { Ant, Brood, BroodDeathCause, Colony, DeathCause, Sim, SpeciesDef, WinterRecord } from '@/sim/types';
import { BroodFlag } from '@/sim/types';
import { killAnt } from '@/sim/entities';
import { difficultyValue, workerLifespanGd } from '@/sim/balance/difficulty';
import { releasePossessed } from '@/sim/ants/player/possession';
import { timeHandlers } from '@/sim/environment';
import { chamberTempC } from '../envAdapter';
import { calendarTick, currentYear, HOURS_PER_DAY, seasonLength, TICKS_PER_DAY, TICKS_PER_HOUR, ticksPerYear } from '@/sim/time';
import {
  OVERWINTER_OUTDOOR_DEATH_P, OVERWINTER_OUTDOOR_SAFE_BU, WINT_OLD_AGE_FRAC, WINT_PUPA_COLD_C, WINT_PUPA_COLD_DEATH,
  WINT_REPORT_SPRING_C_PER_WORKER, WINT_C_QUEEN, WINT_C_PER_LARVA, WINTER_ACTIVE_BROOD_SHARE, WINTER_ACTIVE_WINDOW_GD,
  WINT_ALERTED_CAUSES, WINT_HAZARD_WINDOW_SEASONS, WINT_LAPSE_LOSS_CAP_FRAC,
} from '@/sim/balance/lifecycle';
import { book } from '../core';
import { broodDies } from '../brood';
import { invalidateCensus, isWorkerCaste } from '../census';
import { countStageChange } from '../population';
import { lifecycleOf } from '../succession/lifecycleState';
import { clusterOf, winterClimate } from './climate';
import { capLapseLosses, dayNeedC, metFactor, runWinterModel, type WinterInput, type WinterParams } from './model';
import { rankWhy } from './report';

/** The model's parameters for a colony (species winter data, difficulty). */
export function winterParams(sim: Sim, def: SpeciesDef): WinterParams {
  return {
    tColdStress: def.winter.tColdStress, baseLoss: def.winter.wintBaseLoss, metBase: def.winter.wintMetBase,
    q10: def.winter.wintQ10, lossMult: difficultyValue(sim, 'winterLossMult'), queenDeathP: difficultyValue(sim, 'winterQueenDeathP'),
  };
}

function colonyAnts(sim: Sim, col: Colony): Ant[] {
  return sim.state.ants.filter((a) => a.alive && a.colony === col.id);
}

function colonyBrood(sim: Sim, col: Colony): Brood[] {
  return sim.state.brood.filter((b) => b.alive && b.colony === col.id);
}

/** Distance from `a` to the colony's nearest open entrance, BU (Infinity: none). */
function entranceDistBu(sim: Sim, col: Colony, a: Ant): number {
  let best = Infinity;
  for (const n of sim.state.nests) {
    if (!n.alive || n.colony !== col.id) continue;
    for (const e of n.entrances) best = Math.min(best, Math.hypot(e.pos.x - a.pos.x, e.pos.z - a.pos.z));
  }
  return best / sim.world.bu;
}

/** Ticks from now to the first tick (00:00) of the next spring. */
export function ticksToSpring(sim: Sim): number {
  const ct = calendarTick(sim.state);
  const year = ticksPerYear(sim.state.config);
  return (Math.floor(ct / year) + 1) * year - ct;
}

/** Whole game days of winter the model runs for a jump of `ticks` to spring (a part day counts as a day). */
export function winterDaysLeft(ticks: number): number {
  return Math.max(1, Math.ceil(ticks / TICKS_PER_DAY - 1e-9));
}

/** The Begin step. Returns the record (also appended to the colony's winters). */
export function beginOverwinter(sim: Sim, col: Colony, def: SpeciesDef): WinterRecord {
  const s = sim.state;
  const rng = sim.stream('rng.winter');
  const life = lifecycleOf(col);
  const year = currentYear(s);
  if (s.player.possessedAntId !== -1) releasePossessed(sim, 'timelapse');

  // outdoors: ants far from an entrance may die of cold; nearer ones shelter
  const losses: Record<string, number> = {};
  for (const a of colonyAnts(sim, col)) {
    if (a.nestId >= 0 || a.caste === 'queen') continue;
    if (entranceDistBu(sim, col, a) > OVERWINTER_OUTDOOR_SAFE_BU && rngFloat(rng) < OVERWINTER_OUTDOOR_DEATH_P) {
      killAnt(sim, a.id, 'cold');
      losses.outdoors = (losses.outdoors ?? 0) + 1;
    }
  }

  // brood fix: eggs hatch into larvae (the overwintering stage), pupae in cold chambers die with 0.5
  const broodLosses: Record<string, number> = {};
  let pupae0 = 0, hatched = false;
  for (const b of colonyBrood(sim, col)) {
    if (b.stage === 'egg') {
      // the brood module's stage change (its setStage is private): fresh stage clocks, an empty gut, the counters
      b.stage = 'larva';
      b.progress = 0;
      b.stageTick = s.tick;
      b.hungerTicks = 0;
      b.pStarveTicks = 0;
      b.hunger = 0;
      b.gutC = 0;
      b.gutP = 0;
      sim.emit({ type: 'brood-stage', broodId: b.id, from: 'egg', to: 'larva' });
      countStageChange(col, 'egg', 'larva');
      hatched = true;
    } else if (b.stage === 'pupa') {
      pupae0++;
      const t = b.chamberId >= 0 ? chamberTempC(sim, b.chamberId) : WINT_PUPA_COLD_C - 1;
      if (t < WINT_PUPA_COLD_C && rngFloat(rng) < WINT_PUPA_COLD_DEATH) {
        broodDies(sim, b, 'temperature');
        broodLosses.temperature = (broodLosses.temperature ?? 0) + 1;
      }
    }
  }

  if (hatched) invalidateCensus(sim);

  // snapshot and the model
  const ants = colonyAnts(sim, col);
  const workers = ants.filter((a) => isWorkerCaste(a.caste));
  const larvae = colonyBrood(sim, col).filter((b) => b.stage === 'larva');
  const queen = sim.stores.ants.get(col.queenId);
  const cluster = clusterOf(sim, col);
  // the model covers only the winter that remains: after "Delay one day" the colony has lived those days already
  const jump = ticksToSpring(sim);
  const days = winterDaysLeft(jump);
  const climate = winterClimate(sim, cluster, days, rng);
  const input: WinterInput = {
    workers: workers.length, oldWorkers: workers.filter((a) => a.physioAgeGd > WINT_OLD_AGE_FRAC * workerLifespanGd(sim, a)).length,
    larvae: larvae.length, pupae: pupae0 - (broodLosses.temperature ?? 0), c: col.stores.c, p: col.stores.p,
    queenAlive: !!queen && queen.alive, ...climate, floodSafety: cluster.floodSafety, humidity: cluster.humidity,
  };
  const params = winterParams(sim, def);
  const out = runWinterModel(input, params, rng);
  // R24: what the lapse may take of the workers, and the presentation's day series scaled to it. Short stores are an
  // alerted hazard when the winter notice's own arithmetic (overwinter/system.ts storeDays) showed fewer days of
  // stores than the winter has
  const storesShort = col.stores.c < days * dayNeedC(input.workers, input.larvae, input.queenAlive, metFactor(params, cluster.tNow));
  const alerted = alertedCauses(sim, col);
  if (storesShort) alerted.add('starvation');
  const workerLosses = capLapseLosses(out.losses, WINT_LAPSE_LOSS_CAP_FRAC * difficultyValue(sim, 'winterLossMult') * workers.length, alerted);
  scaleDaySeries(out.days, workers.length, sumOf(out.losses), sumOf(workerLosses));

  // losses on real ants: old-age takes the oldest, the other causes a random order
  const byAge = [...workers].sort((a, b) => b.physioAgeGd / workerLifespanGd(sim, b) - a.physioAgeGd / workerLifespanGd(sim, a) || a.id - b.id);
  const dead = new Set<number>();
  const take = (list: Ant[], n: number, cause: DeathCause): void => {
    for (const a of list) {
      if (n <= 0) break;
      if (dead.has(a.id)) continue;
      dead.add(a.id);
      killAnt(sim, a.id, cause);
      n--;
    }
  };
  take(byAge, workerLosses['old-age'] ?? 0, 'old-age');
  const shuffled = rngShuffle(rng, workers.filter((a) => !dead.has(a.id)));
  for (const cause of Object.keys(workerLosses).sort()) {
    if (cause !== 'old-age') take(shuffled, workerLosses[cause], cause as DeathCause);
  }
  killBrood(sim, rng, larvae, out.broodLosses);
  if (!out.queenAlive && queen && queen.alive) killAnt(sim, queen.id, out.queenCause as DeathCause);

  // stores, dormant ageing, the clock
  const c0 = col.stores.c, p0 = col.stores.p;
  col.stores.c = out.c1;
  col.stores.p = out.p1;
  book(col, 'outWorkersC', c0 - out.c1);
  book(col, 'outQueenP', p0 - out.p1);
  for (const a of colonyAnts(sim, col)) {
    const cd = def.castes.find((c) => c.caste === a.caste);
    a.physioAgeGd += (cd?.ageRateDormant ?? 0) * (jump / TICKS_PER_DAY);
  }
  // The clock: the calendar anchor moves to the first tick of spring (the simulation tick counts ticks simulated, so
  // it does not jump); ages that derive from ticks move back by the same span so the colony and its queen grew older.
  const beginTick = calendarTick(s);
  timeHandlers['cheat.setTime']!(sim, { type: 'cheat.setTime', tick: beginTick + jump }); // environment settles there
  col.foundedTick -= jump;
  for (const a of colonyAnts(sim, col)) a.bornTick -= jump;

  // the record
  for (const [k, n] of Object.entries(workerLosses)) losses[k] = (losses[k] ?? 0) + n;
  for (const [k, n] of Object.entries(out.broodLosses)) broodLosses[k] = (broodLosses[k] ?? 0) + n;
  let coldest = Infinity;
  for (const t of climate.tMin) coldest = Math.min(coldest, t);
  const workers1 = colonyAnts(sim, col).filter((a) => isWorkerCaste(a.caste)).length;
  const springNeed = workers1 * WINT_REPORT_SPRING_C_PER_WORKER + (out.queenAlive ? WINT_C_QUEEN : 0) + out.larvae1 * WINT_C_PER_LARVA;
  const rec: WinterRecord = {
    year, beginTick, springTick: calendarTick(s), workers0: workers.length + (losses.outdoors ?? 0), workers1,
    larvae0: larvae.length, larvae1: out.larvae1, pupae0, losses, broodLosses, c0, c1: out.c1, p0, p1: out.p1,
    daysLeft: springNeed > 0 ? out.c1 / springNeed : 0, queenAlive: out.queenAlive, queenCause: out.queenCause,
    coldestC: Number.isFinite(coldest) ? coldest : cluster.tNow, coldestDepthBu: cluster.depthMm / sim.world.bu,
    coldestChamberId: cluster.deepestId, frostNights: climate.frost.filter(Boolean).length,
    heaviestRainMm: Math.max(0, ...climate.rainMm), floods: out.floods,
    days: out.days.map((d) => ({ ...d })),
    firstWinterDay: Math.max(1, seasonLength(s) - days + 1),
    why: rankWhy(losses, {
      coldestC: Number.isFinite(coldest) ? coldest : cluster.tNow, coldestDepthBu: cluster.depthMm / sim.world.bu,
      humidity: cluster.humidity, starvedDays: out.starvedDays, floods: out.floods,
    }),
    springBroodDoy: springBroodDoy(def),
  };
  life.winters.push(rec);
  return rec;
}

const sumOf = (r: Record<string, number>): number => Object.values(r).reduce((a, b) => a + b, 0);

/**
 * The model causes whose hazard the player was alerted to within WINT_HAZARD_WINDOW_SEASONS before Begin (R24): their
 * losses follow the model in full.
 */
function alertedCauses(sim: Sim, col: Colony): Set<string> {
  const seen = lifecycleOf(col).hazardAlertTicks ?? {};
  const since = sim.state.tick - WINT_HAZARD_WINDOW_SEASONS * seasonLength(sim.state) * TICKS_PER_DAY;
  const out = new Set<string>();
  for (const [cause, kinds] of Object.entries(WINT_ALERTED_CAUSES)) {
    if (kinds.some((k) => (seen[k] ?? -Infinity) >= since)) out.add(cause);
  }
  return out;
}

/**
 * Notes, for the R24 lapse loss cap, the winter hazards whose player alerts are active now (called by the overwinter
 * system). Only the player's colony gets alerts.
 */
export function noteHazardAlerts(sim: Sim, col: Colony): void {
  if (!col.isPlayer) return;
  const life = lifecycleOf(col);
  for (const a of sim.state.progression.alerts) {
    for (const kinds of Object.values(WINT_ALERTED_CAUSES)) {
      if (kinds.includes(a.kind)) (life.hazardAlertTicks ??= {})[a.kind] = sim.state.tick;
    }
  }
}

/** The presentation's workers by day end on the losses actually applied (the model's day series ends on its own). */
function scaleDaySeries(days: { workers: number }[], w0: number, modelLost: number, lost: number): void {
  if (modelLost <= lost) return;
  for (const d of days) d.workers = Math.round(w0 - ((w0 - d.workers) * lost) / modelLost);
}

function killBrood(sim: Sim, rng: RngState, larvae: Brood[], counts: Record<string, number>): void {
  const order = rngShuffle(rng, [...larvae]);
  let i = 0;
  for (const cause of Object.keys(counts).sort()) {
    for (let n = counts[cause]; n > 0 && i < order.length; n--, i++) {
      const b = order[i];
      if (b.alive) broodDies(sim, b, cause as BroodDeathCause);
    }
  }
}

/** Default-year day (1-based) from which the queen's spring laying reaches half rate (species fSeason). */
function springBroodDoy(def: SpeciesDef): number {
  const curve = def.life.fSeason;
  for (const [d28, f] of curve) if (f >= 0.5) return Math.floor(d28) + 1;
  return 1;
}

/**
 * Brood-weighted mean temperature of the chambers that hold WINTER_ACTIVE_BROOD_SHARE of the colony's (non-dormant)
 * brood, most populated first; null without brood in chambers.
 */
export function broodChamberTemp(sim: Sim, col: Colony): number | null {
  const count = new Map<number, number>();
  let total = 0;
  for (const b of colonyBrood(sim, col)) {
    if (b.chamberId < 0 || (b.flags & BroodFlag.DIAPAUSE)) continue;
    count.set(b.chamberId, (count.get(b.chamberId) ?? 0) + 1);
    total++;
  }
  if (total === 0) return null;
  const ranked = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  let held = 0, sum = 0;
  for (const [id, n] of ranked) {
    sum += chamberTempC(sim, id) * n;
    held += n;
    if (held >= WINTER_ACTIVE_BROOD_SHARE * total) break;
  }
  return sum / held;
}

/** The log still describes the hours just before now: no calendar jump since its last sample, and recent. */
function broodLogFresh(sim: Sim, life: ReturnType<typeof lifecycleOf>): boolean {
  const lastTick = life.broodTempTick ?? -1, lastCal = life.broodTempCal ?? -1;
  if (lastTick < 0 || lastCal < 0 || (life.broodTempLog?.length ?? 0) === 0) return false;
  const dTick = sim.state.tick - lastTick, dCal = calendarTick(sim.state) - lastCal;
  return Math.abs(dCal - dTick) <= TICKS_PER_HOUR && dCal <= 2 * TICKS_PER_HOUR;
}

/**
 * The tick of each sample of the log. A log without ticks (an older save) is read as one sample an hour, ending at the
 * last sample tick.
 */
function sampleTicks(life: ReturnType<typeof lifecycleOf>): number[] {
  const log = life.broodTempLog ?? [];
  const ticks = life.broodTempTicks;
  if (ticks && ticks.length === log.length) return ticks;
  const last = life.broodTempTick ?? 0;
  return log.map((_, i) => last - (log.length - 1 - i) * TICKS_PER_HOUR);
}

/**
 * Drops the samples older than WINTER_ACTIVE_WINDOW_GD. Hours without brood add no sample, so without this a log
 * whose brood died days ago would still hold the warm hours of when it lived (sweep 3, woodland-edge #1: 48 samples
 * 4 gd old decided "heated" and the colony got no winter lapse).
 */
function dropOldSamples(sim: Sim, life: ReturnType<typeof lifecycleOf>): void {
  const log = life.broodTempLog ?? [];
  const ticks = sampleTicks(life);
  const oldest = sim.state.tick - WINTER_ACTIVE_WINDOW_GD * TICKS_PER_DAY;
  let first = 0;
  while (first < ticks.length && ticks[first] <= oldest) first++;
  life.broodTempLog = log.slice(first);
  life.broodTempTicks = ticks.slice(first);
}

/** Hourly sample of the heated-nest log (kept for WINTER_ACTIVE_WINDOW_GD; restarted after a calendar jump). */
export function sampleBroodTemp(sim: Sim, col: Colony): void {
  const life = lifecycleOf(col);
  const last = life.broodTempTick ?? -1;
  if (last >= 0 && sim.state.tick - last < TICKS_PER_HOUR) return;
  if (!broodLogFresh(sim, life)) {
    life.broodTempLog = [];
    life.broodTempTicks = [];
  }
  dropOldSamples(sim, life);
  life.broodTempTick = sim.state.tick;
  life.broodTempCal = calendarTick(sim.state);
  const t = broodChamberTemp(sim, col);
  if (t !== null) {
    life.broodTempLog!.push(t);
    life.broodTempTicks!.push(sim.state.tick);
  }
  const keep = Math.round(WINTER_ACTIVE_WINDOW_GD * HOURS_PER_DAY);
  const extra = life.broodTempLog!.length - keep;
  if (extra > 0) {
    life.broodTempLog!.splice(0, extra);
    life.broodTempTicks!.splice(0, extra);
  }
}

/**
 * Heated nests (GDD 06 §6.1): the colony keeps active through winter when the brood-weighted mean chamber
 * temperature over the last WINTER_ACTIVE_WINDOW_GD is at least `tMeanC`; hours without brood weigh nothing. Without a
 * fresh log (none yet, the calendar jumped since, as with the winter trigger cheat, or no brood in the window): the
 * brood chambers now, or the cluster without brood.
 */
export function heatedNest(sim: Sim, col: Colony, def: SpeciesDef, tMeanC: number): boolean {
  if (!def.winter.heatedNestRule) return false;
  const life = lifecycleOf(col);
  if (broodLogFresh(sim, life)) {
    dropOldSamples(sim, life);
    const log = life.broodTempLog ?? [];
    if (log.length > 0) return log.reduce((a, b) => a + b, 0) / log.length >= tMeanC;
  }
  const now = broodChamberTemp(sim, col);
  return (now ?? clusterOf(sim, col).tNow) >= tMeanC;
}
