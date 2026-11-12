// Time control commands and the environment's cheats (GDD 06 §4, App. B). Sim state is written by commands and read
// by the game loop: `env.time` holds speed, pause and skip target. The loop itself lives in the game layer.

import type { CommandHandlerMap, Sim, SpeedLevel, System } from '@/sim/types';
import { OPENING_MAX_SPEED, POSSESS_MAX_SPEED, SKIP_MAX_GD, SKIP_SPEED } from '@/sim/balance';
import { calendarTick, TICKS_PER_DAY } from '@/sim/time';
import { calendarNow, deriveCalendar } from './calendar';
import { setNoLag } from './noLag';
import { ensureThermal, resetThermal } from './surface';
import { drawForecast, forceWeather, rollDryspell, settleLagged } from './weather';
import { baseWind, setWindHold } from './wind';

/** Opening phases in which time runs at most OPENING_MAX_SPEED (GDD 06 §4, E-17). */
const SLOW_OPENING_PHASES: ReadonlySet<string> = new Set(['search', 'dig', 'seal', 'lay']);

function setSpeed(sim: Sim, speed: SpeedLevel): void {
  const time = sim.state.env.time;
  const from: SpeedLevel = time.paused ? 0 : time.speed;
  if (speed > POSSESS_MAX_SPEED && sim.state.player.possessedAntId !== -1) {
    return sim.emit({ type: 'speed-refused', speed, reason: 'possession' });
  }
  const phase = sim.state.player.opening?.phase;
  if (speed > OPENING_MAX_SPEED && phase !== undefined && SLOW_OPENING_PHASES.has(phase)) {
    return sim.emit({ type: 'speed-refused', speed, reason: 'opening' });
  }
  time.skipUntil = -1; // a manual speed choice ends a skip
  if (speed === 0) {
    time.paused = true;
  } else {
    time.paused = false;
    time.speed = speed;
    time.requested = speed;
  }
  if (from !== speed) sim.emit({ type: 'time.speed-changed', from, to: speed, reason: 'command' });
}

/** Ends a skip-to-next-event run: back to 1x (no-op when no skip is running). */
export function endSkip(sim: Sim, reason: string): void {
  const time = sim.state.env.time;
  if (time.skipUntil < 0) return;
  const from: SpeedLevel = time.speed;
  time.skipUntil = -1;
  time.speed = 1;
  time.requested = 1;
  if (from !== 1) sim.emit({ type: 'time.speed-changed', from, to: 1, reason });
}

function skipToNextEvent(sim: Sim): void {
  const s = sim.state;
  if (s.player.possessedAntId !== -1) {
    return sim.emit({ type: 'command-rejected', commandType: 'skipToNextEvent', reason: 'possession' });
  }
  if (s.progression.alerts.some((a) => a.level === 'critical')) {
    return sim.emit({ type: 'command-rejected', commandType: 'skipToNextEvent', reason: 'critical-alert' });
  }
  const time = s.env.time;
  const from: SpeedLevel = time.paused ? 0 : time.speed;
  time.paused = false;
  time.speed = SKIP_SPEED;
  time.skipUntil = s.tick + Math.round(SKIP_MAX_GD * TICKS_PER_DAY);
  if (from !== SKIP_SPEED) sim.emit({ type: 'time.speed-changed', from, to: SKIP_SPEED, reason: 'skip' });
}

/** Ends a skip at the next dawn, dusk, weather change or season change, or after SKIP_MAX_GD ("quiet day"). */
export const skipSystem: System = {
  name: 'skip-to-event',
  phase: 'environment',
  run(sim) {
    const s = sim.state;
    if (s.env.time.skipUntil < 0) return;
    if (s.tick >= s.env.time.skipUntil) return endSkip(sim, 'quiet-day');
    const ct = calendarTick(s);
    const now = calendarNow(sim);
    const prev = deriveCalendar(ct - 1, s.config, s.env.calendar.moonPhase0);
    if (prev.phase !== now.phase && (now.phase === 'dawn' || now.phase === 'dusk')) return endSkip(sim, now.phase);
    if (prev.season !== now.season) return endSkip(sim, 'season');
    if (s.env.weather.startTick === s.tick) return endSkip(sim, 'weather');
  },
};

/**
 * Recomputes everything derived from the calendar after the clock was moved (cheat.setTime). A game that has not
 * started its weather yet simply starts it now, at the new time.
 */
function resettleAfterClockChange(sim: Sim): void {
  if (ensureThermal(sim)) return;
  rollDryspell(sim, sim.state.tick);
  drawForecast(sim);
  settleLagged(sim);
  resetThermal(sim);
}

export const timeHandlers: Partial<CommandHandlerMap> = {
  setSpeed: (sim, c) => setSpeed(sim, c.speed),
  togglePause: (sim) => setSpeed(sim, sim.state.env.time.paused ? sim.state.env.time.speed : 0),
  setAutoSlow: (sim, c) => {
    sim.state.env.time.autoSlow = c.mode;
  },
  skipToNextEvent: (sim) => skipToNextEvent(sim),
  'cheat.setTime': (sim, c) => {
    // `tick` is the calendar tick (ticks since 00:00 of spring day 1, year 1): the start anchor moves, state.tick does not.
    sim.state.env.calendar.startTick = c.tick - sim.state.tick;
    resettleAfterClockChange(sim);
  },
  'cheat.setWeather': (sim, c) => {
    ensureThermal(sim);
    forceWeather(sim, c.state, c.intensityClass, 'cheat');
  },
  // The wind stays at `ms` until the next setWind (a negative value releases it): the noise term is shifted too, so a
  // release continues from there.
  'cheat.setWind': (sim, c) => {
    ensureThermal(sim);
    const w = sim.state.env.weather;
    if (c.ms >= 0) {
      w.windOu = (w.windOu ?? 0) + (c.ms - baseWind(sim));
      w.gustUntilTick = -1;
      w.wind2m = c.ms;
    }
    setWindHold(sim.state, c.ms);
  },
  'cheat.setAnomaly': (sim, c) => {
    ensureThermal(sim);
    const w = sim.state.env.weather;
    w.anomalyPrev = c.c;
    w.anomalyCur = c.c;
  },
  'cheat.noLag': (sim, c) => {
    setNoLag(sim.state, c.on);
    if (!c.on) return;
    if (ensureThermal(sim)) return; // a fresh game starts settled
    settleLagged(sim);
    resetThermal(sim); // surfaces at their equilibrium
  },
};
