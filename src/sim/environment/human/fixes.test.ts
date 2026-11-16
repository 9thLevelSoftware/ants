// Regression tests for the human-events review fixes (GDD 04 §15): tyre tracks crush once per car pass, children's
// sand stays within its ±100 mm bound, prints are refreshed only where the
// ground changed, and E19 (a game with carving, a footprint and a mowing saves and loads to the same state).

import { describe, expect, it } from 'vitest';
import { rngFork, rngRange } from '@/core/rng';
import type { HumanEventRun } from '@/sim/types';
import { createSim } from '@/sim/sim';
import { restore, snapshot } from '@/sim/save/snapshot';
import { stateHash } from '@/sim/save/hash';
import { CHILD_SAND_DELTA_MM, CRUSH_P, FOOT_PRINT_SAND_MM, MOW_CUT_MM } from '@/sim/balance/human';
import { TICKS_PER_HOUR } from '@/sim/time';
import { humanEventsSystem } from './index';
import { humanPlan } from './plans';
import { humanSites } from './sites';
import { applyImpact } from './effects/kinds';
import { deformDisc, pressPrint } from './effects/terrain';
import type { HumanPlan, Impact } from './plan';
import { alive, humanSim, patioWorld, placeWorker, runToEnd, scheduleNow } from './testkit';

const emptyRun = (): HumanEventRun => ({ instId: -1, progressS: 0, nextImpactTick: -1, cues: [], killed: 0, displaced: 0, itemsRemoved: 0 });

function deltaRange(sim: ReturnType<typeof humanSim>): { min: number; max: number } {
  let min = 0, max = 0;
  for (const t of sim.state.worldDelta.heightDeltas) for (const v of t.data) { min = Math.min(min, v / 16); max = Math.max(max, v / 16); }
  return { min, max };
}

describe('human events review fixes', () => {
  it('a car pass over loam kills about CRUSH_P tyre/soft on its tracks (per pass, not per tyre or per step)', () => {
    const sim = humanSim(patioWorld({ sizeMm: 16000, zone: 'asphalt', variant: 'car-park', surface: 'loam' }));
    const site = humanSites(sim.world).list.find((s) => s.kind === 'car-park')!;
    const inst = scheduleNow(sim, 'car', 'arrive', site.id, null);
    inst.param = 0;
    sim.tick();
    const plan = humanPlan(sim, inst)!;
    const tyres = plan.impacts.filter((i) => i.contact === 'tyre');
    // workers on the leading tracks along the straight part of the drive
    const rng = rngFork(5, 'tracks');
    const ids: number[] = [];
    while (ids.length < 120) {
      const t = tyres[Math.floor(rngRange(rng, tyres.length * 0.1, tyres.length * 0.6))].fp;
      const id = placeWorker(sim, t.x + rngRange(rng, -40, 40), t.z + rngRange(rng, -40, 40));
      if (id >= 0) ids.push(id);
    }
    sim.index.refresh();
    runToEnd(sim, inst, 1500);
    const n = ids.length, p = CRUSH_P.tyre.soft, dead = n - alive(sim, ids);
    expect(Math.abs(dead - n * p), `${dead}/${n} dead`).toBeLessThanOrEqual(4 * Math.sqrt(n * p * (1 - p)) + 1);
  });

  it('children digging the same spot keeps the sand within ±CHILD_SAND_DELTA_MM', () => {
    const sim = humanSim(patioWorld({ zone: 'sand', variant: 'sand-pit', surface: 'sand', sizeMm: 4000 }));
    const plan = { kind: 'children', variant: 'play-session', actors: [], siteId: -1, extent: 0 } as unknown as HumanPlan;
    for (let i = 0; i < 40; i++) {
      const imp: Impact = { t: 0, fp: { x: 2000, y: 0, z: 2000, yaw: 0, hx: 120, hz: 120, disc: true }, contact: 'scoop', actor: 0, value: 500 };
      applyImpact(sim, emptyRun(), plan, imp);
    }
    const r = deltaRange(sim);
    expect(r.min).toBeGreaterThanOrEqual(-CHILD_SAND_DELTA_MM);
    expect(r.max).toBeLessThanOrEqual(CHILD_SAND_DELTA_MM);
    expect(r.min).toBeLessThan(-CHILD_SAND_DELTA_MM * 0.9);
  });

  it('a print presses to its own depth: overlapping prints stay one print deep, a heap is pressed down, a crater kept', () => {
    expect(pressPrint(0, -5)).toBe(-5);
    expect(pressPrint(-5, -5)).toBe(-5);
    expect(pressPrint(-2, -5)).toBe(-5);
    expect(pressPrint(-40, -5)).toBe(-40);
    expect(pressPrint(20, -5)).toBe(15);
    const sim = humanSim(patioWorld({ zone: 'sand', variant: 'sand-pit', surface: 'sand', sizeMm: 3000 }));
    let events = 0;
    sim.events.on('world.terrain-deformed', () => { events++; });
    for (let i = 0; i < 10; i++) { deformDisc(sim, 1500, 1500, 100, (d) => -FOOT_PRINT_SAND_MM * (1 - d * d), 'footprint', pressPrint); sim.tick(); }
    expect(deltaRange(sim).min).toBeCloseTo(-FOOT_PRINT_SAND_MM, 1);
    // only the first print changed the ground: the repeats emit nothing
    expect(events).toBe(1);
  });

  it('E19: carving, a sand footprint and a mowing save and load to the same state, deltas and sward', () => {
    const world = patioWorld({ zone: 'lawn', variant: 'mown', surface: 'sand', sizeMm: 4000 });
    const sim = humanSim(world);
    sim.tick();
    for (let i = 0; i < 3; i++) sim.kernel.carveSphere({ x: 600 + i * 400, y: -40, z: 600 }, 30, { force: true });
    const lane = humanSites(sim.world).list.find((s) => s.kind === 'lawn-lane');
    const lawn = humanSites(sim.world).list.find((s) => s.kind === 'lawn-mown')!;
    sim.state.worldDelta.grassHeightMm.fill(0); // bare sand for the print
    if (lane) runToEnd(sim, scheduleNow(sim, 'footsteps', 'adult', lane.id, null));
    else applyImpact(sim, emptyRun(), { kind: 'footsteps', variant: 'adult', actors: [], siteId: -1, extent: 0 } as unknown as HumanPlan,
      { t: 0, fp: { x: 2000, y: 0, z: 2000, yaw: 0, hx: 140, hz: 50, disc: false }, contact: 'adult-shoe', actor: 0, value: 0 });
    sim.state.worldDelta.grassHeightMm.fill(0);
    sim.state.worldDelta.grassHeightMm.fill(80, 0, 400);
    const mow = scheduleNow(sim, 'mowing', 'motor', lawn.id, null);
    for (let i = 0; i < 0.05 * TICKS_PER_HOUR * 10 && !mow.cancelled; i++) sim.tick();
    expect(sim.state.worldDelta.heightDeltas.length).toBeGreaterThan(0);
    expect(sim.state.worldDelta.carve.keys.length).toBeGreaterThanOrEqual(3);
    expect(Array.from(sim.state.worldDelta.grassHeightMm)).toContain(MOW_CUT_MM);
    const hash = stateHash(sim.state);
    const loaded = createSim(restore(snapshot(sim)).state, world, { systems: [humanEventsSystem] });
    expect(loaded.state.worldDelta.carve.keys).toEqual(sim.state.worldDelta.carve.keys);
    expect(loaded.state.worldDelta.carve.chunks.map((c) => Array.from(c))).toEqual(sim.state.worldDelta.carve.chunks.map((c) => Array.from(c)));
    expect(stateHash(loaded.state)).toBe(hash);
    expect(Array.from(loaded.state.worldDelta.grassHeightMm)).toEqual(Array.from(sim.state.worldDelta.grassHeightMm));
    expect(loaded.state.worldDelta.heightDeltas.map((t) => Array.from(t.data))).toEqual(sim.state.worldDelta.heightDeltas.map((t) => Array.from(t.data)));
    for (let i = 0; i < 300; i++) { sim.tick(); loaded.tick(); }
    expect(stateHash(loaded.state)).toBe(stateHash(sim.state));
  });
});
