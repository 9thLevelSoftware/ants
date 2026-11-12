// Failure handling of the weather (GDD 06 §3.12): a corrupt weather record is reset to overcast, and a non-finite
// value that feeds the air temperature, a surface temperature or the wind is replaced by its previous good value.
// The count of such fixes is the debug counter `diag.envNaN`. Not saved: keyed by state object.

import type { Sim, SimState, WeatherStateData } from '@/sim/types';
import { WEATHER_STATES } from '@/sim/types';
import { WEATHER_REPAIR_DWELL_H } from '@/sim/balance';
import { TICKS_PER_HOUR } from '@/sim/time';
import { drawForecast } from './weather';

type Num = 'wOff' | 'anomalyPrev' | 'anomalyCur' | 'dmCur' | 'windOu' | 'wind2m' | 'cloud';
const GUARDED: readonly Num[] = ['wOff', 'anomalyPrev', 'anomalyCur', 'dmCur', 'windOu', 'wind2m', 'cloud'];

type LastGood = Record<Num, number | undefined>;
const lastGood = new WeakMap<SimState, LastGood>();
const nanCounts = new WeakMap<SimState, number>();

/** How many non-finite temperature or wind values have been replaced so far (`diag.envNaN`). */
export function envNanCount(state: SimState): number {
  return nanCounts.get(state) ?? 0;
}

/** Counts one replaced non-finite value. */
export function noteEnvNan(state: SimState): void {
  nanCounts.set(state, envNanCount(state) + 1);
}

function recordIsCorrupt(w: WeatherStateData): boolean {
  return !WEATHER_STATES.includes(w.state) || !Number.isFinite(w.dwellEndTick) || !Number.isFinite(w.startTick);
}

/** Resets a corrupt weather record to overcast for WEATHER_REPAIR_DWELL_H and announces it (`reason: 'repair'`). */
function repairRecord(sim: Sim): void {
  const w = sim.state.env.weather;
  const from = w.state;
  const tick = sim.state.tick;
  w.state = 'overcast';
  w.intensityClass = null;
  w.startTick = tick;
  w.dwellEndTick = tick + Math.round(WEATHER_REPAIR_DWELL_H * TICKS_PER_HOUR);
  w.peakPrecip = 0;
  w.precip = 0;
  w.rainRateMmH = 0;
  w.lightningNextTick = -1;
  w.gustUntilTick = -1;
  noteEnvNan(sim.state);
  drawForecast(sim);
  sim.emit({ type: 'weather.changed', from, to: 'overcast', intensityClass: null, reason: 'repair' });
}

/**
 * Run before and after each weather step (cheap, allocation-free after the first call per sim): repairs a corrupt
 * record, and puts the previous good value back for any guarded number that went non-finite.
 */
export function guardWeather(sim: Sim): void {
  const s = sim.state;
  const w = s.env.weather;
  // An unstarted game (dwellEndTick < 0) is not corrupt; the system starts it before stepping.
  if (recordIsCorrupt(w)) repairRecord(sim);
  let last = lastGood.get(s);
  if (!last) {
    last = { wOff: undefined, anomalyPrev: undefined, anomalyCur: undefined, dmCur: undefined, windOu: undefined, wind2m: undefined, cloud: undefined };
    lastGood.set(s, last);
  }
  for (const k of GUARDED) {
    const v = w[k];
    if (v === undefined || Number.isFinite(v)) {
      last[k] = v;
    } else {
      w[k] = last[k] ?? 0;
      noteEnvNan(s);
    }
  }
}
