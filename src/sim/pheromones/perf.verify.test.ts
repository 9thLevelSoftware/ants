// Reviewer test (phero task, AC6). FAILS on purpose: the decay pass is only fast without the per-cell decay
// modifier, but the game must install one (temperature, exposure and heat factors, GDD 02 §8.2 / E11). With a
// modifier built from this module's own pheroDecayRateMult the 100,000-cell pass measured 16-20 ms here (a
// constant modifier: 3.4 ms; none: 1.4 ms). Same 2x slack and min-of-repetitions rule as perf.test.ts.
import { describe, expect, it } from 'vitest';
import { pheroDecayRateMult } from './factors';
import { newField, TEST_CELL } from './testkit';
import { heavyLoad } from '@/sim/testing/perfLoad';

describe('pheromone performance with the environment hook (reviewer)', () => {
  it('decay pass over 100,000 active cells < 3 ms with a temperature-dependent decay modifier', () => {
    const f = newField();
    const p = { x: 0, y: 2, z: 0 };
    for (let i = 0; i < 60000; i++) {
      p.x = ((i % 245) + 0.5) * TEST_CELL; p.z = (Math.floor(i / 245) + 0.5) * TEST_CELL;
      f.deposit(0, 'home', p, 10);
    }
    for (let i = 0; i < 40000; i++) {
      p.x = ((i % 200) + 0.5) * TEST_CELL; p.z = (Math.floor(i / 200) + 0.5) * TEST_CELL;
      f.deposit(0, 'trail', p, 10);
    }
    // Surface temperature varying smoothly over the map (a sun-lit lawn), exposure normal.
    const climate = { tempC: 22, exposure: 'normal' as const };
    f.setHooks({
      decayModifier: (ch, x, _y, z) => {
        climate.tempC = 20 + 0.001 * x + 0.0007 * z;
        return pheroDecayRateMult(ch, climate);
      },
    });
    const times: number[] = [];
    for (let k = 0; k < 30; k++) {
      const t0 = performance.now();
      f.step(1);
      times.push(performance.now() - t0);
    }
    expect(f.activeCellCount()).toBe(100000);
    const best = Math.min(...times.slice(5));
    console.log(`decay 100k cells with modifier: min ${best.toFixed(2)} ms${heavyLoad() ? ' (heavy load: not asserted)' : ''}`);
    // wall-clock budget: not asserted under heavy load (testing/perfLoad.ts; FOUNDRESS_PERF_STRICT=1 always asserts)
    if (!heavyLoad()) expect(best).toBeLessThan(3 * 2);
  }, 60000);
});
