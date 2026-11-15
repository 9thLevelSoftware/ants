// Reviewer test (FOUNDRESS_LONG=1 only, ~30 s): the 2-game-day, 100-worker stall scenario of sim-fix-ants
// acceptance 2, measured per ant as the LONGEST CONTINUOUS run of ticks at "nav.status moving, speed 0" (not in the
// air). The share of such ticks is below 1 %, but it is concentrated: on seed 5 one idle wanderer stands at a fixed
// spot of the small nest (about (382, -44, 260) mm, on an overhanging wall, up.y -0.27) with desiredSpeed 12 mm/s
// and speed 0 for up to 241 ticks in a row, again and again; its recovery ladder climbs to rung 11 without
// relocating or failing (a wander request has no target, so every rung is a no-op). That is a walker trap, not a
// blockage by other ants.
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '@/sim/time';
import { makeNestColony } from './testkit';

const LONG = !!(globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.FOUNDRESS_LONG;

describe.skipIf(!LONG)('reviewer: no walker stands at "moving, speed 0" for long (sim-fix-ants 1)', () => {
  it('2 game days, 100 workers: the longest continuous stall of any ant is under 5 s', () => {
    const k = makeNestColony({
      workers: 100, stores: { c: 300, p: 200 }, seed: 5,
      brood: [{ stage: 'egg', n: 15, chamber: 'nursery' }, { stage: 'larva', n: 20, chamber: 'nursery' }, { stage: 'pupa', n: 10, chamber: 'nursery' }],
    });
    const sim = k.sim, eps = 0.01 * sim.world.bu;
    const run = new Map<number, number>();
    let worst = 0, worstAnt = -1, worstAt = -1, over = 0;
    for (let t = 0; t < 2 * TICKS_PER_DAY; t++) {
      sim.tick();
      for (const a of sim.stores.ants.list) {
        if (!a.alive || a.caste === 'queen') continue;
        if (a.nav.status === 'moving' && a.medium !== 'air' && a.speed < eps) {
          const r = (run.get(a.id) ?? 0) + 1;
          run.set(a.id, r);
          if (r === 50) over++;
          if (r > worst) { worst = r; worstAnt = a.id; worstAt = sim.state.tick; }
        } else run.set(a.id, 0);
      }
    }
    const msg = JSON.stringify({ worstTicks: worst, worstAnt, worstAt, runsOver5s: over });
    console.log('[review stall runs]', msg);
    expect(worst, msg).toBeLessThanOrEqual(50);
  }, 1_800_000);
});
