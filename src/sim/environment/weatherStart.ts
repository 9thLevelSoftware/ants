// The first weather of a game and its forced start conditions (GDD 06 §1.6): the species' start day only works if
// the sky, the air and the wind allow it, so the first draw is redrawn until they hold (Lasius: clear or overcast,
// air 18-26 C, wind below 4 m/s). Messor and Atta also need a recent rain history and, for Atta, a new moon.

import { rngFloat, rngGauss, type RngState } from '@/core/rng';
import type { Sim, WeatherState } from '@/sim/types';
import {
  ANOMALY_AR, ANOMALY_CLAMP_C, ANOMALY_SD_C, INITIAL_WEATHER_WEIGHTS, RAIN_HISTORY_HOURS, START_CONDITIONS, START_RAIN_EXTRA_MM,
  START_NEW_MOON_JITTER, START_RAIN_AGO_MIN_H, START_RAIN_AGO_SPAN_H, START_REDRAW_MAX, WIND_OU_SD, type StartConditions,
} from '@/sim/balance';
import { calendarTick, TICKS_PER_HOUR } from '@/sim/time';
import { moonPhaseOf } from './calendar';
import { airTemp } from './temperature';
import { baseWind } from './wind';

const DEFAULT_CONDITIONS: StartConditions = { states: ['clear', 'overcast'], windMaxMs: Infinity };

export interface StartDraw {
  state: WeatherState;
  anomaly: number;
  windOu: number;
}

/** Evaluates a candidate start by writing it into the weather record (the caller settles the lagged values). */
function air(sim: Sim, settle: () => void, d: StartDraw): { air: number; wind: number } {
  const w = sim.state.env.weather;
  w.state = d.state;
  w.anomalyPrev = d.anomaly;
  w.anomalyCur = d.anomaly;
  w.windOu = d.windOu;
  settle();
  return { air: airTemp(sim), wind: baseWind(sim) };
}

function pickState(c: StartConditions, rng: RngState): WeatherState {
  let total = 0;
  for (const s of c.states) total += INITIAL_WEATHER_WEIGHTS[s] ?? 1;
  let u = rngFloat(rng) * total;
  for (const s of c.states) {
    u -= INITIAL_WEATHER_WEIGHTS[s] ?? 1;
    if (u < 0) return s;
  }
  return c.states[0];
}

/** Draws a start (state, anomaly, wind noise) that satisfies the conditions, or the nearest allowed one. */
export function drawStart(sim: Sim, rng: RngState, settle: () => void): StartDraw {
  const c = START_CONDITIONS[sim.state.config.species] ?? DEFAULT_CONDITIONS;
  const stationarySd = ANOMALY_SD_C / Math.sqrt(1 - ANOMALY_AR * ANOMALY_AR);
  const clampA = (a: number) => Math.max(-ANOMALY_CLAMP_C, Math.min(ANOMALY_CLAMP_C, a));
  const ok = (r: { air: number; wind: number }) =>
    r.wind < c.windMaxMs && (c.airMinC === undefined || r.air >= c.airMinC) && (c.airMaxC === undefined || r.air <= c.airMaxC);
  let d: StartDraw = { state: c.states[0], anomaly: 0, windOu: 0 };
  for (let i = 0; i < START_REDRAW_MAX; i++) {
    d = { state: pickState(c, rng), anomaly: clampA(rngGauss(rng, 0, stationarySd)), windOu: rngGauss(rng, 0, WIND_OU_SD) };
    if (ok(air(sim, settle, d))) return d;
  }
  // Nothing drawn fit: keep the last state, move the anomaly into the band and calm the wind noise.
  const r = air(sim, settle, d);
  if (c.airMinC !== undefined && r.air < c.airMinC) d.anomaly = clampA(d.anomaly + (c.airMinC - r.air));
  if (c.airMaxC !== undefined && r.air > c.airMaxC) d.anomaly = clampA(d.anomaly - (r.air - c.airMaxC));
  d.windOu = 0;
  air(sim, settle, d);
  return d;
}

/** Rain history, moon and other start requirements that are not about the sky itself. */
export function applyStartHistory(sim: Sim, rng: RngState): void {
  const s = sim.state;
  const c = START_CONDITIONS[s.config.species];
  const w = s.env.weather;
  const ct = calendarTick(s);
  s.env.calendar.moonPhase0 = rngFloat(rng); // seed-derived
  if (!c) return;
  if (c.moonless) {
    // new moon at the start, within a few hours of it
    const phase = moonPhaseOf(ct, 0);
    s.env.calendar.moonPhase0 = (1 - phase + (rngFloat(rng) - 0.5) * 2 * START_NEW_MOON_JITTER + 1) % 1;
  }
  if (c.rainEndedHoursAgo && c.rainHours) {
    const ago = c.rainEndedHoursAgo[0] + rngFloat(rng) * (c.rainEndedHoursAgo[1] - c.rainEndedHoursAgo[0]);
    const endHourIdx = Math.floor((ct - Math.round(ago * TICKS_PER_HOUR)) / TICKS_PER_HOUR);
    w.history.lastRainEndTick = s.tick - Math.round(ago * TICKS_PER_HOUR);
    for (let k = 0; k < c.rainHours; k++) w.history.rainHoursRing[(((endHourIdx - k) % RAIN_HISTORY_HOURS) + RAIN_HISTORY_HOURS) % RAIN_HISTORY_HOURS] = 1;
  }
  if (c.cumRain24hMm !== undefined) {
    w.history.cumRain24hMm = c.cumRain24hMm + rngFloat(rng) * START_RAIN_EXTRA_MM;
    w.history.lastRainEndTick = s.tick - Math.round((START_RAIN_AGO_MIN_H + rngFloat(rng) * START_RAIN_AGO_SPAN_H) * TICKS_PER_HOUR);
  }
}
