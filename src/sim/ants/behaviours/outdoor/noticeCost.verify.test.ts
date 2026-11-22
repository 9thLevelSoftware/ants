// Independent review of colony-life round 11, R38 item 5 (notice.ts noteSmelledFood): a per-tick cost trap.
// noteSmelledFood calls ecology sourcesSmelledFrom for every outside worker every HERD_NOTICE_EVERY_TICKS. The source
// lookup grid (ecology/sources/lookup.ts) is rebuilt from scratch on the first query of each tick (every bucket of the
// 4000 BU world cleared, every source re-bucketed). With outside workers on staggered checks some worker queries on
// nearly every tick, so the colony now pays one full rebuild per tick. Measured on the sweep-11 runs: the behaviours
// system went from 0.25 (round-10 arm-final) to 0.63-0.70 ms per tick (median over 15 runs), and a CPU profile of
// kitchen-door #1 (life.ts --perf 3000) puts 4.9 s of noteSmelledFood's 4.9 s in sourcesSmelledFrom, 4.7 s of it in
// the grid's build/gridOf.
// The test: the same worker's check, once per new tick, must not cost many times what it costs when the grid is
// current (ratio bound generous for a loaded machine).
import { describe, expect, it } from 'vitest';
import { createSource } from '@/sim/ecology/sources/spawn';
import { forageScenario } from './testkit';
import { noticeOutside } from './notice';

function timeChecks(sim: ReturnType<typeof forageScenario>['sim'], ant: { bb: Record<string, number> }, n: number, advance: boolean): number {
  const t0 = performance.now();
  for (let i = 0; i < n; i++) {
    if (advance) sim.state.tick += 1;
    ant.bb['notice.next'] = 0; ant.bb['notice.report'] = -1;
    noticeOutside(sim, ant as never);
  }
  return performance.now() - t0;
}

describe('colony-life round 11 review: smelled-food check cost', () => {
  it('a check on a new tick costs about what a check on the same tick costs (no world-wide rebuild per tick)', () => {
    const { sim, col, entrance } = forageScenario({ workers: 4, sizeBu: 3000 });
    const bu = sim.world.bu;
    // a populated world: 2500 sources spread over it (the life worlds hold a few thousand)
    for (let i = 0; i < 2500; i++) {
      const x = ((i * 7919) % 2900 + 50) * bu, z = ((i * 104729) % 2900 + 50) * bu;
      createSource(sim, { variant: 'insect-small', pos: { x, y: sim.field.height(x, z), z } });
    }
    const ant = sim.stores.ants.list.find((a) => a.alive && a.colony === col.id)!;
    ant.task = 'forage'; ant.nestId = -1;
    ant.pos = { x: entrance.pos.x + 30 * bu, y: entrance.pos.y, z: entrance.pos.z };
    timeChecks(sim, ant, 200, true); // warm-up (JIT)
    const same = timeChecks(sim, ant, 2000, false);
    const fresh = timeChecks(sim, ant, 2000, true);
    expect(fresh, `2000 checks: ${fresh.toFixed(1)} ms on new ticks vs ${same.toFixed(1)} ms on one tick`).toBeLessThan(5 * same + 20);
  }, 120_000);
});
