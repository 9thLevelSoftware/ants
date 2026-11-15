// Nectar (GDD 05 §1.2 rows flower and extrafloral-nectary): the Tier 2 flying-insect drain (15 %/h at >= 15 °C, dry),
// the flowers' peak rhythm (days 5-14 full refill), the plant link (PlantState.nectarPool), and with the sources
// module's renewal: daylight refill, the nectaries' day-10 drop to x 0.3, depletion by drinking.

import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { createSource } from '../sources/spawn';
import { updateSource } from '../sources/lifecycle';
import { DEFAULT_DAYS_PER_YEAR, ticksPerYear, TICKS_PER_HOUR } from '@/sim/time';
import { stepNectar, type NectarContext } from './nectar';
import { plantSim } from './testkit';

function setCal(sim: Sim, d28: number, hour: number): void {
  const perYear = ticksPerYear(sim.state.config);
  const day = Math.floor((d28 / DEFAULT_DAYS_PER_YEAR) * (perYear / (24 * TICKS_PER_HOUR)));
  sim.state.env.calendar.startTick = day * 24 * TICKS_PER_HOUR + Math.round(hour * TICKS_PER_HOUR) - sim.state.tick;
}

const ctx = (o: Partial<NectarContext>): NectarContext => ({ d28: 9, dt: 1 / 24, airC: 20, raining: false, mult: 1, tier: 2, ...o });

describe('flowers', () => {
  it('Tier 2: drained 15 % per hour when the air is >= 15 °C and dry; not when cold or raining; never at Tier 1', () => {
    const { sim, plants } = plantSim({ systems: [] });
    const objectId = plants[0].objectId;
    const f = createSource(sim, { variant: 'flower', pos: { x: 100, y: 0, z: 100 }, objectId, tier: 2 });
    expect(f.units).toBeCloseTo(1.5, 9);
    stepNectar(sim, ctx({}));
    expect(f.units).toBeCloseTo(1.5 * 0.85, 9);
    stepNectar(sim, ctx({ airC: 12 }));
    stepNectar(sim, ctx({ raining: true }));
    expect(f.units).toBeCloseTo(1.5 * 0.85, 9);
    stepNectar(sim, ctx({ tier: 1 }));
    expect(f.units).toBeCloseTo(1.5 * 0.85, 9);
    // the plant link and its nectar pool
    expect(f.plantId).toBe(plants[0].id);
    expect(plants[0].nectarPool).toBeCloseTo(1.5 * 0.85, 9);
  });

  it('refill 4 C/gd in the peak (days 5-14), half outside it while open (estimate), in daylight only', () => {
    const { sim } = plantSim({ systems: [] });
    const f = createSource(sim, { variant: 'flower', pos: { x: 100, y: 0, z: 100 }, tier: 2, empty: true });
    stepNectar(sim, ctx({ d28: 9, airC: 10 }));
    expect(f.refillPerGd).toBe(4);
    stepNectar(sim, ctx({ d28: 15.5, airC: 10 }));
    expect(f.refillPerGd).toBe(2);
    // the sources module renews from the record: daylight only, 24 / dayLength x the daily amount per hour
    setCal(sim, 15.5, 2);
    updateSource(sim, f, 1 / 24);
    expect(f.units).toBe(0);
    setCal(sim, 15.5, 12);
    updateSource(sim, f, 1 / 24);
    expect(f.units).toBeGreaterThan(0);
  });
});

describe('extrafloral nectaries (sources renewal)', () => {
  it('refill 6 C/gd on days 1-9, x 0.3 from day 10', () => {
    const { sim } = plantSim({ systems: [] });
    const n = createSource(sim, { variant: 'extrafloral-nectary', pos: { x: 100, y: 0, z: 100 }, tier: 2, empty: true });
    setCal(sim, 4.5, 12);
    updateSource(sim, n, 1 / 24);
    const early = n.units;
    expect(early).toBeCloseTo(6 / 24, 6);
    n.units = 0; n.pool = 0;
    setCal(sim, 11.5, 12);
    updateSource(sim, n, 1 / 24);
    expect(n.units).toBeCloseTo((6 * 0.3) / 24, 6);
  });
});
