// Helpers for the environment tests: small sims with a chosen clock, season length, weather and ground.

import type { MaterialId, RainClass, Sim, SpeciesId, WeatherState, ZoneType } from '@/sim/types';
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { requireSpecies } from '@/sim/species';
import { defaultWorldParams } from '@/worldgen';
import { buildWorld } from '@/sim/testing/worldBuilder';
import { ticksPerYear } from '@/sim/time';
import { resolveRules } from '@/sim/balance';
import { timeHandlers } from './timeCommands';
import type { DifficultyId, WeatherSeverity } from '@/sim/types';

export interface EnvSimOptions {
  species?: SpeciesId;
  seed?: number;
  seasonLengthDays?: 5 | 7 | 10;
  zone?: ZoneType;
  surface?: MaterialId;
  difficulty?: DifficultyId;
  severity?: WeatherSeverity;
  /** Fill the shade map (0..255). */
  shade?: number;
}

/** A flat test world (lawn over loam unless told) and a sim without systems; cheats on. */
export function envSim(o: EnvSimOptions = {}): Sim {
  const species = o.species ?? 'lasius-niger';
  const seed = o.seed ?? 1;
  const bu = requireSpecies(species).buMm;
  const size = 128 * bu;
  const params = { ...defaultWorldParams(species, seed), sizeClass: 'compact' as const, rivalCount: 0, incipientCount: 0 };
  const world = buildWorld({ params, size, bu, height: () => 0, zone: o.zone, surface: o.surface });
  if (o.shade) world.maps.shade.data.fill(o.shade);
  const base = defaultGameConfig(species, seed, o.difficulty ?? 'naturalist', o.seasonLengthDays ?? 7);
  const rules = resolveRules(o.difficulty ?? 'naturalist', { weatherSeverity: o.severity ?? 'normal' }, o.seasonLengthDays ?? 7);
  const { state } = createNewGame({ ...base, rules, cheats: true, world: world.params }, world);
  return createSim(state, world, { systems: [] });
}

/** Sets the calendar to default-year day `d28` (0-based, fractional: doy 11 at noon = 10.5), scaled to the sim's season length. */
export function setClockD(sim: Sim, d28: number): void {
  const tick = Math.round((d28 / 28) * ticksPerYear(sim.state.config));
  timeHandlers['cheat.setTime']!(sim, { type: 'cheat.setTime', tick });
}

/** Forces a weather state and settles lagged values, with no thermal lag and a fixed anomaly. */
export function settleWeather(sim: Sim, state: WeatherState, anomaly = 0, cls: RainClass | null = null): void {
  timeHandlers['cheat.setWeather']!(sim, { type: 'cheat.setWeather', state, intensityClass: cls });
  timeHandlers['cheat.setAnomaly']!(sim, { type: 'cheat.setAnomaly', c: anomaly });
  timeHandlers['cheat.noLag']!(sim, { type: 'cheat.noLag', on: true });
  // Keep the state for the whole test: no transition.
  sim.state.env.weather.dwellEndTick = Number.MAX_SAFE_INTEGER;
}

/** Collects events of one type. */
export function collect<T>(sim: Sim, type: string): T[] {
  const out: T[] = [];
  (sim.events as unknown as { on(t: string, f: (e: T) => void): void }).on(type, (e) => out.push(e));
  return out;
}
