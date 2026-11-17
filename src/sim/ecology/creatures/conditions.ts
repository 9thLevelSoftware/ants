// What creatures need to know about the time, weather and difficulty, computed once per tick (derived cache, not
// persisted: a function of state).

import type { DayPhase, Season, Sim } from '@/sim/types';
import { calendarNow } from '@/sim/environment/calendar';
import { currentDefaultYearDoy } from '@/sim/time';
import type { Vec3 } from '@/core/math/vec3';
import { CREATURE_LEVERS, ROVE_DAY_ZONES, type CreatureLevers } from '@/sim/balance/creatures';
import { zoneAt } from '@/sim/world';
import { difficultyValue } from '@/sim/balance/difficulty';
import { ports } from './ports';

export interface Conditions {
  tick: number;
  season: Season;
  /** Default-year day of year (GDD 05 §0 day numbers, 1..28). */
  d28: number;
  hour: number;
  phase: DayPhase;
  sunrise: number;
  sunset: number;
  /** Daytime (any phase but night). */
  day: boolean;
  /** Night or twilight (dusk / dawn). */
  dark: boolean;
  airC: number;
  raining: boolean;
  winter: boolean;
  levers: CreatureLevers;
  /** Predators setting multiplier (0 = off). */
  predatorMult: number;
}

/**
 * Per-tick cache. Also keyed by the difficulty inputs' identity: a setting changed within a tick (a command, a test)
 * must be seen at once, or the running game would decide differently from a reload at the same tick.
 */
interface Cached { c: Conditions; difficulty: object; preset: string; params: object; custom: object | undefined; rules: object }
const cache = new WeakMap<Sim, Cached>();

export function conditions(sim: Sim): Conditions {
  const hit = cache.get(sim);
  const d = sim.state.config.difficulty, rules = sim.state.config.rules;
  if (hit && hit.c.tick === sim.state.tick && hit.difficulty === d && hit.preset === d.preset && hit.params === d.params
    && hit.custom === d.custom && hit.rules === rules) return hit.c;
  const cal = calendarNow(sim);
  const cfg = sim.state.config;
  const c: Conditions = {
    tick: sim.state.tick, season: cal.season, d28: currentDefaultYearDoy(sim.state), hour: cal.hour, phase: cal.phase,
    sunrise: cal.sunrise, sunset: cal.sunset, day: cal.phase !== 'night',
    dark: cal.phase === 'night' || cal.phase === 'dusk' || cal.phase === 'dawn',
    airC: safe(() => ports.airTemp(sim), 20), raining: safe(() => ports.isRaining(sim), false),
    winter: cal.season === 'winter',
    levers: CREATURE_LEVERS[cfg.difficulty.preset] ?? CREATURE_LEVERS.naturalist,
    predatorMult: difficultyValue(sim, 'predatorDensityMult'),
  };
  cache.set(sim, { c, difficulty: d, preset: d.preset, params: d.params, custom: d.custom, rules });
  return c;
}

function safe<T>(f: () => T, fallback: T): T {
  try {
    const v = f();
    return typeof v === 'number' && !Number.isFinite(v) ? fallback : v;
  } catch {
    return fallback;
  }
}

/** True while the default-year window a..b (inclusive) holds. */
export function inDays(c: Conditions, range: readonly [number, number]): boolean {
  return c.d28 >= range[0] && c.d28 <= range[1];
}

/** Night-active visitors (centipede, rove beetle, millipede): out at night and twilight, never in winter. */
export function nightActive(c: Conditions): boolean {
  return !c.winter && c.dark;
}

/** Rove beetles: night-active everywhere, and by day in leaf litter (§2.2a "dusk/night; day in litter"). */
export function roveBeetleActive(sim: Sim, c: Conditions, pos: Vec3): boolean {
  return nightActive(c) || (!c.winter && c.day && ROVE_DAY_ZONES.includes(zoneAt(sim.world, pos.x, pos.z)));
}
