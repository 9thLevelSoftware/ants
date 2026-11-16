// Adversarial review of the collapse module (weather-effects review). Tests that FAIL here demonstrate a defect and
// are left for the fixer; passing ones are regression tests.

import { describe, expect, it } from 'vitest';
import type { Chamber, Sim } from '@/sim/types';
import { commandsSystem } from '@/sim/systems';
import { capacityOf } from '../chambers/registry';
import { nestSim, placeWorker, playerNest } from '../nestTestKit';
import { packSample } from '../voxelKey';
import { collapseSystem } from './index';
import { getDiagnostic } from '@/sim/progression/diagnostics';
import { TICKS_PER_DAY } from '@/sim/time';

/** The E24 room: a free-dug cavity 10 BU wide, 1.5 BU tall, 6 BU deep, in dry sand (moisture 0.05). */
function dryRoom(): { sim: Sim; chamber: Chamber } {
  const sim = nestSim({ material: 'sand', moisture: 0.05, systems: [commandsSystem, collapseSystem] });
  const bu = sim.world.bu, v = sim.carve.voxel;
  const nest = playerNest(sim);
  const c0 = sim.world.size / 2;
  const center = { x: c0 + 0.13 * bu, y: -6 * bu, z: c0 - 0.07 * bu };
  const radii = { x: 5 * bu, y: 0.75 * bu, z: 5 * bu };
  sim.kernel.carveEllipsoid(center, radii, { force: true });
  const volume = (4 / 3) * Math.PI * 5 * 0.75 * 5;
  const chamber: Chamber = {
    id: sim.state.nextId++, type: 'nursery', designatedBy: 'player', center, radii, volume, floorArea: Math.PI * 25,
    depthBu: 6, depthMm: 6 * bu, roofMin: 5.25, covered: false,
    seedVoxel: packSample(Math.round(center.x / v), Math.round(center.y / v), Math.round(center.z / v)),
    voxelCount: Math.round(volume / 0.125), capacity: capacityOf('nursery', volume),
    occupancy: { adults: 0, brood: 0, food: 0, other: 0 }, temp: 20, humidity: 0.7, wetUntilTick: -1, flooded: 0,
    floodRisk: 0, flags: 0, createdTick: 0,
  };
  nest.chambers.push(chamber);
  nest.founding = null;
  return { sim, chamber };
}

const run = (sim: Sim, n: number): void => { for (let i = 0; i < n; i++) sim.tick(); };

describe('review: who the debris hurts (GDD 03 §12 "Contents": ants inside refilled voxels)', () => {
  it('an ant near the wall, outside the unstable set and its debris, is not stunned or hurt', () => {
    const { sim, chamber } = dryRoom();
    const bu = sim.world.bu;
    // 4.3 BU from the centre of a 5 BU-radius room: about 0.7 BU from the wall, so 2 d_sup ~ 1.4 < 3.0
    const edge = placeWorker(sim, { x: chamber.center.x + 4.3 * bu, y: chamber.center.y, z: chamber.center.z }, { x: 0, y: 0, z: 1 }, playerNest(sim).id);
    const middle = placeWorker(sim, { x: chamber.center.x, y: chamber.center.y, z: chamber.center.z }, { x: 1, y: 0, z: 0 }, playerNest(sim).id);
    const collapses: number[] = [];
    sim.events.on('collapse', (e) => collapses.push(e.volume));
    run(sim, 950);
    expect(collapses.length).toBe(1);
    // the ant in the middle was under the slump: hurt
    expect(middle.hp).toBeCloseTo(middle.maxHp * 0.9, 6);
    // the edge ant's own spot is still open: it was not in the debris
    expect(sim.carve.openness(edge.pos.x, edge.pos.y, edge.pos.z)).toBeGreaterThanOrEqual(0.5);
    expect(edge.hp).toBe(edge.maxHp);
  });

  it('an ant caught in the debris ends in an open voxel (moved out, GDD 03 §12 / App. F2)', () => {
    const { sim, chamber } = dryRoom();
    const middle = placeWorker(sim, { ...chamber.center }, { x: 1, y: 0, z: 0 }, playerNest(sim).id);
    run(sim, 950);
    expect(middle.alive).toBe(true);
    expect(sim.carve.openness(middle.pos.x, middle.pos.y, middle.pos.z)).toBeGreaterThanOrEqual(0.5);
  });
});

describe('review: diag-nest-stability over time (GDD 03 App. D: bad = collapse in the last game day)', () => {
  it('is bad right after the collapse and no longer bad a game day later', () => {
    const { sim } = dryRoom();
    const id = `diag-nest-stability:${playerNest(sim).id}`;
    run(sim, 950);
    expect(getDiagnostic(sim, id)?.status).toBe('bad');
    run(sim, TICKS_PER_DAY + 500);
    expect(playerNest(sim).collapse.length).toBe(0);
    expect(getDiagnostic(sim, id)?.status).not.toBe('bad');
  });
});
