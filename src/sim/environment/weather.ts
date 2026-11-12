// Weather state machine (GDD 06 §3.2): initial draw, dwell end, transition, cold snaps, dry spells, forecast.
// A semi-Markov process: each state lasts a drawn dwell, then the next state is drawn from the seasonal table.
// The next state is drawn when the current one begins and kept as the forecast, so what is announced is what
// happens. Randomness comes only from the stream `rng.weather`; everything lives in `state.env.weather`.

import { rngChance, rngFloat, rngGauss } from '@/core/rng';
import type { CalendarDerived, RainClass, Sim, WeatherForecast, WeatherState } from '@/sim/types';
import {
  ANOMALY_AR, ANOMALY_CLAMP_C, ANOMALY_SD_C, COLDSNAP_EXT_H, COLDSNAP_MAX_EXT, DEFAULT_SEASON_LENGTH_DAYS, DRYSPELL_DAYS, FROST_END_AFTER_SUNRISE_H, HEAT_SEASON_STOP_H,
  INITIAL_WEATHER_WEIGHTS, LIGHTNING_MEAN_EXTRA_TICKS, LIGHTNING_MIN_GAP_TICKS, P_COLDSNAP_PERSIST, PRECIP_NORM,
  STORM_PRECIP_NORM, WEATHER_DEFS, WIND_STORM_TURN_DEG,
} from '@/sim/balance';
import { calendarTick, dayOf, TICKS_PER_DAY, TICKS_PER_HOUR, yearFraction } from '@/sim/time';
import { dayLengthH, deriveCalendar, nextSeasonStartTick } from './calendar';
import { climateDef, seasonalMean } from './climates';
import { climateOf, dmTarget, severityMult, woffTarget } from './temperature';
import { drawDwellHours, drawNextState, drawRainClass, type WeatherDrawCtx } from './weatherDraw';

const calScratch: CalendarDerived = deriveCalendar(0, 7);
const ctxScratch: WeatherDrawCtx = {
  season: 'spring', hour: 0, sunrise: 6, sunset: 18, tSeason: 0, climate: climateDef('temperate-maritime'), rainMult: 1,
  stormMult: 1, heatMult: 1, frostMult: 1, clearOvercastOnly: false, dryspell: false,
};

function dryspellTicks(sim: Sim): number {
  return Math.round(((DRYSPELL_DAYS * sim.state.config.rules.seasonLengthDays) / DEFAULT_SEASON_LENGTH_DAYS) * TICKS_PER_DAY);
}

/** True while a dry spell covers the state tick. */
export function dryspellActiveAt(sim: Sim, stateTick: number): boolean {
  const end = sim.state.env.weather.history.dryspellEndTick;
  return end >= 0 && stateTick >= end - dryspellTicks(sim) && stateTick < end;
}

/** Fills the shared draw context for the moment `stateTick` (a state-tick time, possibly in the future). */
function fillCtx(sim: Sim, stateTick: number): WeatherDrawCtx {
  const s = sim.state;
  const ct = s.env.calendar.startTick + stateTick;
  const cal = deriveCalendar(ct, s.config, s.env.calendar.moonPhase0, calScratch);
  const c = climateOf(sim);
  const p = s.config.difficulty.params;
  const sev = severityMult(sim);
  const x = ctxScratch;
  x.season = cal.season;
  x.hour = cal.hour;
  x.sunrise = cal.sunrise;
  x.sunset = cal.sunset;
  x.climate = c;
  x.tSeason = seasonalMean(c, cal.yearFrac);
  x.rainMult = c.rainMult * p.rainFreqMult * sev;
  x.stormMult = c.stormMult * p.stormFreqMult * sev;
  x.heatMult = c.heatMult * p.heatWaveFreqMult * sev;
  x.frostMult = c.frostMult * p.frostFreqMult * sev;
  x.clearOvercastOnly = s.config.rules.weatherSeverity === 'none';
  x.dryspell = dryspellActiveAt(sim, stateTick);
  return x;
}

// ---- dry spells ----

/** Rolls this summer's dry spell from `fromTick` (state ticks) to the end of the season; resets it outside summer. */
export function rollDryspell(sim: Sim, fromTick: number): void {
  const s = sim.state;
  const h = s.env.weather.history;
  const ct = s.env.calendar.startTick + fromTick;
  const cal = deriveCalendar(ct, s.config, s.env.calendar.moonPhase0, calScratch);
  if (cal.season !== 'summer') {
    h.dryspellDone = false;
    h.dryspellEndTick = -1;
    return;
  }
  const rng = sim.stream('rng.weather');
  const hit = rngChance(rng, s.config.difficulty.params.pDrySpell);
  const startAt = rngFloat(rng);
  h.dryspellDone = true;
  const dur = dryspellTicks(sim);
  const seasonEnd = nextSeasonStartTick(ct, s.config) - s.env.calendar.startTick;
  const span = seasonEnd - fromTick - dur;
  h.dryspellEndTick = hit && span > 0 ? Math.round(fromTick + startAt * span + dur) : -1;
}

// ---- state changes ----

function hardHeatStop(sim: Sim, startTick: number): number {
  const s = sim.state;
  const ct = s.env.calendar.startTick + startTick;
  return nextSeasonStartTick(ct, s.config) - s.env.calendar.startTick + HEAT_SEASON_STOP_H * TICKS_PER_HOUR;
}

/** Moves a frost end to no earlier than sunrise + 3 h of a day (the thaw), leaving a daytime end alone. */
function thawAdjusted(sim: Sim, endTick: number): number {
  const start = sim.state.env.calendar.startTick;
  const ct = start + endTick;
  const day = dayOf(ct);
  const tod = (ct - day * TICKS_PER_DAY) / TICKS_PER_HOUR;
  const sr = 12 - dayLengthH(yearFraction(ct, sim.state.config)) / 2;
  const ss = 24 - sr;
  const thaw = sr + FROST_END_AFTER_SUNRISE_H;
  if (tod >= thaw && tod < ss) return endTick;
  if (tod < thaw) return day * TICKS_PER_DAY + Math.round(thaw * TICKS_PER_HOUR) - start;
  const nextCt = (day + 1) * TICKS_PER_DAY;
  const sr2 = 12 - dayLengthH(yearFraction(nextCt, sim.state.config)) / 2;
  return nextCt + Math.round((sr2 + FROST_END_AFTER_SUNRISE_H) * TICKS_PER_HOUR) - start;
}

/** Draws the next state for the moment the current one ends and stores it as the forecast. */
export function drawForecast(sim: Sim): void {
  const w = sim.state.env.weather;
  const rng = sim.stream('rng.weather');
  const ctx = fillCtx(sim, w.dwellEndTick);
  const state = drawNextState(ctx, w.state, rng);
  const fc: WeatherForecast = { state, intensityClass: state === 'rain' ? drawRainClass(rng) : null, startTick: w.dwellEndTick };
  w.forecast = fc;
}

/**
 * Makes `to` the current weather: draws its dwell, sets the precipitation peak, and redraws the forecast.
 * `emit` false is for the initial state. Lagged values (cloud, offsets) are left to relax unless `snap`.
 */
export function enterState(sim: Sim, to: WeatherState, cls: RainClass | null, reason: string, emit: boolean): void {
  const s = sim.state;
  const w = s.env.weather;
  const rng = sim.stream('rng.weather');
  const from = w.state;
  const tick = s.tick;
  const ctx = fillCtx(sim, tick);
  w.state = to;
  w.intensityClass = to === 'rain' ? (cls ?? drawRainClass(rng)) : null;
  w.startTick = tick;
  const dwellTicks = Math.max(1, Math.round(drawDwellHours(ctx.season, to, w.intensityClass, rng) * TICKS_PER_HOUR));
  let end = tick + dwellTicks;
  if (to === 'heat') end = Math.min(end, hardHeatStop(sim, tick));
  if (to === 'frost') end = thawAdjusted(sim, end);
  w.dwellEndTick = Math.max(end, tick + 1);
  w.peakPrecip = to === 'rain' && w.intensityClass ? PRECIP_NORM[w.intensityClass] : to === 'storm' ? STORM_PRECIP_NORM : 0;
  w.precip = 0;
  w.rainRateMmH = 0;
  w.history.coldSnapExt = 0;
  const wasWet = from === 'rain' || from === 'storm', isWet = to === 'rain' || to === 'storm';
  if (wasWet && !isWet) w.history.lastRainEndTick = tick;
  if (to === 'storm') {
    w.lightningNextTick = tick + LIGHTNING_MIN_GAP_TICKS + Math.round(-LIGHTNING_MEAN_EXTRA_TICKS * Math.log(1 - rngFloat(rng)));
    if (from !== 'storm') turnWind(sim, WIND_STORM_TURN_DEG);
  } else {
    w.lightningNextTick = -1;
  }
  drawForecast(sim);
  if (emit) sim.emit({ type: 'weather.changed', from, to, intensityClass: w.intensityClass, reason });
}

function turnWind(sim: Sim, deg: number): void {
  const d = sim.state.env.weather.windDir;
  const a = (deg * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
  const x = d.x * c - d.z * sn, z = d.x * sn + d.z * c;
  d.x = x;
  d.z = z;
}

/** The current state's dwell has ended: extend a winter cold snap, or move to the forecast state. */
export function advanceWeather(sim: Sim): void {
  const s = sim.state;
  const w = s.env.weather;
  const rng = sim.stream('rng.weather');
  const cal = deriveCalendar(calendarTick(s), s.config, s.env.calendar.moonPhase0, calScratch);
  if (w.state === 'frost' && cal.season === 'winter' && w.history.coldSnapExt < COLDSNAP_MAX_EXT && rngChance(rng, P_COLDSNAP_PERSIST)) {
    w.history.coldSnapExt++;
    w.dwellEndTick += COLDSNAP_EXT_H * TICKS_PER_HOUR;
    if (w.forecast) w.forecast.startTick = w.dwellEndTick;
    return;
  }
  const fc = w.forecast;
  if (fc) {
    enterState(sim, fc.state, fc.intensityClass, 'transition', true);
    return;
  }
  const next = drawNextState(fillCtx(sim, s.tick), w.state, rng);
  enterState(sim, next, null, 'transition', true);
}

/** First weather of a game: `clear` or `overcast`, the first dry spell, and lagged values settled at their targets. */
export function initWeather(sim: Sim): void {
  const s = sim.state;
  const w = s.env.weather;
  const rng = sim.stream('rng.weather');
  const total = (INITIAL_WEATHER_WEIGHTS.clear ?? 0) + (INITIAL_WEATHER_WEIGHTS.overcast ?? 0);
  const first: WeatherState = rngFloat(rng) * total < (INITIAL_WEATHER_WEIGHTS.clear ?? 0) ? 'clear' : 'overcast';
  rollDryspell(sim, s.tick);
  enterState(sim, first, null, 'init', false);
  settleLagged(sim);
  const a = Math.max(-ANOMALY_CLAMP_C, Math.min(ANOMALY_CLAMP_C, rngGauss(rng, 0, ANOMALY_SD_C / Math.sqrt(1 - ANOMALY_AR * ANOMALY_AR))));
  w.anomalyPrev = a;
  w.anomalyCur = a;
}

/** Puts the lagged weather values (cloud, offset, diurnal multiplier) at their targets. */
export function settleLagged(sim: Sim): void {
  const w = sim.state.env.weather;
  w.cloud = WEATHER_DEFS[w.state].cloud;
  w.wOff = woffTarget(sim, true);
  w.dmCur = dmTarget(w.state);
}

/** Forces a weather state (cheats, scripted starts): as a transition, with the lagged values settled. */
export function forceWeather(sim: Sim, state: WeatherState, cls: RainClass | null, reason = 'cheat'): void {
  enterState(sim, state, cls, reason, true);
  settleLagged(sim);
}

/** Next state hint for telegraphing: the state, rain class and the tick it is due (state ticks), or null. */
export function weatherForecast(sim: Sim): WeatherForecast | null {
  return sim.state.env.weather.forecast ?? null;
}
