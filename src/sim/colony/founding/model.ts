// The founding model of GDD 06 §5.12 as pure arithmetic: development time, the brood hazard mu(Q), the forecast
// shown after each batch (§5.10), and a compact Monte Carlo of the model (calibration checks and the forecast's
// risk band). The running game applies the same rules to real brood records (care.ts); this file never touches
// a Sim.

import { rngFloat, rngFork, type RngState } from '@/core/rng';
import type { SpeciesDef, SpeciesId } from '@/sim/types';
import { BROOD_SURVIVAL } from '@/sim/balance';
import {
  FORECAST_RANGE, FORECAST_SAFE_RESERVE, FOUND_CANNIBAL, FOUND_END_AFTER_ECLOSION_GD, FOUND_MU, FOUND_MU_MOIST,
  FOUND_MU_SPECIES, FOUND_UPKEEP_PER_GD, LARVA_COST_LOADS,
} from '@/sim/balance/founding';
import { EGG_COST_P } from '@/sim/balance/actions';
import { devRate } from '../life';

type Stage = 'egg' | 'larva' | 'pupa';
const STAGES: readonly Stage[] = ['egg', 'larva', 'pupa'];

/** Brood hazard per GD (GDD 06 §5.12 step 2): quality, species, difficulty and dry soil. */
export function foundingMu(q: number, species: SpeciesId, difficultyMult = 1, moisture = 1): number {
  const base = Math.min(FOUND_MU.max, Math.max(FOUND_MU.min, FOUND_MU.k * (FOUND_MU.qRef - q)));
  const dry = 1 + (FOUND_MU_MOIST.gain * Math.max(0, FOUND_MU_MOIST.ref - moisture)) / FOUND_MU_MOIST.ref;
  return base * (FOUND_MU_SPECIES[species] ?? 1) * difficultyMult * dry;
}

/** Egg-to-worker time at a constant temperature, GD (sum of stage durations / devRate). Infinity when r = 0. */
export function devTimeGd(def: SpeciesDef, tempC: number): number {
  const r = devRate(def, tempC);
  const du = def.life.stageGd.egg + def.life.stageGd.larva + def.life.stageGd.pupa;
  return r > 0 ? du / r : Infinity;
}

/** Egg + larva time (when the larval draw has been paid), GD. */
export function preePupaGd(def: SpeciesDef, tempC: number): number {
  const r = devRate(def, tempC);
  return r > 0 ? (def.life.stageGd.egg + def.life.stageGd.larva) / r : Infinity;
}

/**
 * The colony brood system's own base hazard (GDD 02 §2.5) averaged over development, per GD at this temperature:
 * sum_s -ln(S_s) x r / sum_s DU_s. The founding hazard adds only what mu exceeds it by, so that the integrated
 * hazard over development is the model's mu x Tdev.
 */
export function colonyBaseHazardPerGd(def: SpeciesDef, tempC: number): number {
  let h = 0, du = 0;
  for (const s of STAGES) { h += -Math.log(BROOD_SURVIVAL[s]); du += def.life.stageGd[s]; }
  return (h * devRate(def, tempC)) / du;
}

export interface Forecast {
  /** Expected first workers E = N exp(-mu Tdev) and the range shown [0.7 E, 1.3 E], rounded. */
  expected: number;
  range: [number, number];
  /** Reserves (0..1 of R0) expected at the first worker. */
  reserves: number;
  /** Highest clutch (in eggs) whose expected end reserves stay >= FORECAST_SAFE_RESERVE. */
  safeEggs: number;
  devGd: number;
  mu: number;
}

/** Expected reserves left at the first worker for a clutch of n (GDD 06 §5.10 forecast formula), 0..1. */
export function forecastReserves(n: number, r0: number, mu: number, tDev: number, tPre: number, drainMult = 1): number {
  const used = EGG_COST_P * n + FOUND_UPKEEP_PER_GD * drainMult * tDev + LARVA_COST_LOADS * drainMult * n * Math.exp(-mu * tPre);
  return 1 - used / r0;
}

export function forecast(def: SpeciesDef, clutch: number, tempC: number, q: number, opts: { difficultyMult?: number; drainMult?: number; moisture?: number; r0?: number } = {}): Forecast {
  const tDev = devTimeGd(def, tempC), tPre = preePupaGd(def, tempC);
  const mu = foundingMu(q, def.id as SpeciesId, opts.difficultyMult ?? 1, opts.moisture ?? 1);
  const r0 = opts.r0 ?? def.opening.R0;
  const drain = opts.drainMult ?? 1;
  const e = Number.isFinite(tDev) ? clutch * Math.exp(-mu * tDev) : 0;
  let safe = 0;
  for (let n = 1; n <= def.opening.clutchCap; n++) if (forecastReserves(n, r0, mu, tDev, tPre, drain) >= FORECAST_SAFE_RESERVE) safe = n;
  return {
    expected: e, range: [Math.round(FORECAST_RANGE[0] * e), Math.round(FORECAST_RANGE[1] * e)],
    reserves: Number.isFinite(tDev) ? forecastReserves(clutch, r0, mu, tDev, tPre, drain) : 0, safeEggs: safe, devGd: tDev, mu,
  };
}

// ---- Monte Carlo of the model (calibration, GDD 06 §5.12 table and App. E checks 18-19) ----

export interface ModelRun {
  workers: number;
  queenDied: boolean;
  /** First eclosion after the first egg, GD (-1 none). */
  firstEclosionGd: number;
  /** Reserves left at the end (0..1 of R0). */
  reserves: number;
  eaten: number;
}

export interface ModelParams {
  def: SpeciesDef;
  q: number;
  tempC: number;
  clutch: number;
  seed: number;
  r0?: number;
  /** Step, GD (default one colony slow tick: 1 game s). */
  dtGd?: number;
  difficultyMult?: number;
  drainMult?: number;
}

interface Item { stage: number; progress: number; invested: number; alive: boolean }

/** One founding from a clutch laid at once, stepped until the first eclosion + 0.4 GD (or the queen's death). */
export function runModel(p: ModelParams): ModelRun {
  const { def } = p;
  const rng: RngState = rngFork(p.seed, 'founding-model');
  const dt = p.dtGd ?? 1 / 600;
  const r = devRate(def, p.tempC);
  const du = [def.life.stageGd.egg, def.life.stageGd.larva, def.life.stageGd.pupa];
  const mu = foundingMu(p.q, def.id as SpeciesId, p.difficultyMult ?? 1);
  const drain = p.drainMult ?? 1;
  const r0 = p.r0 ?? def.opening.R0;
  let R = r0 - EGG_COST_P * p.clutch;
  const items: Item[] = [];
  for (let i = 0; i < p.clutch; i++) items.push({ stage: 0, progress: 0, invested: 0, alive: true });
  const pDie = 1 - Math.exp(-mu * dt);
  const cannibalEvery = Math.max(1, Math.round(FOUND_CANNIBAL.everyGd / dt));
  let t = 0, step = 0, workers = 0, first = -1, eaten = 0, died = false;
  const maxGd = 60;
  while (t < maxGd) {
    step++;
    t += dt;
    R -= FOUND_UPKEEP_PER_GD * drain * dt;
    let live = 0;
    for (const it of items) {
      if (!it.alive) continue;
      if (rngFloat(rng) < pDie) { it.alive = false; continue; }
      const dp = (r * dt) / du[it.stage];
      if (it.stage === 1) {
        // the draw is taken even when the pool is spent: the queen then has to eat brood to cover it (step 3)
        const draw = LARVA_COST_LOADS * drain * Math.min(dp, 1 - it.progress);
        R -= draw;
        it.invested += draw;
      }
      it.progress += dp;
      if (it.progress >= 1) {
        it.progress = 0;
        it.stage++;
        if (it.stage === 3) { it.alive = false; workers++; if (first < 0) first = t; continue; }
      }
      live++;
    }
    if (R < FOUND_CANNIBAL.low * r0 && (step % cannibalEvery === 0 || R <= 0)) {
      if (R <= 0 || rngFloat(rng) < FOUND_CANNIBAL.p) {
        const victim = youngest(items);
        if (victim) {
          victim.alive = false;
          R += victim.stage === 1 ? FOUND_CANNIBAL.larvaReturn * victim.invested : FOUND_CANNIBAL.eggReturn;
          eaten++;
        } else if (R <= 0) { died = true; break; }
      }
    }
    if (first >= 0 && t >= first + FOUND_END_AFTER_ECLOSION_GD) break;
    if (live === 0 && first < 0) break;
  }
  return { workers, queenDied: died, firstEclosionGd: first, reserves: Math.max(0, R) / r0, eaten };
}

/** Youngest edible brood: the least developed larva, else the youngest egg; pupae are never eaten. */
function youngest(items: Item[]): Item | null {
  let larva: Item | null = null, egg: Item | null = null;
  for (const it of items) {
    if (!it.alive) continue;
    if (it.stage === 1 && (!larva || it.progress < larva.progress)) larva = it;
    else if (it.stage === 0 && (!egg || it.progress < egg.progress)) egg = it;
  }
  return larva ?? egg;
}

export interface ModelStats {
  meanWorkers: number;
  p10: number;
  p90: number;
  queenDeathRate: number;
  meanFirstEclosionGd: number;
}

export function modelStats(runs: readonly ModelRun[]): ModelStats {
  const w = runs.filter((r) => !r.queenDied).map((r) => r.workers).sort((a, b) => a - b);
  const all = runs.map((r) => (r.queenDied ? 0 : r.workers)).sort((a, b) => a - b);
  const pick = (f: number) => (all.length ? all[Math.min(all.length - 1, Math.floor(f * all.length))] : 0);
  const ecl = runs.filter((r) => r.firstEclosionGd >= 0).map((r) => r.firstEclosionGd);
  return {
    meanWorkers: w.length ? w.reduce((a, b) => a + b, 0) / w.length : 0,
    p10: pick(0.1), p90: pick(0.9), queenDeathRate: runs.filter((r) => r.queenDied).length / Math.max(1, runs.length),
    meanFirstEclosionGd: ecl.length ? ecl.reduce((a, b) => a + b, 0) / ecl.length : -1,
  };
}
