// Surface temperature by material and shade (GDD 06 §2.3). Per (surface, sun|shade) pair a lagged state lives in
// `env.thermal.tsurf` (every 25 ticks); its day-mean and season-mean EMAs (`tsurfDay`, `tsurfSeason`, D7.2) feed the
// GDD 03 §9.1 chamber model. Slots 0..N-1 are the materials in MATERIAL_IDS order, slot N is lawn; sun = 2*slot,
// shade = 2*slot + 1.

import type { Vec3 } from '@/core/math/vec3';
import type { Sim, ThermalStateData } from '@/sim/types';
import { MATERIAL_IDS } from '@/sim/types';
import {
  ACCL_GAIN, ACCL_MAX_C, ACCL_MIN_C, ACCL_REF_C, ACCL_TAU_GD, CLEAR_NIGHT_LIGHT, DEGRADED_AIR_C, EMA_SEED_CLEAR_NIGHT, EMA_SEED_SUN_WEATHER,
  LAWN_SURFACE_PARAMS,
  OVERCAST_NIGHT_FACTOR, SHADE_SUN_RESIDUAL, SURFACE_PARAMS, THERMAL_DAY_EMA_TAU_GD, WSOIL_TAU_GD, type SurfaceParams,
} from '@/sim/balance';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '@/sim/time';
import { calendarNow, peakSolarOf } from './calendar';
import { isInteriorAt, shadeAt, surfaceSlotAt, SURFACE_SLOTS } from './ground';
import { insolation, skyLight } from './light';
import { noteEnvNan } from './envGuard';
import { isNoLag } from './noLag';
import { airTemp, anomalyNow, interiorTemp } from './temperature';
import { initWeather } from './weather';

const SLOT_PARAMS: SurfaceParams[] = [
  ...MATERIAL_IDS.map((m) => SURFACE_PARAMS[m]),
  LAWN_SURFACE_PARAMS,
];

/** 1 on a clear (or frost) night, 0.4 overcast, else 0 (`clearNight`, GDD 06 §2.3). */
export function clearNightFactor(sim: Sim): number {
  const w = sim.state.env.weather.state;
  if (skyLight(sim) >= CLEAR_NIGHT_LIGHT) return 0;
  if (w === 'clear' || w === 'frost') return 1;
  return w === 'overcast' ? OVERCAST_NIGHT_FACTOR : 0;
}

/** Equilibrium temperature a surface is heading for: air + sun gain (reduced in shade) - clear-night loss. */
export function surfaceTarget(p: SurfaceParams, tair: number, ins: number, shaded: boolean, clearNight: number): number {
  return tair + p.gain * ins * (shaded ? SHADE_SUN_RESIDUAL : 1) - p.nightLoss * clearNight;
}

/** True when the first weather has been drawn and the thermal arrays have the current layout. Pure read. */
export function thermalReady(sim: Sim): boolean {
  if (sim.state.env.weather.dwellEndTick < 0) return false;
  const t = sim.state.env.thermal;
  const n = SURFACE_SLOTS * 2;
  return t.tsurf.length === n && t.tsurfDay !== undefined && t.tsurfDay.length === n
    && t.tsurfSeason !== undefined && t.tsurfSeason.length === n;
}

/**
 * Makes sure the weather has its first state and the thermal arrays exist with the current layout (both start
 * empty in a new game); true when something had to be started. Cheap when nothing is missing.
 *
 * This WRITES sim state (it draws the opening weather from rng.weather), so it may be called only from the
 * simulation side: the weather system, command handlers, game start. Queries never call it; they read
 * `thermalReady` and fall back to the T1 degraded constants until the simulation has run it.
 */
export function ensureThermal(sim: Sim): boolean {
  const fresh = sim.state.env.weather.dwellEndTick < 0;
  if (fresh) initWeather(sim);
  if (thermalReady(sim)) return fresh;
  resetThermal(sim);
  return true;
}

/**
 * Re-seeds the lagged surface temperatures, their EMAs, the soil soak and acclimation at the settled values of the
 * moment (after the clock moved or the lags were switched off). Allocates the arrays if they have the wrong layout.
 */
export function resetThermal(sim: Sim): void {
  if (sim.state.env.weather.dwellEndTick < 0) initWeather(sim);
  const t = sim.state.env.thermal;
  const n = SURFACE_SLOTS * 2;
  if (t.tsurf.length !== n) t.tsurf = new Float32Array(n);
  if (!t.tsurfDay || t.tsurfDay.length !== n) t.tsurfDay = new Float32Array(n);
  if (!t.tsurfSeason || t.tsurfSeason.length !== n) t.tsurfSeason = new Float32Array(n);
  initThermal(sim, t);
}

/**
 * Settled start values: surfaces at their equilibrium now, the soil weather soak at the current offset, and the
 * EMAs at the day's mean equilibrium (mean sun over the day: peak * (2/pi) * day length / 24 * weather share).
 */
function initThermal(sim: Sim, t: ThermalStateData): void {
  const cal = calendarNow(sim);
  const tair = airTemp(sim);
  const ins = insolation(sim);
  const cn = clearNightFactor(sim);
  const meanIns = EMA_SEED_SUN_WEATHER * (2 / Math.PI) * (cal.dayLength / 24) * peakSolarOf(cal.dayLength);
  for (let slot = 0; slot < SURFACE_SLOTS; slot++) {
    const p = SLOT_PARAMS[slot];
    for (let s = 0; s < 2; s++) {
      const i = slot * 2 + s;
      t.tsurf[i] = surfaceTarget(p, tair, ins, s === 1, cn);
      const mean = surfaceTarget(p, tair, meanIns, s === 1, EMA_SEED_CLEAR_NIGHT);
      t.tsurfDay![i] = mean;
      t.tsurfSeason![i] = mean;
    }
  }
  const w = sim.state.env.weather;
  t.wsoil = w.wOff + anomalyNow(sim);
  t.heatAccl = 0;
}

/** Advances the lagged surface temperatures, their EMAs, the soil weather soak and heat acclimation by `dtTicks`. */
export function updateThermal(sim: Sim, dtTicks: number): void {
  ensureThermal(sim);
  const t = sim.state.env.thermal;
  const snap = isNoLag(sim.state);
  const dtH = dtTicks / TICKS_PER_HOUR;
  const dtGd = dtTicks / TICKS_PER_DAY;
  const tair = airTemp(sim);
  const ins = insolation(sim);
  const cn = clearNightFactor(sim);
  const dayA = 1 - Math.exp(-dtGd / THERMAL_DAY_EMA_TAU_GD);
  const seasonA = 1 - Math.exp(-dtGd / sim.state.config.rules.seasonLengthDays);
  const day = t.tsurfDay!, season = t.tsurfSeason!;
  for (let slot = 0; slot < SURFACE_SLOTS; slot++) {
    const p = SLOT_PARAMS[slot];
    const a = snap ? 1 : 1 - Math.exp(-dtH / p.tauH);
    for (let s = 0; s < 2; s++) {
      const i = slot * 2 + s;
      const target = surfaceTarget(p, tair, ins, s === 1, cn);
      const v = t.tsurf[i] + (target - t.tsurf[i]) * a;
      if (!Number.isFinite(v)) { // GDD 06 §3.12: keep the previous value
        noteEnvNan(sim.state);
        continue;
      }
      t.tsurf[i] = v;
      day[i] += (v - day[i]) * dayA;
      season[i] += (v - season[i]) * seasonA;
    }
  }
  const soak = sim.state.env.weather.wOff + anomalyNow(sim);
  t.wsoil = snap ? soak : t.wsoil + (soak - t.wsoil) * (1 - Math.exp(-dtGd / WSOIL_TAU_GD));
  const acclTarget = Math.max(ACCL_MIN_C, Math.min(ACCL_MAX_C, ACCL_GAIN * (sim.state.env.weather.history.tmaxYesterday - ACCL_REF_C)));
  t.heatAccl += (acclTarget - t.heatAccl) * (1 - Math.exp(-dtGd / ACCL_TAU_GD));
}

/** Lagged temperature of a surface slot blended between its sun and shade state by `shade` 0..1 (degraded constant until the simulation has started the thermal state). */
export function slotTemp(sim: Sim, slot: number, shade: number): number {
  if (!thermalReady(sim)) return DEGRADED_AIR_C;
  const a = sim.state.env.thermal.tsurf;
  const i = slot * 2;
  return a[i] + (a[i + 1] - a[i]) * shade;
}

/**
 * Surface temperature of the ground at (x, z), C: the lagged temperature of its surface (material or lawn) blended
 * by the map shade; heated interior floors give the interior temperature. Accepts a point or x, z.
 */
export function surfaceTemp(sim: Sim, p: Vec3): number;
export function surfaceTemp(sim: Sim, x: number, z: number): number;
export function surfaceTemp(sim: Sim, a: Vec3 | number, b = 0): number {
  const x = typeof a === 'number' ? a : a.x;
  const z = typeof a === 'number' ? b : a.z;
  const w = sim.world;
  if (isInteriorAt(w, x, z)) return interiorTemp(sim);
  return slotTemp(sim, surfaceSlotAt(w, x, z), shadeAt(w, x, z));
}
