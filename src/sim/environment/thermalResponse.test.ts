// GDD 06 §2.6-2.7 and App. E 8-9: speed curve, forage gates, light preference, surface activity, heat and cold dose.

import { describe, expect, it } from 'vitest';
import type { Ant, ThermalDef } from '@/sim/types';
import { HEAT_DOSE_K } from '@/sim/balance';
import { applyThermalDose, bodySpeedMult, forageGateFor, lightPrefFor, relaxBodyTemp, speedCurve, speedMultFor, surfaceActivity, thermalDefOf } from './thermalResponse';
import { stepAntThermal, stressCOf } from './antThermal';
import { airTemp } from './temperature';
import { collect, envSim, setClockD, settleWeather } from './envTestKit';

/** The four species' thermal rows as the chapter tabulates them (GDD 06 §2.6). */
const LASIUS: ThermalDef = {
  thermalShiftC: 0, forageGate: { a: 8, b: 18, c: 30, d: 38 }, stressC: 35, shadeSeekC: 33, chillC: 4, freezeC: -2,
  lightPref: { night: 0.35, dawn: 0.8, morning: 1, midday: 1, afternoon: 1, dusk: 0.8 }, lightPrefSeason: {},
};
const CAMPONOTUS: ThermalDef = { ...LASIUS, thermalShiftC: -2, forageGate: { a: 5, b: 13, c: 26, d: 33 }, stressC: 36, shadeSeekC: 34, chillC: 2, freezeC: -4 };
const MESSOR: ThermalDef = { ...LASIUS, thermalShiftC: 6, forageGate: { a: 8, b: 20, c: 35, d: 42 }, stressC: 40, shadeSeekC: 38, chillC: 6, freezeC: -1 };
const ATTA: ThermalDef = { ...LASIUS, thermalShiftC: 2, forageGate: { a: 7, b: 20, c: 25, d: 28 }, stressC: 38, shadeSeekC: 36, chillC: 5, freezeC: -1 };

function body(tb = 25) {
  return { tb, heatLoad: 0, coldLoad: 0, thermalState: 'normal' as const };
}

describe('speed multiplier (E9)', () => {
  it('matches the chapter curve at its tabulated points', () => {
    const table: [number, number][] = [[5, 0], [10, 0.25], [15, 0.55], [20, 0.9], [22, 1], [25, 1], [28, 1], [30, 1.1], [35, 0.9], [40, 0]];
    for (const [tb, m] of table) expect(speedMultFor(LASIUS, tb), `Tb ${tb}`).toBeCloseTo(m, 9);
    expect(speedCurve(-10)).toBe(0);
    expect(speedCurve(60)).toBe(0);
  });

  it('is linear between the points', () => {
    expect(speedCurve(12.5)).toBeCloseTo(0.4, 9);
    expect(speedCurve(32.5)).toBeCloseTo(1.0, 9);
    expect(speedCurve(37.5)).toBeCloseTo(0.45, 9);
    expect(speedCurve(21)).toBeCloseTo(0.95, 9);
  });

  it('shifts by the species thermalShiftC: Messor at 26 is 0.9, Atta at 24 is 1.0, Camponotus is cold-adapted', () => {
    expect(speedMultFor(MESSOR, 26)).toBeCloseTo(0.9, 9);
    expect(speedMultFor(ATTA, 24)).toBeCloseTo(1.0, 9);
    expect(speedMultFor(CAMPONOTUS, 13)).toBeCloseTo(0.55, 9);
    expect(speedMultFor(CAMPONOTUS, 8)).toBeCloseTo(0.25, 9);
  });

  it('the species definitions registered in the game give the Lasius values through sim.speedMult', () => {
    const sim = envSim();
    expect(thermalDefOf(sim, 'lasius-niger').thermalShiftC).toBe(0);
    expect(speedMultFor(thermalDefOf(sim, 'lasius-niger'), 15)).toBeCloseTo(0.55, 9);
  });
});

describe('forage gates open and close at the stated temperatures', () => {
  it.each([['lasius', LASIUS], ['camponotus', CAMPONOTUS], ['messor', MESSOR], ['atta', ATTA]] as const)('%s', (_n, def) => {
    const g = def.forageGate;
    expect(forageGateFor(def, g.a)).toBe(0);
    expect(forageGateFor(def, g.a - 5)).toBe(0);
    expect(forageGateFor(def, (g.a + g.b) / 2)).toBeCloseTo(0.5, 9);
    expect(forageGateFor(def, g.b)).toBe(1);
    expect(forageGateFor(def, (g.b + g.c) / 2)).toBe(1);
    expect(forageGateFor(def, g.c)).toBe(1);
    expect(forageGateFor(def, (g.c + g.d) / 2)).toBeCloseTo(0.5, 9);
    expect(forageGateFor(def, g.d)).toBe(0);
    expect(forageGateFor(def, g.d + 5)).toBe(0);
  });

  it('Atta does not forage at 29 C', () => {
    expect(forageGateFor(ATTA, 29)).toBe(0);
  });
});

describe('light preference and surface activity', () => {
  it('uses the species row and its seasonal override', () => {
    const def: ThermalDef = { ...MESSOR, lightPref: { ...LASIUS.lightPref, night: 0.6 }, lightPrefSeason: { summer: { night: 1.0 } } };
    expect(lightPrefFor(def, 'night', 'autumn')).toBe(0.6);
    expect(lightPrefFor(def, 'night', 'summer')).toBe(1.0);
    expect(lightPrefFor(def, 'midday', 'summer')).toBe(1);
  });

  it('Lasius: full at a mild midday, light-preference limited at night, gated by weather and heat stress', () => {
    const sim = envSim();
    setClockD(sim, 10 + 12 / 24);
    settleWeather(sim, 'clear');
    expect(surfaceActivity(sim, 'lasius-niger')).toBe(1);
    settleWeather(sim, 'storm');
    expect(surfaceActivity(sim, 'lasius-niger')).toBe(0);
    settleWeather(sim, 'rain', 0, 'drizzle');
    expect(surfaceActivity(sim, 'lasius-niger')).toBeCloseTo(0.4 * forageGateFor(LASIUS, airTemp(sim)), 9);
    settleWeather(sim, 'rain', 0, 'downpour');
    expect(surfaceActivity(sim, 'lasius-niger')).toBe(0);
    settleWeather(sim, 'clear');
    expect(surfaceActivity(sim, 'lasius-niger', 0.5)).toBeCloseTo(0.5, 9);
    setClockD(sim, 10 + 2 / 24);
    settleWeather(sim, 'clear');
    expect(surfaceActivity(sim, 'lasius-niger')).toBeCloseTo(0.35 * forageGateFor(LASIUS, airTemp(sim)), 9);
  });

  it('the forage gate shuts a Lasius colony off in a deep winter cold', () => {
    const sim = envSim();
    setClockD(sim, 24 + 12 / 24);
    settleWeather(sim, 'frost');
    expect(airTemp(sim)).toBeLessThan(8);
    expect(surfaceActivity(sim, 'lasius-niger')).toBe(0);
  });
});

describe('body temperature, heat and cold dose (E8)', () => {
  it('body temperature relaxes toward the micro temperature with a 6 s constant', () => {
    expect(relaxBodyTemp(20, 30, 6)).toBeCloseTo(20 + 10 * (1 - Math.exp(-1)), 9);
    expect(relaxBodyTemp(20, 30, 0)).toBe(20);
    // exact for any step: two half steps equal one whole step
    expect(relaxBodyTemp(relaxBodyTemp(20, 30, 3), 30, 3)).toBeCloseTo(relaxBodyTemp(20, 30, 6), 9);
  });

  function secondsToDeath(tb: number, dt = 1): number {
    const b = body(tb);
    for (let s = 0; s < 5000; s += dt) {
      if (applyThermalDose(b, LASIUS, 35, dt) === 'heat-death') return s + dt;
    }
    return Infinity;
  }

  it('dies of heat in 400 s at Tb 50 and 600 s at 45; nothing happens at 35', () => {
    expect(Math.abs(secondsToDeath(50) - 400)).toBeLessThanOrEqual(20);
    expect(Math.abs(secondsToDeath(45) - 600)).toBeLessThanOrEqual(30);
    const b = body(35);
    for (let i = 0; i < 2000; i++) applyThermalDose(b, LASIUS, 35, 1);
    expect(b.heatLoad).toBe(0);
    expect(HEAT_DOSE_K).toBe(6000);
  });

  it('the same lethal time holds for the staggered 2.5 s step the system uses', () => {
    expect(Math.abs(secondsToDeath(50, 2.5) - 400)).toBeLessThanOrEqual(20);
  });

  it('recovers: 100 s at 50 C then 25 C returns to zero within 700 s', () => {
    const b = body(50);
    for (let i = 0; i < 100; i++) applyThermalDose(b, LASIUS, 35, 1);
    expect(b.heatLoad).toBeCloseTo(0.25, 6);
    b.tb = 25;
    let t = 0;
    while (b.heatLoad > 0 && t < 2000) { applyThermalDose(b, LASIUS, 35, 1); t++; }
    expect(t).toBeLessThanOrEqual(700);
    expect(b.heatLoad).toBe(0);
  });

  it('stupor starts at heat load 0.5 or Tb >= stress + 5, slows to 0.2, and ends below load 0.3', () => {
    const b = body(41); // stress 35 + 5 = 40
    applyThermalDose(b, LASIUS, 35, 1);
    expect(b.thermalState).toBe('heat-stupor');
    expect(bodySpeedMult(LASIUS, b)).toBe(0); // Tb 41 is past the 40 C end of the curve
    const c = body(38);
    c.heatLoad = 0.49;
    applyThermalDose(c, LASIUS, 35, 30); // + 3/6000 * 30 = 0.015
    expect(c.thermalState).toBe('heat-stupor');
    expect(bodySpeedMult(LASIUS, c)).toBeCloseTo(speedMultFor(LASIUS, 38) * 0.2, 9);
    c.tb = 30;
    c.heatLoad = 0.45;
    applyThermalDose(c, LASIUS, 35, 1);
    expect(c.thermalState).toBe('heat-stupor'); // still above 0.3
    for (let i = 0; i < 100; i++) applyThermalDose(c, LASIUS, 35, 1);
    expect(c.thermalState).toBe('normal');
  });

  it('cold: chill coma below chillC, cold dose below freezeC, death 20 minutes at 3 C below', () => {
    const b = body(3);
    applyThermalDose(b, LASIUS, 35, 1);
    expect(b.thermalState).toBe('cold-coma');
    expect(bodySpeedMult(LASIUS, b)).toBe(0);
    expect(b.coldLoad).toBe(0);
    const c = body(-5); // 3 C below freezeC -2
    let t = 0;
    while (applyThermalDose(c, LASIUS, 35, 1) !== 'cold-death' && t < 5000) t++;
    expect(Math.abs(t + 1 - 1200)).toBeLessThanOrEqual(10);
    const d = body(-5);
    for (let i = 0; i < 300; i++) applyThermalDose(d, LASIUS, 35, 1);
    d.tb = 10;
    for (let i = 0; i < 300; i++) applyThermalDose(d, LASIUS, 35, 1);
    expect(d.coldLoad).toBeCloseTo(0, 6);
    expect(d.thermalState).toBe('normal');
  });
});

describe('ant thermal step in a world', () => {
  function addAnt(sim: ReturnType<typeof envSim>): Ant {
    const q = sim.state.ants[0];
    return q;
  }

  it('a Lasius in a heat wave at noon on bare ground enters stupor and dies of heat; the events fire once', () => {
    const sim = envSim({ zone: 'forest', surface: 'loam' });
    setClockD(sim, 10 + 13 / 24);
    settleWeather(sim, 'heat');
    const ant = addAnt(sim);
    ant.pos = { x: 500, y: 0, z: 500 };
    ant.medium = 'surface';
    ant.tb = 25;
    const stupor = collect<{ antId: number }>(sim, 'env.heat-stupor');
    const died = collect<{ cause: string }>(sim, 'ant-died');
    const def = thermalDefOf(sim, 'lasius-niger');
    expect(stressCOf(sim, def)).toBe(35);
    for (let i = 0; i < 1200 && ant.alive; i++) {
      stepAntThermal(sim, ant, def, 2.5);
      sim.events.flush();
    }
    expect(ant.alive).toBe(false);
    expect(stupor.length).toBe(1);
    expect(died.map((d) => d.cause)).toEqual(['heat']);
  });

  it('in shade on a mild day nothing happens, and an ant underground sits at the soil temperature', () => {
    const sim = envSim({ zone: 'forest', surface: 'loam', shade: 255 });
    setClockD(sim, 10 + 12 / 24);
    settleWeather(sim, 'clear');
    const ant = addAnt(sim);
    ant.pos = { x: 500, y: 0, z: 500 };
    ant.tb = 25;
    const def = thermalDefOf(sim, 'lasius-niger');
    for (let i = 0; i < 400; i++) stepAntThermal(sim, ant, def, 2.5);
    expect(ant.alive).toBe(true);
    expect(ant.heatLoad).toBe(0);
    expect(ant.thermalState).toBe('normal');
    ant.pos = { x: 500, y: -200, z: 500 };
    for (let i = 0; i < 40; i++) stepAntThermal(sim, ant, def, 2.5);
    expect(ant.tb).toBeLessThan(25);
    expect(ant.tb).toBeGreaterThan(10);
  });
});
