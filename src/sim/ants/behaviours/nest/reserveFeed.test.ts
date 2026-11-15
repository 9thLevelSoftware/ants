// Queen-carers feed the queen from their own fat reserve only as the S2 rationing measure (GDD 02 §5.7, §10.5
// `queen-care.load`: "in S2 transfer from own reserve instead"), and only when the pool cannot fill a feed. A pool
// that is nearly empty in a colony that is not yet rationing gives no reserve feed (sim-fix-ants review finding 1).
import { describe, expect, it } from 'vitest';
import { SYSTEMS } from '@/sim/systems';
import { reserveFeedAllowed } from '@/sim/ants/actions';
import { makeNestColony } from './testkit';

/** Behaviours run, but nobody reassigns the carers. */
const NO_ALLOC = SYSTEMS.filter((s) => s.name !== 'allocation' && s.name !== 'task-reeval');

/**
 * Runs carers by a hungry queen. `hold`: the pool and the stage are put back before every tick (the economy runs
 * after the behaviours and would move the colony to S2 on its own).
 */
function reserveFeeds(stores: { c: number; p: number }, hold: 'lean' | null) {
  const k = makeNestColony({ workers: 3, stores, systems: NO_ALLOC, seed: 4 });
  const { sim, queen } = k;
  const col = sim.state.colonies[0];
  const carers = sim.stores.ants.list.filter((a) => a.caste === 'worker');
  for (const a of carers) { a.task = 'queen-care'; a.cropC = 0; a.cropP = 0; a.energy = 0.9; }
  queen.queen!.gut.c = 0;
  queen.queen!.gut.p = 0;
  let n = 0, rationingTicks = 0;
  sim.events.on('action-started', (e) => {
    const a = sim.stores.ants.get(e.antId);
    if (e.action === 'feed-queen' && a?.action?.secondary) n++;
  });
  for (let t = 0; t < 900; t++) {
    if (hold) { col.starvationStage = hold; col.stores.c = stores.c; col.stores.p = stores.p; }
    sim.tick();
    if (reserveFeedAllowed(col)) rationingTicks++;
  }
  return { n, rationingTicks };
}

describe('queen-care: reserve feeding is the S2 measure', () => {
  it('a nearly empty pool in a colony that is not rationing: no reserve feed', () => {
    const r = reserveFeeds({ c: 0.04, p: 0.04 }, 'lean');
    expect(r.n).toBe(0);
  });

  it('an empty pool (S2 rationing): the carers feed her from their reserve', () => {
    const r = reserveFeeds({ c: 0, p: 0 }, null);
    expect(r.rationingTicks).toBeGreaterThan(0);
    expect(r.n).toBeGreaterThan(0);
  });
});
