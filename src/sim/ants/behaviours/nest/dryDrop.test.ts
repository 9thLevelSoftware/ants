// colony-life round 3 (nest bench, woodland-edge #1, food guaranteed): in a nest with no dry chamber while it took
// water, the evacuation put larvae down at "the nearest dry place" dry by FLEE_DRY_MARGIN_BU (1 BU), but the board
// evacuates a lying item that is within BROOD_EVAC_MARGIN_BU (1 BU) of the water while the nest takes water: the item
// was evacuated again at the next board build, a few mm at a time. One larva was carried 89 times in 0.6 gd, the two
// nurses did nothing else, all larvae went without food for 0.55 gd and 6 of 9 starved.
// Rule (floodEvac.ts dryDropPoint): the dry place for evacuated brood is dry by BROOD_EVAC_MARGIN_BU plus
// BROOD_DRY_DROP_SLACK_BU, so an item put down there is not "in water" for the board.
import { describe, expect, it } from 'vitest';
import { floodCheats } from '@/sim/nest/flood/cheats';
import { spillFor } from '@/sim/nest/flood/runtime';
import { BROOD_DRY_DROP_SLACK_BU, BROOD_EVAC_MARGIN_BU, FLOOD_STEP_TICKS } from '@/sim/balance/weather';
import { isDryAt, waterView } from '@/sim/nest/flood/dryPlace';
import { dryDropPoint, floodEvac, broodInWater, DRY_SPOT } from './floodEvac';
import { makeNestColony, run } from './testkit';

describe('evacuated brood is put down clear of the evacuation test (round 3)', () => {
  it('in a rising nest with no dry chamber, the dry drop point is not "in water" for the board, and no item is carried again and again', () => {
    const k = makeNestColony({
      workers: 10, seed: 3, stores: { c: 100, p: 100 },
      brood: [{ stage: 'larva', n: 3, chamber: 'royal', progress: 0.1 }, { stage: 'egg', n: 3, chamber: 'royal' }],
    });
    const { sim, nest } = k;
    floodCheats(sim.state).drainScale = 0;
    run(sim, 50);
    // water over every chamber floor (the spill order fills the lowest samples first), kept rising by rain
    const cache = spillFor(sim, nest);
    const floors = nest.chambers.map((c) => c.center.y - c.radii.y);
    const top = Math.max(...floors) + 0.5 * sim.world.bu;
    let n = 0;
    while (n < cache.level.length && (cache.level[n] - 0.5) * sim.carve.voxel < top) n++;
    nest.flood.water = cache.cumVol[n];
    floodCheats(sim.state).rainI = 0.6;
    run(sim, FLOOD_STEP_TICKS * 2);
    const f = floodEvac(sim, nest)!;
    expect(f, 'the nest is wet').toBeTruthy();
    expect(f.rising, 'it takes water').toBe(true);
    expect(f.dest, 'no chamber is dry').toBe(DRY_SPOT);
    // the drop point a nurse would use, from where the brood lies: an item put down there is not in water
    const b = sim.stores.brood.list.find((x) => x.alive && x.stage === 'larva')!;
    const p = dryDropPoint(sim, nest, b.pos);
    expect(p).toBeTruthy();
    const probe = { ...b, pos: { ...p! }, carriedBy: -1 };
    expect(broodInWater(sim, f, probe)).toBe(false);
    // the rule: dry by more than the board's evacuation margin (by BROOD_DRY_DROP_SLACK_BU), not just by it; on the
    // woodland-edge #1 hand-over an item at a 1 BU dry place lay inside the 1 BU band and was evacuated again (the
    // system-level reproduction is the round's probe on that snapshot, test-output/colony-life/round-3/)
    const slack = (BROOD_EVAC_MARGIN_BU + BROOD_DRY_DROP_SLACK_BU) * sim.world.bu;
    expect(isDryAt(sim, waterView(sim, nest)!, p!, slack - 1e-6)).toBe(true);
    // and over a minute of the real behaviours no item is carried more than a few times
    const moves = new Map<number, number>();
    sim.events.on('brood-moved', (e) => moves.set(e.broodId, (moves.get(e.broodId) ?? 0) + 1));
    run(sim, 600);
    const most = Math.max(0, ...moves.values());
    expect(most, JSON.stringify([...moves])).toBeLessThanOrEqual(4);
  }, 120_000);
});
