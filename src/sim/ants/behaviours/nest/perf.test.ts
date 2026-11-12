// beh-nest acceptance 8 (performance): 800 in-nest ants of the small-nest colony with brood. The in-nest
// behaviours' own cost (their enter / update / exit, timed by wrapping them, the nursery board included) is the
// budget: under 1.5 ms per tick on average. The whole tick is reported too. Load-tolerant: on a saturated machine
// the numbers are reported, not asserted (src/sim/testing/perfLoad.ts; FOUNDRESS_PERF_STRICT=1 asserts).
import { describe, expect, it } from 'vitest';
import { heavyLoad } from '@/sim/testing/perfLoad';
import { behaviours as nestBehaviours } from './index';
import { makeNestColony } from './testkit';

const BUDGET_MS = 1.5;
/** FOUNDRESS_LONG=1: 600-tick warm-up and segments; default: 300 / 200 (file cost, sim-fix-ants). */
const LONG = !!(globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.FOUNDRESS_LONG;
const SEGMENT = LONG ? 600 : 200;
const WARM = LONG ? 600 : 300;

describe('beh-nest performance (acceptance 8)', () => {
  it('800 in-nest ants: behaviour cost per tick under 1.5 ms (min of 3 segments)', () => {
    const k = makeNestColony({
      workers: 800, stores: { c: 2000, p: 1000 },
      brood: [{ stage: 'egg', n: 60, chamber: 'nursery' }, { stage: 'larva', n: 60, chamber: 'nursery' }, { stage: 'pupa', n: 60, chamber: 'royal' }],
    });
    const { sim } = k;
    let spent = 0;
    const undo: (() => void)[] = [];
    for (const b of nestBehaviours) {
      for (const key of ['enter', 'update', 'exit'] as const) {
        const fn = b[key];
        b[key] = (s, a) => { const t0 = performance.now(); fn(s, a); spent += performance.now() - t0; };
        undo.push(() => { b[key] = fn; });
      }
    }
    const segments: { behaviourMs: number; tickMs: number }[] = [];
    try {
      for (let i = 0; i < WARM; i++) sim.tick(); // warm-up: allocation spreads the tasks
      for (let s = 0; s < 3; s++) {
        spent = 0;
        const t0 = performance.now();
        for (let i = 0; i < SEGMENT; i++) sim.tick();
        segments.push({ behaviourMs: spent / SEGMENT, tickMs: (performance.now() - t0) / SEGMENT });
      }
    } finally {
      for (const u of undo) u();
    }
    const best = Math.min(...segments.map((x) => x.behaviourMs));
    const inNest = sim.stores.ants.list.filter((a) => a.alive && a.nestId >= 0).length;
    console.log('[beh-nest AC8 perf]', JSON.stringify({
      ants: sim.stores.ants.list.length, inNest, segments: segments.map((x) => ({ behaviourMs: +x.behaviourMs.toFixed(3), tickMs: +x.tickMs.toFixed(2) })),
      bestBehaviourMs: +best.toFixed(3), heavyLoad: heavyLoad(),
    }));
    if (!heavyLoad()) expect(best).toBeLessThan(BUDGET_MS);
  }, 1_800_000);
});
