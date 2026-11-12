// Helpers for the environment tests: small sims with a chosen clock, season length, weather and ground.

import type { MaterialId, RainClass, SeasonLengthDays, Sim, SpeciesId, WeatherState, ZoneType } from '@/sim/types';
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { requireSpecies } from '@/sim/species';
import { defaultWorldParams } from '@/worldgen';
import { buildWorld } from '@/sim/testing/worldBuilder';
import { DEFAULT_DAYS_PER_YEAR, ticksPerYear } from '@/sim/time';
import { DEFAULT_SEASON_LENGTH_DAYS, resolveRules } from '@/sim/balance';
import { timeHandlers } from './timeCommands';
import { antThermalSystem } from './antThermal';
import { calendarSystem } from './calendar';
import { skipSystem } from './timeCommands';
import { weatherSystem } from './system';

const envSystems = [calendarSystem, weatherSystem, antThermalSystem, skipSystem];
import type { DifficultyId, WeatherSeverity } from '@/sim/types';

export interface EnvSimOptions {
  species?: SpeciesId;
  seed?: number;
  seasonLengthDays?: SeasonLengthDays;
  zone?: ZoneType;
  surface?: MaterialId;
  difficulty?: DifficultyId;
  severity?: WeatherSeverity;
  /** Fill the shade map (0..255). */
  shade?: number;
  /** Run the environment's own systems on `sim.tick()` (default: no systems). */
  withSystems?: boolean;
}

/** A flat test world (lawn over loam unless told) and a sim without systems; cheats on. */
export function envSim(o: EnvSimOptions = {}): Sim {
  const species = o.species ?? 'lasius-niger';
  const seed = o.seed ?? 1;
  const seasonLength = o.seasonLengthDays ?? (DEFAULT_SEASON_LENGTH_DAYS as SeasonLengthDays);
  const bu = requireSpecies(species).buMm;
  const size = 128 * bu;
  const params = { ...defaultWorldParams(species, seed), sizeClass: 'compact' as const, rivalCount: 0, incipientCount: 0 };
  const world = buildWorld({ params, size, bu, height: () => 0, zone: o.zone, surface: o.surface });
  if (o.shade) world.maps.shade.data.fill(o.shade);
  const base = defaultGameConfig(species, seed, o.difficulty ?? 'naturalist', seasonLength);
  const rules = resolveRules(o.difficulty ?? 'naturalist', { weatherSeverity: o.severity ?? 'normal' }, seasonLength);
  const { state } = createNewGame({ ...base, rules, cheats: true, world: world.params }, world);
  return createSim(state, world, { systems: o.withSystems ? envSystems : [] });
}

/** Sets the calendar to default-year day `d28` (0-based, fractional: doy 11 at noon = 10.5), scaled to the sim's season length. */
export function setClockD(sim: Sim, d28: number): void {
  const tick = Math.round((d28 / DEFAULT_DAYS_PER_YEAR) * ticksPerYear(sim.state.config));
  timeHandlers['cheat.setTime']!(sim, { type: 'cheat.setTime', tick });
}

/** Forces a weather state and settles lagged values, with no thermal lag and a fixed anomaly. */
export function settleWeather(sim: Sim, state: WeatherState, anomaly = 0, cls: RainClass | null = null): void {
  timeHandlers['cheat.setWeather']!(sim, { type: 'cheat.setWeather', state, intensityClass: cls });
  timeHandlers['cheat.setAnomaly']!(sim, { type: 'cheat.setAnomaly', c: anomaly });
  timeHandlers['cheat.noLag']!(sim, { type: 'cheat.noLag', on: true });
  // Keep the state for the whole test: no transition.
  sim.state.env.weather.dwellEndTick = Number.MAX_SAFE_INTEGER;
  sim.events.flush();
}

/** Collects events of one type. */
export function collect<T>(sim: Sim, type: string): T[] {
  const out: T[] = [];
  (sim.events as unknown as { on(t: string, f: (e: T) => void): void }).on(type, (e) => out.push(e));
  return out;
}

// ---- long weather runs ----

import { WEATHER_STATES } from '@/sim/types';
import type { Season } from '@/sim/types';
import { calendarNow } from './calendar';
import { ensureThermal } from './surface';
import { drawContextAt } from './weather';
import { transitionWeights } from './weatherDraw';
import { stepWeather } from './weatherStep';

export interface Transition {
  /** state tick of the transition */
  tick: number;
  from: WeatherState;
  to: WeatherState;
  cls: RainClass | null;
  season: Season;
  hour: number;
  yearFrac: number;
  /** ticks since the season started */
  sinceSeasonTick: number;
  /** dwell of `from`, game hours */
  dwellH: number;
  fromClass: RainClass | null;
  /** The forecast made before this transition. */
  forecast: { state: WeatherState; startTick: number } | null;
  /** Normalised weights the draw used (WEATHER_STATES order), as of the forecast time. */
  expected: number[];
}

/** Steps only the weather (no thermal fields) for `ticks` ticks of 25, recording every transition. */
export function runWeather(sim: Sim, ticks: number): Transition[] {
  ensureThermal(sim);
  const out: Transition[] = [];
  const w = sim.state.env.weather;
  const scratch = new Float64Array(WEATHER_STATES.length);
  const steps = Math.floor(ticks / 25);
  for (let i = 0; i < steps; i++) {
    const before = { state: w.state, start: w.startTick, cls: w.intensityClass, fc: w.forecast ? { state: w.forecast.state, startTick: w.forecast.startTick } : null };
    sim.state.tick += 25;
    stepWeather(sim, 25);
    sim.events.flush();
    if (w.startTick !== before.start) {
      const cal = calendarNow(sim);
      const ctx = drawContextAt(sim, before.fc ? before.fc.startTick : sim.state.tick);
      transitionWeights(ctx, before.state, scratch);
      const seasonStart = cal.dayOfSeason - 1;
      out.push({
        tick: sim.state.tick, from: before.state, to: w.state, cls: w.intensityClass, season: cal.season, hour: cal.hour,
        yearFrac: cal.yearFrac, sinceSeasonTick: seasonStart * 6000 + Math.round(cal.hour * 250), dwellH: (sim.state.tick - before.start) / 250,
        fromClass: before.cls, forecast: before.fc, expected: Array.from(scratch),
      });
    }
  }
  return out;
}

/** JSON of a value with typed arrays expanded (for state equality checks). */
export function stableJson(v: unknown): string {
  return JSON.stringify(v, (_k, x) => (ArrayBuffer.isView(x) ? Array.from(x as unknown as ArrayLike<number>) : x));
}
