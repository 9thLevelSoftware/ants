// Stage 1B gate (int-1B-sim work item 7): a 5-game-day soak with 300 workers and autonomous behaviour, every
// invariant checked every 500 ticks. Several minutes: FOUNDRESS_LONG=1 only (the generated-world version of the same
// soak is `node tools/sim/run-ts.mjs tools/sim/life.ts --workers 300 --food 300,150 --days 5`).
import { describe, expect, it } from 'vitest';
import { checkInvariants, collectInvariants, type InvariantViolation } from '@/sim/testing/invariants';
import { forageScenario } from '@/sim/ants/behaviours/outdoor/testkit';
import { TICKS_PER_DAY } from '@/sim/time';

const LONG = !!(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.FOUNDRESS_LONG;

describe.skipIf(!LONG)('300-worker soak (gate 1B, FOUNDRESS_LONG)', () => {
  it('5 game days, 300 workers, sources and brood: zero invariant violations', () => {
    const { sim, col } = forageScenario({
      seed: 6, workers: 300, sizeBu: 1200, stores: { c: 300, p: 150 },
      sources: [
        { kind: 'sugar', variant: 'sugary-spill', distBu: 120, bearingDeg: 20, units: 2000 },
        { kind: 'carrion', variant: 'insect-medium', distBu: 90, bearingDeg: 200, units: 1 },
        { kind: 'crumb', variant: 'crumb-protein', distBu: 160, bearingDeg: 110, units: 60 },
      ],
    });
    sim.enqueue({ type: 'cheat.spawnBrood', colonyId: col.id, stage: 'larva', n: 30, chamberId: -1, progress: 0.3, destined: null });
    const inv = collectInvariants();
    const found: InvariantViolation[] = [];
    let n = 0;
    for (let t = 1; t <= 5 * TICKS_PER_DAY; t++) {
      sim.tick();
      if (t % 500 === 0) n += checkInvariants(sim, inv, found);
    }
    expect(found.slice(0, 5)).toEqual([]);
    expect(n).toBe(0);
  }, 3_600_000);
});
