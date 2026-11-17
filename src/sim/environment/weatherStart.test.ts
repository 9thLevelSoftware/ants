// GDD 06 §1.6: forced start conditions per species, seeded moon, deterministic first weather.

import { describe, expect, it } from 'vitest';
import type { SpeciesId } from '@/sim/types';
import { START_CONDITIONS } from '@/sim/balance';
import { envSim } from './envTestKit';
import { ensureThermal } from './surface';
import { airTemp } from './temperature';
import { isMoonless } from './light';
import { baseWind } from './wind';
import { calendarNow } from './calendar';

function started(seed: number, species?: SpeciesId) {
  const sim = envSim({ seed });
  if (species) sim.state.config.species = species;
  ensureThermal(sim);
  return sim;
}

describe('Lasius start (clear or overcast, air 18-26 C, wind below 4 m/s)', () => {
  it('holds for 200 seeds on the natural start day', () => {
    const states = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      const sim = started(seed);
      const w = sim.state.env.weather;
      states.add(w.state);
      expect(['clear', 'overcast'], `seed ${seed}`).toContain(w.state);
      expect(airTemp(sim), `seed ${seed}`).toBeGreaterThanOrEqual(18 - 1e-9);
      expect(airTemp(sim), `seed ${seed}`).toBeLessThanOrEqual(26 + 1e-9);
      expect(w.wind2m, `seed ${seed}`).toBeLessThan(4);
      expect(w.history.lastRainEndTick).toBe(-1);
      expect(w.rainRateMmH).toBe(0);
    }
    expect(states.size).toBe(2);
  });

  it('starts in the afternoon of default-year day 9 (test sims, TEST_START) and gives every seed its own moon, deterministically', () => {
    const a = started(3), b = started(3), c = started(4);
    const cal = calendarNow(a);
    expect(cal.doy).toBe(9); // test sims keep the pre-R20 start (testing/testWorld.ts TEST_START)
    expect(cal.hour).toBeGreaterThanOrEqual(14);
    expect(a.state.env.calendar.moonPhase0).toBe(b.state.env.calendar.moonPhase0);
    expect(a.state.env.calendar.moonPhase0).not.toBe(c.state.env.calendar.moonPhase0);
    expect(JSON.stringify(a.state.env.weather)).toBe(JSON.stringify(b.state.env.weather));
  });

  it('the first weather is fully formed: dwell, forecast, settled lagged values', () => {
    const sim = started(5);
    const w = sim.state.env.weather;
    expect(w.dwellEndTick).toBeGreaterThan(sim.state.tick);
    expect(w.forecast).not.toBeNull();
    expect(w.wind2m).toBeCloseTo(baseWind(sim), 9);
    expect(w.dmCur).toBeGreaterThan(0);
    expect(Number.isFinite(sim.state.env.thermal.wsoil)).toBe(true);
  });
});

describe('other species starts', () => {
  it('Camponotus: air at least 13 C, wind below 4', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const sim = started(seed, 'camponotus-pennsylvanicus');
      expect(airTemp(sim)).toBeGreaterThanOrEqual(13 - 1e-9);
      expect(sim.state.env.weather.wind2m).toBeLessThan(4);
    }
  });

  it('Messor: clear, calm, a rain event of 7 h that ended 3.6-12 h ago', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const sim = started(seed, 'messor-barbarus');
      const w = sim.state.env.weather;
      expect(w.state).toBe('clear');
      expect(w.wind2m).toBeLessThan(3);
      const agoH = (sim.state.tick - w.history.lastRainEndTick) / 250;
      expect(agoH).toBeGreaterThanOrEqual(3.6 - 0.01);
      expect(agoH).toBeLessThanOrEqual(12 + 0.01);
      expect(w.history.rainHoursRing.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(7);
    }
  });

  it('Atta: clear, no moon, air 20-27 C, at least 6.35 mm of rain in the last day', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const sim = started(seed, 'atta-texana');
      const w = sim.state.env.weather;
      expect(w.state).toBe('clear');
      expect(isMoonless(sim), `seed ${seed}`).toBe(true);
      expect(airTemp(sim)).toBeGreaterThanOrEqual(20 - 1e-9);
      expect(airTemp(sim)).toBeLessThanOrEqual(27 + 1e-9);
      expect(w.history.cumRain24hMm).toBeGreaterThanOrEqual(6.35);
    }
  });

  it('every playable species has start conditions', () => {
    for (const id of ['lasius-niger', 'camponotus-pennsylvanicus', 'messor-barbarus', 'atta-texana']) expect(START_CONDITIONS[id]).toBeDefined();
  });
});
