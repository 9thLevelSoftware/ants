// The environment as a running system: determinism, plain data, save/load equivalence, ant thermals through ticks,
// time-control commands and the cheats.

import { describe, expect, it } from 'vitest';
import { createSim } from '@/sim/sim';
import { findNonPlain } from '@/sim/testing/plainData';
import { TICKS_PER_DAY } from '@/sim/time';
import { airTemp } from './temperature';
import { soilTemp } from './soil';
import { ensureThermal, surfaceTemp, thermalReady } from './surface';
import { chamberTemp } from './chamber';
import { lightLevel, sunDirection } from './light';
import { isRaining, rainRate, windAt } from './queries';
import { speedMult, surfaceActivity } from './thermalResponse';
import { calendarNow } from './calendar';
import { collect, envSim, setClockD, stableJson } from './envTestKit';
import { commandHandlers } from './index';
import { endSkip } from './timeCommands';
import { isNoLag } from './noLag';
import type { Command, SpeedLevel } from '@/sim/types';

function runTicks(sim: ReturnType<typeof envSim>, n: number): void {
  for (let i = 0; i < n; i++) sim.tick();
}

describe('state is plain data and runs deterministically', () => {
  it('a long run keeps SimState.env plain (no undefined, functions, instances or non-finite numbers)', () => {
    const sim = envSim({ seed: 2, withSystems: true });
    runTicks(sim, 4 * TICKS_PER_DAY);
    expect(findNonPlain(sim.state.env)).toEqual([]);
    expect(findNonPlain(sim.state.rngStreams)).toEqual([]);
  });

  it('the same seed gives the same environment after N ticks; another seed differs', () => {
    const run = (seed: number) => {
      const sim = envSim({ seed, withSystems: true });
      runTicks(sim, 3 * TICKS_PER_DAY);
      return stableJson(sim.state.env);
    };
    expect(run(5)).toBe(run(5));
    expect(run(5)).not.toBe(run(6));
  });

  it('a state cloned mid-run (as a save/load does) continues identically', () => {
    const a = envSim({ seed: 9, withSystems: true });
    runTicks(a, 2 * TICKS_PER_DAY + 123);
    const clone = structuredClone(a.state);
    const b = createSim(clone, a.world, { systems: a.systems });
    runTicks(a, 2 * TICKS_PER_DAY);
    runTicks(b, 2 * TICKS_PER_DAY);
    expect(stableJson(b.state.env)).toBe(stableJson(a.state.env));
    expect(stableJson(b.state.rngStreams)).toBe(stableJson(a.state.rngStreams));
  });

  it('the environment never produces NaN or infinities over a year of ticks (every query, every game hour)', () => {
    const sim = envSim({ seed: 3, withSystems: true });
    const p = { x: 500, y: 0, z: 500 };
    const out = { x: 0, y: 0, z: 0 };
    for (let h = 0; h < 28 * 24; h++) {
      runTicks(sim, 250);
      const vals = [
        airTemp(sim), soilTemp(sim, p), soilTemp(sim, 300, 400, 400), surfaceTemp(sim, p), lightLevel(sim), lightLevel(sim, p),
        windAt(sim), rainRate(sim), speedMult(sim, airTemp(sim), 'lasius-niger'), surfaceActivity(sim, 'lasius-niger'),
        chamberTemp(sim, 12345), sunDirection(sim, out).y, calendarNow(sim).daylight,
      ];
      for (const v of vals) expect(Number.isFinite(v), `hour ${h}`).toBe(true);
      expect(isRaining(sim) === (rainRate(sim) >= 0.05)).toBe(true);
    }
    expect(findNonPlain(sim.state.env)).toEqual([]);
  }, 60000);

  it('keeps the temperatures sane over a year: the air swings between about -5 and 35 C in the reference climate', () => {
    const sim = envSim({ seed: 4, withSystems: true });
    let lo = 99, hi = -99;
    for (let h = 0; h < 2 * 28 * 24; h++) {
      runTicks(sim, 250);
      const t = airTemp(sim);
      lo = Math.min(lo, t);
      hi = Math.max(hi, t);
    }
    expect(lo).toBeGreaterThan(-12);
    expect(lo).toBeLessThan(4);
    expect(hi).toBeGreaterThan(24);
    expect(hi).toBeLessThan(38);
  }, 60000);
});

describe('ants feel the environment through ticks', () => {
  it('body temperature follows the micro temperature', () => {
    const sim = envSim({ seed: 2, withSystems: true, zone: 'forest', surface: 'loam' });
    const ant = sim.state.ants[0];
    ant.pos = { x: 500, y: 0, z: 500 };
    ant.tb = 5;
    runTicks(sim, 300); // 30 s
    expect(ant.tb).toBeGreaterThan(12);
    expect(ant.alive).toBe(true);
  });
});

function cmd<K extends Command['type']>(c: Extract<Command, { type: K }>): Command {
  return c;
}

describe('time control commands', () => {
  function apply(sim: ReturnType<typeof envSim>, c: Command): void {
    const h = commandHandlers[c.type as keyof typeof commandHandlers] as ((s: typeof sim, c: Command) => void) | undefined;
    h?.(sim, c);
    sim.events.flush();
  }

  it('setSpeed and pause: pause keeps the running speed; togglePause resumes it', () => {
    const sim = envSim();
    const changes = collect<{ from: number; to: number }>(sim, 'time.speed-changed');
    apply(sim, cmd({ type: 'setSpeed', speed: 4 }));
    expect(sim.state.env.time).toMatchObject({ speed: 4, requested: 4, paused: false });
    apply(sim, cmd({ type: 'setSpeed', speed: 0 }));
    expect(sim.state.env.time).toMatchObject({ speed: 4, paused: true });
    apply(sim, cmd({ type: 'togglePause' }));
    expect(sim.state.env.time.paused).toBe(false);
    expect(changes.map((c) => [c.from, c.to])).toEqual([[1, 4], [4, 0], [0, 4]]);
  });

  it('8x is refused while possessing an ant, 4x is accepted (E12)', () => {
    const sim = envSim();
    sim.state.player.possessedAntId = sim.state.ants[0].id;
    const refused = collect<{ speed: number; reason: string }>(sim, 'speed-refused');
    const rejected = collect<{ type: string }>(sim, 'command-rejected');
    apply(sim, cmd({ type: 'setSpeed', speed: 8 as SpeedLevel }));
    expect(refused).toEqual([{ type: 'speed-refused', speed: 8, reason: 'possession' }]);
    expect(rejected).toEqual([{ type: 'command-rejected', commandType: 'setSpeed', reason: 'not-allowed-while-possessing', detail: '8' }]);
    expect(sim.state.env.time.speed).toBe(1);
    apply(sim, cmd({ type: 'setSpeed', speed: 4 }));
    expect(sim.state.env.time.speed).toBe(4);
  });

  it('opening phases search..lay allow at most 2x', () => {
    const sim = envSim();
    for (const phase of ['search', 'dig', 'seal', 'lay'] as const) {
      sim.state.player.opening!.phase = phase;
      sim.state.env.time.speed = 1;
      apply(sim, cmd({ type: 'setSpeed', speed: 4 }));
      expect(sim.state.env.time.speed, phase).toBe(1);
      apply(sim, cmd({ type: 'setSpeed', speed: 2 }));
      expect(sim.state.env.time.speed, phase).toBe(2);
    }
    sim.state.player.opening!.phase = 'handover';
    apply(sim, cmd({ type: 'setSpeed', speed: 8 }));
    expect(sim.state.env.time.speed).toBe(8);
  });

  it('auto-slow mode is stored', () => {
    const sim = envSim();
    apply(sim, cmd({ type: 'setAutoSlow', mode: 'pause' }));
    expect(sim.state.env.time.autoSlow).toBe('pause');
  });

  it('skip to next event runs at 8x until the next dawn or dusk, then back to 1x', () => {
    const sim = envSim({ withSystems: true });
    sim.tick(); // the first tick draws the first weather
    setClockD(sim, 10 + 12 / 24); // noon
    const changes = collect<{ from: number; to: number; reason: string }>(sim, 'time.speed-changed');
    apply(sim, cmd({ type: 'skipToNextEvent' }));
    expect(sim.state.env.time.speed).toBe(8);
    expect(sim.state.env.time.skipUntil).toBeGreaterThan(sim.state.tick);
    sim.state.env.weather.dwellEndTick = Number.MAX_SAFE_INTEGER;
    let n = 0;
    while (sim.state.env.time.skipUntil >= 0 && n++ < TICKS_PER_DAY) sim.tick();
    expect(calendarNow(sim).phase).toBe('dusk');
    expect(sim.state.env.time.speed).toBe(1);
    expect(changes.map((c) => c.reason)).toEqual(['skip', 'dusk']);
  });

  it('a quiet day ends the skip after one game day', () => {
    const sim = envSim({ withSystems: true });
    sim.tick();
    setClockD(sim, 10 + 12 / 24);
    apply(sim, cmd({ type: 'skipToNextEvent' }));
    // Remove every qualifying event: the first phase boundary is far enough only if we cut the skip window.
    sim.state.env.time.skipUntil = sim.state.tick + 5;
    sim.state.env.weather.dwellEndTick = Number.MAX_SAFE_INTEGER;
    const reasons = collect<{ reason: string }>(sim, 'time.speed-changed');
    runTicks(sim, 10);
    expect(reasons.map((r) => r.reason)).toEqual(['quiet-day']);
    expect(sim.state.env.time.speed).toBe(1);
  });

  it('skip is refused while possessing and while a critical alert is active', () => {
    const sim = envSim();
    const rejected = collect<{ commandType: string; reason: string }>(sim, 'command-rejected');
    sim.state.player.possessedAntId = sim.state.ants[0].id;
    apply(sim, cmd({ type: 'skipToNextEvent' }));
    sim.state.player.possessedAntId = -1;
    sim.state.progression.alerts.push({ level: 'critical' } as never);
    apply(sim, cmd({ type: 'skipToNextEvent' }));
    expect(rejected.map((r) => r.reason)).toEqual(['possession', 'critical-alert']);
    expect(sim.state.env.time.skipUntil).toBe(-1);
  });

  it('a manual speed choice ends a skip, and endSkip is a no-op without one', () => {
    const sim = envSim();
    endSkip(sim, 'x');
    expect(sim.state.env.time.speed).toBe(1);
    apply(sim, cmd({ type: 'skipToNextEvent' }));
    apply(sim, cmd({ type: 'setSpeed', speed: 2 }));
    expect(sim.state.env.time.skipUntil).toBe(-1);
    expect(sim.state.env.time.speed).toBe(2);
  });
});

describe('environment cheats', () => {
  function apply(sim: ReturnType<typeof envSim>, c: Command): void {
    (commandHandlers[c.type as keyof typeof commandHandlers] as (s: typeof sim, c: Command) => void)(sim, c);
    sim.events.flush();
  }

  it('cheat.setTime moves the calendar tick and re-settles the weather; state.tick is untouched', () => {
    const sim = envSim();
    sim.state.tick = 777;
    apply(sim, cmd({ type: 'cheat.setTime', tick: 5 * TICKS_PER_DAY + 3000 }));
    expect(sim.state.tick).toBe(777);
    const cal = calendarNow(sim);
    expect([cal.dayIndex, cal.hour]).toEqual([5, 12]);
  });

  it('cheat.setWeather announces the change with the outgoing and incoming state', () => {
    const sim = envSim();
    const ev = collect<{ from: string; to: string; intensityClass: string | null }>(sim, 'weather.changed');
    ensureThermal(sim); // the opening weather is drawn by the simulation side, not by reads
    const from = sim.state.env.weather.state;
    apply(sim, cmd({ type: 'cheat.setWeather', state: 'storm', intensityClass: null }));
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ from, to: 'storm', intensityClass: null });
    apply(sim, cmd({ type: 'cheat.setWeather', state: 'rain', intensityClass: 'downpour' }));
    expect(ev[1]).toMatchObject({ from: 'storm', to: 'rain', intensityClass: 'downpour' });
  });

  it('cheat.setWind, setAnomaly and noLag', () => {
    const sim = envSim();
    apply(sim, cmd({ type: 'cheat.setWind', ms: 7.5 }));
    expect(windAt(sim)).toBe(7.5);
    apply(sim, cmd({ type: 'cheat.setAnomaly', c: -3 }));
    expect(sim.state.env.weather.anomalyCur).toBe(-3);
    expect(sim.state.env.weather.anomalyPrev).toBe(-3);
    apply(sim, cmd({ type: 'cheat.noLag', on: true }));
    expect(isNoLag(sim.state)).toBe(true);
    apply(sim, cmd({ type: 'cheat.noLag', on: false }));
    expect(isNoLag(sim.state)).toBe(false);
  });

  it('cheat.setWind holds across weather steps until released by a negative value', () => {
    const sim = envSim({ withSystems: true });
    apply(sim, cmd({ type: 'cheat.setWind', ms: 7 }));
    for (let i = 0; i < 25 * 400; i++) {
      sim.tick();
      if (i % 25 === 0) expect(windAt(sim)).toBe(7);
    }
    apply(sim, cmd({ type: 'cheat.setWind', ms: -1 }));
    for (let i = 0; i < 25 * 40; i++) sim.tick();
    expect(windAt(sim)).not.toBe(7);
  });

  it('commands that touch the weather start it first (queries never do)', () => {
    for (const c of [
      cmd({ type: 'cheat.setAnomaly', c: 1 }), cmd({ type: 'cheat.noLag', on: true }),
      cmd({ type: 'cheat.setTime', tick: 3 * TICKS_PER_DAY }), cmd({ type: 'cheat.setWind', ms: 2 }),
    ]) {
      const sim = envSim();
      expect(thermalReady(sim)).toBe(false);
      apply(sim, c);
      expect(thermalReady(sim), c.type).toBe(true);
    }
  });

  it('before the simulation starts the thermal state, queries answer the degraded constants and change nothing', () => {
    const sim = envSim();
    const before = stableJson(sim.state.env);
    expect(surfaceTemp(sim, 1000, 1000)).toBe(21);
    expect(Number.isFinite(soilTemp(sim, 100, 1000, 1000))).toBe(true);
    expect(stableJson(sim.state.env)).toBe(before);
    ensureThermal(sim);
    expect(thermalReady(sim)).toBe(true);
  });
});
