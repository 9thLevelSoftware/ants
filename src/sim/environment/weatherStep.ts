// One fast environment step of the weather (GDD 06 §3): state end check, precipitation bell, cloud and temperature
// offset relaxation, wind with gusts, dew and mist, lightning, daily anomaly and history. All state is in
// `state.env.weather`; the only randomness is the stream `rng.weather`. Allocation-free.

import { rngChance, rngFloat, rngGauss } from '@/core/rng';
import type { Sim } from '@/sim/types';
import {
  ANOMALY_AR, ANOMALY_CLAMP_C, ANOMALY_SD_C, CLOUD_TAU_H, DEW_BLOCK_WIND, DEW_CLEAR_WIND_MAX, DEW_GONE_AFTER_SUNRISE_CLEAR_H,
  DEW_GONE_AFTER_SUNRISE_OVERCAST_H, DEW_START_AFTER_SUNSET_H, DM_TAU_H, GUST_MULT, GUST_RATE_PER_H, GUST_RATE_STORM_PER_H,
  GUST_TICKS, LIGHTNING_MEAN_EXTRA_TICKS, LIGHTNING_MIN_GAP_TICKS, MIST_DENSITY, MIST_WIND_MAX, P_DEW_CLEAR, P_DEW_OVERCAST,
  PRECIP_PEAK_FRACTION, RAIN_CUM_TAU_H, RAIN_HISTORY_HOURS, RAIN_MIN_RATE_MMH, RAIN_RATE_MMH, STORM_RAIN_MMH,
  THUNDER_DELAY_MAX_S, THUNDER_DELAY_MIN_S, WEATHER_DEFS, WIND_DIR_WALK_DEG, WIND_OU_SD, WIND_OU_TAU_H, WOFF_TAU_H,
} from '@/sim/balance';
import { calendarTick, seasonIndexOf, TICKS_PER_DAY, TICKS_PER_HOUR } from '@/sim/time';
import { calendarNow } from './calendar';
import { isNoLag } from './noLag';
import { airTemp, dmTarget, woffTarget } from './temperature';
import { guardWeather } from './envGuard';
import { baseWind, windHold } from './wind';
import { advanceWeather, rollDryspell } from './weather';

/** Exponent that puts the precipitation bell's peak at PRECIP_PEAK_FRACTION of the dwell: sin(pi * u^k). */
const BELL_K = Math.log(0.5) / Math.log(PRECIP_PEAK_FRACTION);

/** Precipitation bell 0..1 at the dwell fraction u. */
export function precipBell(u: number): number {
  const c = u < 0 ? 0 : u > 1 ? 1 : u;
  return Math.sin(Math.PI * Math.pow(c, BELL_K));
}

function dewLevel(sim: Sim): number {
  const w = sim.state.env.weather;
  if (!w.dew.tonight || w.state === 'rain' || w.state === 'storm' || w.state === 'heat') return 0;
  const cal = calendarNow(sim);
  const h = cal.hour, sr = cal.sunrise;
  const startH = cal.sunset + DEW_START_AFTER_SUNSET_H;
  const span = 24 - startH + sr;
  if (h >= startH) return (h - startH) / span;
  if (h < sr) return (h + 24 - startH) / span;
  const gone = w.state === 'overcast' ? DEW_GONE_AFTER_SUNRISE_OVERCAST_H : DEW_GONE_AFTER_SUNRISE_CLEAR_H;
  return h < sr + gone ? 1 - (h - sr) / gone : 0;
}

function stepDaily(sim: Sim, ct: number, dtTicks: number): void {
  const s = sim.state;
  const w = s.env.weather;
  const rng = sim.stream('rng.weather');
  if (Math.floor(ct / TICKS_PER_DAY) !== Math.floor((ct - dtTicks) / TICKS_PER_DAY)) {
    const a = ANOMALY_AR * w.anomalyCur + rngGauss(rng, 0, ANOMALY_SD_C);
    w.anomalyPrev = w.anomalyCur;
    w.anomalyCur = Math.max(-ANOMALY_CLAMP_C, Math.min(ANOMALY_CLAMP_C, a));
    w.history.tmaxYesterday = w.history.tmaxToday;
    w.history.tmaxToday = airTemp(sim);
  }
  if (seasonIndexOf(ct, s.config) !== seasonIndexOf(ct - dtTicks, s.config)) rollDryspell(sim, s.tick);
}

function stepPrecip(sim: Sim, ct: number, dtTicks: number, dtH: number): void {
  const w = sim.state.env.weather;
  if (w.state === 'rain' || w.state === 'storm') {
    const span = w.dwellEndTick - w.startTick;
    const bell = precipBell(span > 0 ? (sim.state.tick - w.startTick) / span : 1);
    w.precip = w.peakPrecip * bell;
    const peak = w.state === 'storm' ? STORM_RAIN_MMH : RAIN_RATE_MMH[w.intensityClass ?? 'shower'];
    w.rainRateMmH = peak * bell;
  } else {
    w.precip = 0;
    w.rainRateMmH = 0;
  }
  const h = w.history;
  h.cumRain24hMm = h.cumRain24hMm * Math.exp(-dtH / RAIN_CUM_TAU_H) + w.rainRateMmH * dtH;
  const hourIdx = Math.floor(ct / TICKS_PER_HOUR);
  const slot = hourIdx % RAIN_HISTORY_HOURS;
  if (hourIdx !== Math.floor((ct - dtTicks) / TICKS_PER_HOUR)) h.rainHoursRing[slot] = 0;
  if (w.rainRateMmH >= RAIN_MIN_RATE_MMH) h.rainHoursRing[slot] = 1;
}

function relaxLagged(sim: Sim, dtH: number): void {
  const w = sim.state.env.weather;
  const snap = isNoLag(sim.state);
  const cloudT = WEATHER_DEFS[w.state].cloud;
  w.cloud = snap ? cloudT : w.cloud + (cloudT - w.cloud) * (1 - Math.exp(-dtH / CLOUD_TAU_H));
  const woffT = woffTarget(sim);
  w.wOff = snap ? woffT : w.wOff + (woffT - w.wOff) * (1 - Math.exp(-dtH / WOFF_TAU_H));
  const dmT = dmTarget(w.state);
  const dm = w.dmCur ?? dmT;
  w.dmCur = snap ? dmT : dm + (dmT - dm) * (1 - Math.exp(-dtH / DM_TAU_H));
}

function stepWind(sim: Sim, dtH: number): void {
  const w = sim.state.env.weather;
  const rng = sim.stream('rng.weather');
  const e = Math.exp(-dtH / WIND_OU_TAU_H);
  w.windOu = (w.windOu ?? 0) * e + WIND_OU_SD * Math.sqrt(1 - e * e) * rngGauss(rng, 0, 1);
  let v = baseWind(sim);
  const tick = sim.state.tick;
  const rate = w.state === 'storm' ? GUST_RATE_STORM_PER_H : GUST_RATE_PER_H;
  const gustRoll = rngChance(rng, 1 - Math.exp(-rate * dtH));
  if (tick >= w.gustUntilTick && gustRoll) {
    w.gustUntilTick = tick + GUST_TICKS;
    sim.emit({ type: 'weather.gust', windMs: v * GUST_MULT });
  }
  if (tick < w.gustUntilTick) v *= GUST_MULT;
  const held = windHold(sim.state);
  w.wind2m = held ?? v;
  const turn = ((rngGauss(rng, 0, 1) * WIND_DIR_WALK_DEG * Math.sqrt(dtH)) * Math.PI) / 180;
  const c = Math.cos(turn), sn = Math.sin(turn), d = w.windDir;
  const x = d.x * c - d.z * sn, z = d.x * sn + d.z * c;
  const len = Math.hypot(x, z) || 1;
  d.x = x / len;
  d.z = z / len;
}

function stepLightning(sim: Sim): void {
  const w = sim.state.env.weather;
  if (w.state !== 'storm' || sim.state.tick < w.lightningNextTick) return;
  const rng = sim.stream('rng.weather');
  sim.emit({ type: 'weather.lightning' });
  sim.emit({
    type: 'weather.thunder',
    delayS: THUNDER_DELAY_MIN_S + rngFloat(rng) * (THUNDER_DELAY_MAX_S - THUNDER_DELAY_MIN_S),
    intensity: w.precip,
  });
  w.lightningNextTick = sim.state.tick + LIGHTNING_MIN_GAP_TICKS + Math.round(-LIGHTNING_MEAN_EXTRA_TICKS * Math.log(1 - rngFloat(rng)));
}

function stepDew(sim: Sim, ct: number, dtTicks: number): void {
  const w = sim.state.env.weather;
  const cal = calendarNow(sim);
  const prevHour = ((ct - dtTicks) % TICKS_PER_DAY) / TICKS_PER_HOUR;
  if (cal.hour >= prevHour && prevHour < cal.sunset && cal.hour >= cal.sunset) {
    const rng = sim.stream('rng.weather');
    let p = 0;
    if (w.state === 'clear' || w.state === 'frost') p = w.wind2m < DEW_CLEAR_WIND_MAX ? P_DEW_CLEAR : P_DEW_OVERCAST;
    else if (w.state === 'overcast') p = P_DEW_OVERCAST;
    if (w.wind2m >= DEW_BLOCK_WIND) p = 0;
    w.dew.tonight = rngChance(rng, p);
  }
  const before = w.dew.level;
  const level = dewLevel(sim);
  w.dew.level = level;
  if (before <= 0 && level > 0) sim.emit({ type: 'weather.dew', state: 'formed' });
  else if (before > 0 && level <= 0) sim.emit({ type: 'weather.dew', state: 'gone' });
  w.fogDensity = level > 0.6 && w.wind2m < MIST_WIND_MAX ? MIST_DENSITY : 0;
}

/** Advances the weather by `dtTicks` ticks (the environment's fast step). */
export function stepWeather(sim: Sim, dtTicks: number): void {
  const s = sim.state;
  const w = s.env.weather;
  const ct = calendarTick(s);
  const dtH = dtTicks / TICKS_PER_HOUR;
  guardWeather(sim);
  stepDaily(sim, ct, dtTicks);
  if (s.tick >= w.dwellEndTick) advanceWeather(sim);
  stepPrecip(sim, ct, dtTicks, dtH);
  relaxLagged(sim, dtH);
  stepWind(sim, dtH);
  stepLightning(sim);
  stepDew(sim, ct, dtTicks);
  guardWeather(sim);
  const t = airTemp(sim);
  if (t > w.history.tmaxToday) w.history.tmaxToday = t;
}
