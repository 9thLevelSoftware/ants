// nest-fix3 review fixes, each at its root cause (the reviewer's scenarios are in fleeWater.verify.test.ts):
//   - D_seal of an entrance buried by plain soil (no PLUG voxels) is seeded on the nest side: walks inside the closed
//     nest work, wet or dry (navFields.ts innerThroatPoints);
//   - the water over a body beside the basin (centre in the solid sample of a wall) is the column's next door, not
//     "off the basin" (spill.ts waterDepthOver SIDE_PROBE);
//   - the high-ground place of a closed wet nest is a floor above the level, and follows the level (dryPlace.ts
//     highFloors cache);
//   - the possessed ant's water card never overwrites combat's "Pinned" card and comes back once combat cleared it.
import { describe, expect, it } from 'vitest';
import type { Ant, Sim } from '@/sim/types';
import { nestFieldId } from '@/sim/types';
import { FLEE_DRY_MARGIN_BU, FLOOD_STEP_TICKS } from '@/sim/balance/weather';
import { floodCheats } from '@/sim/nest/flood/cheats';
import { spillFor } from '@/sim/nest/flood/runtime';
import { waterDepthOver } from '@/sim/nest/flood/spill';
import { dryPlace, waterView } from '@/sim/nest/flood/dryPlace';
import { possessedFloodAlert } from '@/sim/nest/flood/diagnostics';
import { fillSphere } from '@/sim/nest/carveOps';
import { clearAlert, raiseAlert } from '@/sim/progression/alerts';
import { navTo } from '@/sim/locomotion';
import { makeNestColony, run, type NestColony } from './testkit';

function colony(workers: number): NestColony {
  const k = makeNestColony({ workers, seed: 3, stores: { c: 100, p: 100 }, brood: [] });
  floodCheats(k.sim.state).drainScale = 0;
  floodCheats(k.sim.state).rainI = 0;
  run(k.sim, 50);
  return k;
}

/** Buries the throat with soil (no PLUG flags): the entrance goes `sealed`. */
function bury(k: NestColony): void {
  const bu = k.sim.world.bu;
  fillSphere(k.sim, { ...k.entrance.pos, y: k.entrance.pos.y - 1.5 * bu }, 2.5 * bu);
  run(k.sim, 100);
  expect(k.entrance.status).toBe('sealed');
}

function waterForShare(sim: Sim, k: NestColony, chamberId: number, share: number): number {
  const cache = spillFor(sim, k.nest);
  const list = cache.chamberSamples.get(chamberId)!;
  return cache.cumVol[list[Math.min(list.length - 1, Math.floor(share * list.length))] + 1];
}

const floorOf = (c: { center: { x: number; y: number; z: number }; radii: { y: number } }) =>
  ({ x: c.center.x, y: c.center.y - c.radii.y, z: c.center.z });

describe('closed nest: walks inside it work (D_seal on the nest side of a buried throat)', () => {
  it('dry: the seal field reaches the chambers, and the queen walks from the royal chamber to the food chamber', () => {
    const k = colony(4);
    const { sim } = k;
    bury(k);
    const seal = nestFieldId(k.nest.id, { kind: 'seal', id: -1 });
    expect(Number.isFinite(sim.nestNav.distanceAt(seal, k.queen.pos))).toBe(true);
    expect(navTo(sim, k.queen, floorOf(k.food), sim.world.bu)).toBe(true);
    run(sim, 20);
    expect(k.queen.nav.status).toBe('moving');
    run(sim, 1200);
    expect(k.queen.chamberId === k.food.id || k.queen.nav.status === 'arrived').toBe(true);
  }, 60_000);
});

describe('water over a body beside the basin', () => {
  it('a point in the solid sample next to a basin sample reads that column\'s depth, not -Infinity', () => {
    const k = colony(2);
    const { sim } = k;
    const cache = spillFor(sim, k.nest), v = sim.carve.voxel;
    const level = (cache.level[cache.level.length - 1] + 0.5) * v; // everything under water
    let checked = 0;
    for (let s = 0; s < cache.si.length && checked < 20; s += 7) {
      const i = cache.si[s], j = cache.sj[s], k2 = cache.sk[s];
      if (cache.index.get(i + 1, j, k2) >= 0 || cache.index.get(i + 1, j + 1, k2) >= 0 || cache.index.get(i + 1, j - 1, k2) >= 0) continue;
      const beside = waterDepthOver(cache, v, (i + 1) * v, j * v, k2 * v, level, -Infinity);
      const own = waterDepthOver(cache, v, i * v, j * v, k2 * v, level, -Infinity);
      expect(beside).toBe(own);
      checked++;
    }
    expect(checked).toBeGreaterThan(5);
  });
});

describe('high ground of a closed wet nest', () => {
  it('is a basin floor at least the margin above the level, and moves up with the level', () => {
    const k = colony(2);
    const { sim } = k;
    const bu = sim.world.bu, margin = FLEE_DRY_MARGIN_BU * bu;
    bury(k);
    const from = floorOf(k.royal);
    const at = (share: number) => {
      k.nest.flood.water = waterForShare(sim, k, k.nursery.id, share);
      run(sim, FLOOD_STEP_TICKS + 1);
      const w = waterView(sim, k.nest)!;
      const p = dryPlace(sim, w, from, margin)!;
      expect(p.route).toBe('walk');
      expect(p.outside).toBe(false);
      expect(p.pos.y).toBeGreaterThanOrEqual(w.level + margin - 0.5 * sim.carve.voxel);
      return { level: w.level, y: p.pos.y };
    };
    const low = at(0.1), high = at(0.9);
    expect(high.level).toBeGreaterThan(low.level);
    expect(high.y).toBeGreaterThan(low.y);
  }, 60_000);
});

describe('the possessed ant\'s water card next to combat\'s "Pinned" card (pinned first)', () => {
  it('a submersion while pinned leaves the Pinned card as it is; once combat clears it, the water card comes up', () => {
    const k = colony(6);
    const { sim } = k;
    const bu = sim.world.bu;
    const d = (a: Ant) => Math.hypot(a.pos.x - k.royal.center.x, a.pos.y - k.royal.center.y, a.pos.z - k.royal.center.z);
    const p = sim.stores.ants.list.filter((a) => a.alive && a.caste === 'worker').sort((a, b) => d(a) - d(b))[0];
    sim.enqueue({ type: 'possess', antId: p.id });
    run(sim, 2);
    const card = () => sim.state.progression.alerts.find((a) => a.kind === 'possessed-danger' && a.subjectId === p.id);
    const cache = spillFor(sim, k.nest), v = sim.carve.voxel;
    const feet = p.pos.y - p.up.y * p.footOffset;
    let n = 0;
    while (n < cache.level.length && (cache.level[n] - 0.5) * v < feet + bu) n++;
    for (let s = 0; s < 10; s++) { k.nest.flood.water = (cache.cumVol[n] * (s + 1)) / 10; run(sim, FLOOD_STEP_TICKS); }
    run(sim, 30);
    expect((p.bb['wx.sub'] ?? 0)).toBeGreaterThan(0);
    // combat pins her while she is under water (its raise takes the shared card over): the flood's pass leaves it
    raiseAlert(sim, {
      kind: 'possessed-danger', level: 'warning', subjectId: p.id, title: 'Pinned', cause: 'pinned',
      focus: { kind: 'ant', id: p.id, pos: { ...p.pos } }, diagnosticId: null, tokens: { cause: 'pinned' },
    });
    possessedFloodAlert(sim);
    expect(card()?.cause).toBe('pinned');
    // combat lets go while she is still under water: the flood's next pass raises the water card (critical: no cooldown)
    clearAlert(sim, 'possessed-danger', p.id);
    possessedFloodAlert(sim);
    expect(card()?.cause).toBe('under-water');
    expect(card()?.level).toBe('critical');
  }, 60_000);
});

describe('evacuated brood goes to the highest dry chamber floor (GDD 03 §9.4 "score dryness first")', () => {
  it('royal chamber flooding: brood carried out of it is first put down in the food chamber, the highest dry floor', () => {
    const k = makeNestColony({
      workers: 12, seed: 3, stores: { c: 100, p: 100 },
      brood: [{ stage: 'larva', n: 3, chamber: 'royal' }, { stage: 'pupa', n: 2, chamber: 'royal', progress: 0.1 }],
    });
    const { sim } = k;
    floodCheats(sim.state).drainScale = 0;
    floodCheats(sim.state).rainI = 0;
    run(sim, 50);
    expect(k.food.center.y).toBeGreaterThan(k.nursery.center.y);
    const full = waterForShare(sim, k, k.royal.id, 1);
    const carried = new Map<number, boolean>(), firstDrop = new Map<number, number>();
    // the brood that lay in the royal chamber when the water came (eggs laid later are sorted, not evacuated)
    const inRoyal = new Set(sim.stores.brood.list.filter((b) => b.alive && b.chamberId === k.royal.id).map((b) => b.id));
    expect(inRoyal.size).toBe(5);
    for (let s = 0; s < 80; s++) {
      k.nest.flood.water = (full * (s + 1)) / 80;
      for (let t = 0; t < FLOOD_STEP_TICKS; t++) {
        run(sim, 1);
        for (const b of sim.stores.brood.list) {
          if (!b.alive || !inRoyal.has(b.id)) continue;
          if (b.carriedBy >= 0) carried.set(b.id, true);
          else if (carried.get(b.id) && !firstDrop.has(b.id)) firstDrop.set(b.id, b.chamberId);
        }
      }
    }
    expect(firstDrop.size).toBeGreaterThan(0);
    expect([...firstDrop.values()].filter((c) => c !== k.food.id)).toEqual([]);
  }, 60_000);
});
