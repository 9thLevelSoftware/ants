// Soil moisture and puddles (GDD 06 §3.9-3.10, App. E11): the per-cell step against the chapter's tables and
// sanity examples, and the grid step on a sim (dithered byte storage, surface wetness, water bodies, cheat).

import { describe, expect, it } from 'vitest';
import {
  WX_ICAP_MMH, WX_K0, WX_PUDDLE_DRAIN_MMH, WX_THETA_FC, WX_W0_MM, type SoilTex,
} from '@/sim/balance/weather';
import { envSim } from './envTestKit';
import { evapIndex, evapRateMmH, moistureClass, stepCell, type CellFlux, type CellParams, type StepInputs } from './moistureCell';
import { moistureAtXZ, puddleDepthMm, setSoilMoistureRegion, stepMoisture, surfaceWetness } from './moisture';
import { weatherEffectsHandlers } from './effects';

const soil = (tex: SoilTex, o: Partial<CellParams> = {}): CellParams => ({
  tex, icap: WX_ICAP_MMH[tex], permeable: 1, shade: 0, litter: 0, veg: false, natural: true, puddleCapMm: 0, ...o,
});
const step = (o: Partial<StepInputs> = {}): StepInputs => ({
  dtH: 0.2, rainMmH: 0, evapIdx: 0.45, insolation: 0.9, dewLevel: 0, growing: false, frozen: false, ...o,
});
const flux = (): CellFlux => ({ infiltration: 0, runoff: 0, evaporation: 0, drain0: 0, drain1: 0, rise: 0, et: 0 });

describe('GDD 06 App. E11: loam wetting and drying', () => {
  it('2.5 mm of drizzle on loam at theta0 0.30 gives 0.51 +- 0.03 at once', () => {
    const s = { theta0: 0.3, theta1: 0.3, puddleMm: 0 };
    stepCell(soil('loam'), step({ dtH: 1, rainMmH: 2.5, evapIdx: 0 }), s);
    expect(s.theta0).toBeGreaterThan(0.48);
    expect(s.theta0).toBeLessThan(0.54);
  });

  it('then falls below 0.30 after 28 +- 8 game hours of clear noon-like evaporation', () => {
    const s = { theta0: 0.508, theta1: 0.3, puddleMm: 0 };
    let h = 0;
    while (s.theta0 >= 0.3 && h < 100) { stepCell(soil('loam'), step(), s); h += 0.2; }
    expect(h).toBeGreaterThanOrEqual(20);
    expect(h).toBeLessThanOrEqual(36);
  });
});

describe('GDD 06 §3.9 terms (table-driven)', () => {
  it('sanity line: a 2.5 mm shower adds 0.21 to loam theta0; loam at 0.5 loses about 0.1 mm/h at evapIdx 0.45', () => {
    expect(2.5 / WX_W0_MM).toBeCloseTo(0.208, 3);
    expect(evapRateMmH(0.45, 0.5, 0, 0)).toBeCloseTo(0.097, 2);
  });

  it.each([
    // texture, rain mm/h, expected infiltration mm/h (Icap), runoff mm/h
    ['sand', 18, 18, 0],
    ['loam', 30, 20, 10],
    ['clay', 18, 5, 13],
    ['humus', 50, 40, 10],
  ] as const)('%s takes %d mm/h: infiltration min(rain, Icap)', (tex, rain, inf, run) => {
    const s = { theta0: 0.1, theta1: 0.1, puddleMm: 0 };
    const f = flux();
    stepCell(soil(tex), step({ dtH: 0.1, rainMmH: rain, evapIdx: 0 }), s, f);
    expect(f.infiltration / 0.1).toBeCloseTo(inf, 6);
    expect(f.runoff / 0.1).toBeCloseTo(run, 6);
  });

  it.each([
    ['sand', 0.6], ['loam', 0.8], ['clay', 0.9],
  ] as const)('drainage top -> sub on %s at theta0 %f is K0 (theta0 - FC) W0', (tex, theta) => {
    const s = { theta0: theta, theta1: 0, puddleMm: 0 };
    const f = flux();
    stepCell(soil(tex), step({ dtH: 0.01, evapIdx: 0 }), s, f);
    expect(f.drain0).toBeCloseTo(WX_K0[tex] * (theta - WX_THETA_FC[tex]) * WX_W0_MM * 0.01, 9);
  });

  it('paving sheds all rain (permeable 0); a puddle cell keeps half the runoff and drains 0.4 mm/h', () => {
    const s = { theta0: 0.2, theta1: 0.2, puddleMm: 0 };
    const f = flux();
    stepCell(soil('loam', { permeable: 0, icap: 0, natural: false, puddleCapMm: 10 }), step({ dtH: 1, rainMmH: 18, evapIdx: 0 }), s, f);
    expect(f.infiltration).toBe(0);
    expect(f.runoff).toBeCloseTo(18, 9);
    expect(s.puddleMm).toBeCloseTo(18 * 0.5 - WX_PUDDLE_DRAIN_MMH, 6);
    expect(s.theta0).toBe(0.2);
    stepCell(soil('loam', { permeable: 0, icap: 0, natural: false, puddleCapMm: 10 }), step({ dtH: 2, evapIdx: 0 }), s);
    expect(s.puddleMm).toBeCloseTo(18 * 0.5 - 3 * WX_PUDDLE_DRAIN_MMH, 6);
  });

  it('a puddle is capped by its capacity; frozen soil takes no water and loses none', () => {
    const s = { theta0: 0.2, theta1: 0.2, puddleMm: 0 };
    stepCell(soil('loam', { permeable: 0, icap: 0, puddleCapMm: 3 }), step({ dtH: 1, rainMmH: 30, evapIdx: 0 }), s);
    expect(s.puddleMm).toBeLessThanOrEqual(3);
    const f = { theta0: 0.3, theta1: 0.3, puddleMm: 0 };
    stepCell(soil('loam'), step({ dtH: 1, rainMmH: 5, frozen: true }), f);
    expect(f.theta0).toBeCloseTo(0.3, 9);
  });

  it('capillary rise and transpiration move water as the table says', () => {
    const s = { theta0: 0.1, theta1: 0.5, puddleMm: 0 };
    const f = flux();
    stepCell(soil('loam', { veg: true }), step({ dtH: 1, evapIdx: 0, insolation: 1, growing: true }), s, f);
    expect(f.rise).toBeCloseTo(0.02 * 0.4, 9);
    expect(f.et).toBeCloseTo(0.03 * 1 * (0.5 - f.rise / 90), 4);
  });

  it('evapIdx and the moisture classes', () => {
    expect(evapIndex(1, 0.5, 0)).toBeCloseTo(0.55, 9);
    expect(evapIndex(0, 0.5, 3)).toBeCloseTo(0.05, 9);
    expect([0.1, 0.2, 0.5, 0.8, 0.95].map(moistureClass)).toEqual(['dry', 'slightly-damp', 'damp', 'wet', 'waterlogged']);
  });
});

describe('grid step on a sim', () => {
  it('dithered byte storage follows the float model on average and is deterministic', () => {
    const a = envSim({ surface: 'loam' }), b = envSim({ surface: 'loam' });
    for (const sim of [a, b]) setSoilMoistureRegion(sim, 0, 0, -1, 0.5);
    const inp = step();
    for (let n = 0; n < 50; n++) for (const sim of [a, b]) { stepMoisture(sim, 50, inp); sim.state.tick += 50; }
    expect(Array.from(a.state.env.moisture.theta0)).toEqual(Array.from(b.state.env.moisture.theta0));
    const ref = { theta0: 0.5, theta1: 0.5, puddleMm: 0 };
    const p = soil('loam', { icap: 15 });
    for (let n = 0; n < 50; n++) stepCell(p, inp, ref);
    const m = a.state.env.moisture;
    let mean = 0;
    for (let i = 0; i < m.theta0.length; i++) mean += m.theta0[i] / 255;
    mean /= m.theta0.length;
    expect(Math.abs(mean - ref.theta0)).toBeLessThan(0.01);
  });

  it('rain wets the surface, and it dries after the rain', () => {
    const sim = envSim();
    const inp = step({ rainMmH: 5, evapIdx: 0.05 });
    for (let n = 0; n < 10; n++) stepMoisture(sim, 50, inp);
    expect(surfaceWetness(sim)).toBeGreaterThan(0.9);
    const dry = step({ evapIdx: 0.45 });
    for (let n = 0; n < 20; n++) stepMoisture(sim, 50, dry);
    expect(surfaceWetness(sim)).toBe(0);
  });

  it('cheat.setSoilMoisture sets both layers in a region; queries read them', () => {
    const sim = envSim();
    const c = sim.world.size / 2;
    weatherEffectsHandlers['cheat.setSoilMoisture']!(sim, { type: 'cheat.setSoilMoisture', center: { x: c, y: 0, z: c }, radius: 10, m: 0.9 });
    expect(moistureAtXZ(sim, c, c, 0)).toBeCloseTo(0.9, 2);
    expect(moistureAtXZ(sim, c, c, 1)).toBeCloseTo(0.9, 2);
    expect(moistureAtXZ(sim, 1, 1, 0)).not.toBeCloseTo(0.9, 2);
    expect(puddleDepthMm(sim, c, c)).toBe(0);
  });
});
