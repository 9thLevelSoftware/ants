// colony-life round 3 (nest bench, woodland-edge #1): with food guaranteed, 6 of 9 larvae starved. Two nurses spent
// 0.55 gd carrying larvae royal -> royal (one larva 89 times): the warmer chamber's pile point lay inside the royal
// chamber's ellipsoid, so every put-down assigned the larva back to the royal chamber and the board posted the same
// move again; a hungry larva in the "wrong" chamber gets only that combined move + feed job, so it was never fed.
//   N1 (sorting.ts): a chamber whose pile point lands in another chamber is no sorting destination.
//   N2 (board.ts): a larva whose gut is empty is fed where it lies; it is sorted once it has food in it.
import { describe, expect, it } from 'vitest';
import { pilePoint } from './places';
import { boardOf, Job } from './board';
import { moveTarget, sortContext } from './sorting';
import { forceClimate, makeNestColony } from './testkit';
import { ports } from '@/sim/ants/actions/ports';

describe('brood sorting only to chambers a put-down reaches (round 3, N1)', () => {
  it('a warmer chamber whose pile points lie in the royal chamber is no destination; brood in the royal chamber stays', () => {
    const k = makeNestColony({ workers: 0, brood: [{ stage: 'larva', n: 3, chamber: 'royal', progress: 0.1 }] });
    const { sim, nest, nursery, royal } = k;
    forceClimate(k, (id) => (id === nursery.id ? [27, 0.85] : id === royal.id ? [15, 0.85] : null));
    const ctxOf = () => sortContext(sim, nest, sim.species, () => 0);
    const nurseryIdx = nest.chambers.indexOf(nursery);
    // as built, the warm nursery is the best chamber for larvae and the larvae get a move
    const before = ctxOf();
    expect(before.best[0]).toBe(nurseryIdx);
    const larva = sim.stores.brood.list.find((b) => b.alive && b.stage === 'larva')!;
    expect(moveTarget(before, larva, { marker: false })).toBe(nursery.id);
    // widen the royal chamber's ellipsoid until it holds the nursery's pile points more deeply than the nursery does:
    // a larva put down at the nursery's pile would be assigned to the royal chamber (woodland-edge #1's geometry)
    const p = { x: 0, y: 0, z: 0 };
    const owned = () => [0, 1, 2].every((g) => ports.findChamberAt(sim, pilePoint(nursery, g, p))?.id === royal.id);
    for (let grow = 0; grow < 40 && !owned(); grow++) royal.radii = { x: royal.radii.x * 1.15, y: royal.radii.y * 1.15, z: royal.radii.z * 1.15 };
    expect(owned()).toBe(true);
    const after = ctxOf();
    for (let g = 0; g < 3; g++) expect(after.best[g]).not.toBe(nurseryIdx);
    expect(moveTarget(after, larva, { marker: false })).toBe(-1);
    // the nursery's score still counts as the score of brood lying in it
    expect(after.scores[0][nurseryIdx]).toBeCloseTo(before.scores[0][nurseryIdx], 9);
  });
});

describe('a larva with an empty gut is fed where it lies (round 3, N2)', () => {
  it('its job is feed, not the combined move + feed, while a warmer chamber waits', () => {
    const k = makeNestColony({
      workers: 0, stores: { c: 200, p: 200 },
      brood: [{ stage: 'larva', n: 2, chamber: 'nursery', progress: 0.3 }],
    });
    const { sim, nursery, royal } = k;
    forceClimate(k, (id) => (id === royal.id ? [27, 0.85] : id === nursery.id ? [15, 0.85] : null));
    const larvae = sim.stores.brood.list.filter((b) => b.alive && b.stage === 'larva');
    // one larva with an empty gut for a while, one with a little food left
    larvae[0].gutC = 0; larvae[0].gutP = 0; larvae[0].hungerTicks = 600;
    larvae[1].gutC = 0.02; larvae[1].gutP = 0.05; larvae[1].hungerTicks = 0;
    sim.tick();
    const jobs = boardOf(sim, sim.state.colonies[0].id)!.jobs;
    const kind = (id: number) => jobs.find((j) => j.id === id)?.kind;
    expect(kind(larvae[0].id)).toBe(Job.feed);
    expect(kind(larvae[1].id)).toBe(Job.move); // still sorted with a feed after it (GDD 02 App. E 19)
  });
});
