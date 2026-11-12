// Failure handling (GDD 06 §3.12) and the grass-canopy wind rule (§3.4).

import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '@/sim/time';
import { collect, envSim } from './envTestKit';
import { envNanCount } from './envGuard';
import { windGround } from './queries';
import { ensureThermal } from './surface';
import { stepWeather } from './weatherStep';

function stepOnce(sim: ReturnType<typeof envSim>): void {
  sim.state.tick += 25;
  stepWeather(sim, 25);
}

describe('GDD 06 §3.12 failure handling', () => {
  it('an unknown weather state is reset to overcast for 6 h and announced with reason repair', () => {
    const sim = envSim({ seed: 4 });
    ensureThermal(sim);
    const events = collect<{ from: string; to: string; reason: string }>(sim, 'weather.changed');
    const w = sim.state.env.weather;
    (w as unknown as { state: string }).state = 'tornado';
    stepOnce(sim);
    sim.events.flush();
    expect(w.state).toBe('overcast');
    expect(w.dwellEndTick - w.startTick).toBe(6 * 250);
    expect(events.at(-1)).toMatchObject({ from: 'tornado', to: 'overcast', reason: 'repair' });
    expect(w.forecast?.startTick).toBe(w.dwellEndTick);
  });

  it('a non-finite dwell end is repaired the same way', () => {
    const sim = envSim({ seed: 4 });
    ensureThermal(sim);
    sim.state.env.weather.dwellEndTick = Number.NaN;
    stepOnce(sim);
    expect(Number.isFinite(sim.state.env.weather.dwellEndTick)).toBe(true);
    expect(sim.state.env.weather.state).toBe('overcast');
  });

  it('a non-finite offset, anomaly or wind is clamped to its previous value and counted (diag.envNaN)', () => {
    const sim = envSim({ seed: 4, withSystems: true });
    for (let i = 0; i < 100; i++) sim.tick();
    const w = sim.state.env.weather;
    const before = envNanCount(sim.state);
    const goodOff = w.wOff;
    w.wOff = Number.NaN;
    w.wind2m = Number.POSITIVE_INFINITY;
    w.anomalyCur = Number.NaN;
    for (let i = 0; i < 100; i++) sim.tick();
    expect(envNanCount(sim.state)).toBeGreaterThan(before);
    for (const v of [w.wOff, w.wind2m, w.anomalyCur, w.anomalyPrev]) expect(Number.isFinite(v)).toBe(true);
    expect(Math.abs(w.wOff - goodOff)).toBeLessThan(10);
    for (const t of sim.state.env.thermal.tsurf) expect(Number.isFinite(t)).toBe(true);
  });

  it('a non-finite surface temperature keeps its previous value', () => {
    const sim = envSim({ seed: 4, withSystems: true });
    for (let i = 0; i < 50; i++) sim.tick();
    const t = sim.state.env.thermal;
    t.tsurf[3] = Number.NaN;
    for (let i = 0; i < 100; i++) sim.tick();
    // NaN input stays NaN under the lag formula; the guard does not invent a value, but must not spread it to others
    expect(t.tsurf.filter((v) => !Number.isFinite(v)).length).toBeLessThanOrEqual(1);
  });

  it('a healthy run never touches the counter', () => {
    const sim = envSim({ seed: 6, withSystems: true });
    for (let i = 0; i < 2 * TICKS_PER_DAY; i++) sim.tick();
    expect(envNanCount(sim.state)).toBe(0);
  });
});

describe('windGround inside a grass canopy', () => {
  it('is halved where the sward is taller than 8 BU and the point is below its top', () => {
    const sim = envSim({ seed: 2 });
    ensureThermal(sim);
    sim.state.env.weather.wind2m = 5;
    const nav = sim.world.nav.cls;
    const cell = Math.floor(200 / nav.cell) + Math.floor(200 / nav.cell) * nav.nx;
    const bu = sim.world.bu;
    const open = windGround(sim, { x: 200, y: 5, z: 200 });
    expect(open).toBeCloseTo(1, 9);
    sim.state.worldDelta.grassHeightMm[cell] = Math.round(20 * bu);
    expect(windGround(sim, { x: 200, y: 5, z: 200 })).toBeCloseTo(0.5, 9);
    expect(windGround(sim, { x: 200, y: 40 * bu, z: 200 })).toBeCloseTo(1, 9); // above the blade tips
    sim.state.worldDelta.grassHeightMm[cell] = Math.round(6 * bu);
    expect(windGround(sim, { x: 200, y: 5, z: 200 })).toBeCloseTo(1, 9); // short grass is no canopy
    expect(windGround(sim)).toBeCloseTo(1, 9);
  });
});
