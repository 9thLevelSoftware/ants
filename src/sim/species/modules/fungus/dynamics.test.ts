// GDD 07 App. E 21-23: the garden growth law, heat damage, and Escovopsis with and without weeding (pure steps).

import { describe, expect, it } from 'vitest';
import type { GardenRecord } from '@/sim/types';
import { requireSpecies } from '@/sim/species';
import { fungusParams } from './params';
import { stepGarden, type GardenInputs } from './dynamics';
import { nextState } from './states';
import { fHumidity, fTemp } from './climate';

const P = fungusParams(requireSpecies('atta-texana'))!;
const DT = 25 / 6000; // one garden step, game days

function garden(over: Partial<GardenRecord> = {}): GardenRecord {
  return {
    chamberId: 1, state: 'healthy', biomass: 2, health: 1, infection: 0, substrate: 0, waste: 0,
    contamination: 0, gcap: 22.6, ...over,
  };
}

/** Runs `days` of steps with the substrate supplied at 1.8 LU per GU per GD of the current mass (fsub 1). */
function run(g: GardenRecord, days: number, inp: Partial<GardenInputs>, untilDead = false): number {
  const base: GardenInputs = {
    tempC: 23, rh: 0.9, gardeners: 1000, weeders: 0, subIn1Gd: 0, subQ: 1, subP: 0.1, subT: 0, founding: false, queenInChamber: false,
  };
  let t = 0;
  for (; t < days; t += DT) {
    const sub = P.subNeedPerGu * g.biomass;
    stepGarden(P, g, { ...base, subIn1Gd: sub, ...inp }, DT);
    g.state = nextState(P, g);
    if (untilDead && g.state === 'dead') return t + DT;
  }
  return t;
}

describe('fungus garden dynamics (GDD 07 §6.4.2-6.4.4)', () => {
  it('climate factors: fT 1 at 21-25 °C, 0.5 at 18/28, 0 at <= 15 / >= 30; fRH 1 / 0.6 / 0.3', () => {
    expect(fTemp(P, 23)).toBe(1);
    expect(fTemp(P, 18)).toBeCloseTo(0.5, 6);
    expect(fTemp(P, 28)).toBeCloseTo(0.5, 6);
    expect(fTemp(P, 15)).toBe(0);
    expect(fTemp(P, 30)).toBe(0);
    expect(fHumidity(P, 0.85)).toBe(1);
    expect(fHumidity(P, 0.6)).toBeCloseTo(0.6, 6);
    expect(fHumidity(P, 0.4)).toBeCloseTo(0.3, 6);
  });

  it('App. E 21: G 2.0 in a 22.6 GU chamber, substrate 1.8 LU/GU/GD, 23 °C, RH 0.9, full tending -> 2.33 +- 0.05 after 1 GD', () => {
    const g = garden();
    run(g, 1, {});
    expect(g.biomass).toBeGreaterThan(2.28);
    expect(g.biomass).toBeLessThan(2.38);
    expect(g.health).toBe(1);
  });

  it('App. E 22: the same garden at 31 °C does not grow and h = 0.85 +- 0.01 after 1 GD', () => {
    const g = garden();
    run(g, 1, { tempC: 31 });
    expect(g.biomass).toBeLessThanOrEqual(2 + 1e-9);
    expect(g.health).toBeGreaterThan(0.84);
    expect(g.health).toBeLessThan(0.86);
  });

  it('App. E 23: i 0.05 with no weeders dies at 4.3 +- 0.3 GD; with weed coverage 1, i is cleared within 2.0 GD', () => {
    const g = garden({ infection: 0.05, state: 'infected', preInfectState: 'healthy' });
    const tDead = run(g, 10, { gardeners: 0, weeders: 0 }, true);
    expect(g.state).toBe('dead');
    expect(tDead).toBeGreaterThan(4.0);
    expect(tDead).toBeLessThan(4.6);

    const w = garden({ infection: 0.05, state: 'infected', preInfectState: 'healthy' });
    let cleared = -1;
    for (let t = 0; t < 3 && cleared < 0; t += DT) {
      stepGarden(P, w, { tempC: 23, rh: 0.9, gardeners: 100, weeders: 100, subIn1Gd: P.subNeedPerGu * w.biomass, subQ: 1, subP: 0.1, subT: 0, founding: false, queenInChamber: false }, DT);
      w.state = nextState(P, w);
      if (w.state !== 'infected') cleared = t + DT;
    }
    expect(cleared).toBeGreaterThan(0);
    expect(cleared).toBeLessThan(2.0);
    expect(w.infection).toBe(0);
    expect(w.state).toBe('healthy');
    expect(w.waste).toBeGreaterThan(0); // weeded patches go to waste
  });

  it('starvation: no substrate shrinks the garden by 15 % per GD; protein-rich or toxic substrate costs health', () => {
    const g = garden();
    run(g, 1, { subIn1Gd: 0 });
    expect(g.biomass).toBeGreaterThan(2 * 0.84);
    expect(g.biomass).toBeLessThan(2 * 0.88);
    const t = garden();
    run(t, 1, { subT: 0.6, subP: 0.3 });
    // 0.3 x (0.3 - 0.2) + 0.15 x 0.6 = 0.12 per GD
    expect(t.health).toBeCloseTo(0.88, 2);
  });
});
