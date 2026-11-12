// Chamber detection, identity, capacities and designation (GDD 03 §6; App. E checks 17, 18; acceptance 3).
import { describe, expect, it } from 'vitest';
import type { Chamber, Sim } from '@/sim/types';
import { spawnBrood } from '@/sim/entities';
import { detectNestChambers, updateOccupancy, checkRoyal } from './chambers/upkeep';
import { designateChamber, findChamberAt } from './index';
import { nestSim, placeWorker, runTicks } from './nestTestKit';

const BU = 4;
const ellipsoidVolume = (c: Chamber) => (4 / 3) * Math.PI * c.radii.x * c.radii.y * c.radii.z / BU ** 3;

function smallNest(): { sim: Sim; analytic: Map<number, number> } {
  const sim = nestSim({ nest: 'small' });
  const nest = sim.state.nests[0];
  return { sim, analytic: new Map(nest.chambers.map((c) => [c.id, ellipsoidVolume(c)])) };
}

/** A tunnel that has nothing to do with any chamber: from the shaft top region out to the side and down. */
function unrelatedDig(sim: Sim): void {
  const nest = sim.state.nests[0], e = nest.entrances[0];
  const a = { x: e.pos.x + 1.5 * BU, y: e.pos.y - 3 * BU, z: e.pos.z + 0.5 * BU };
  sim.kernel.carveCapsule(a, { x: a.x - 12 * BU, y: a.y - 2 * BU, z: a.z - 6 * BU }, BU, { force: true });
}

describe('chamber detection', () => {
  it('acceptance 3: three chambers joined by tunnels -> exactly three, volumes within 15 %, ids stable', () => {
    const { sim, analytic } = smallNest();
    const nest = sim.state.nests[0];
    detectNestChambers(sim, nest);
    expect(nest.chambers.length).toBe(3);
    for (const c of nest.chambers) {
      const want = analytic.get(c.id);
      expect(want).toBeDefined();
      expect(Math.abs(c.volume - want!) / want!).toBeLessThan(0.15);
    }
    const ids = nest.chambers.map((c) => c.id).sort();
    unrelatedDig(sim);
    detectNestChambers(sim, nest);
    expect(nest.chambers.map((c) => c.id).sort()).toEqual(ids);
    expect(nest.chambers.map((c) => c.type).sort()).toEqual(['food', 'nursery', 'royal']);
  });

  it('acceptance 3: unregistered rooms are detected as three general chambers whose ids survive unrelated digging', () => {
    const { sim, analytic } = smallNest();
    const nest = sim.state.nests[0];
    const truth = [...analytic.values()].sort((a, b) => a - b);
    nest.chambers = [];
    detectNestChambers(sim, nest);
    expect(nest.chambers.length).toBe(3);
    expect(nest.chambers.every((c) => c.type === 'general' && c.designatedBy === 'auto')).toBe(true);
    const vols = nest.chambers.map((c) => c.volume).sort((a, b) => a - b);
    vols.forEach((v, n) => expect(Math.abs(v - truth[n]) / truth[n]).toBeLessThan(0.15));
    const ids = nest.chambers.map((c) => c.id);
    unrelatedDig(sim);
    detectNestChambers(sim, nest);
    detectNestChambers(sim, nest);
    expect(nest.chambers.map((c) => c.id)).toEqual(ids);
  });

  it('check 17: a carved 8 x 2.5 x 12 room joined by a 2 BU tunnel registers as general, 126 +- 12 BU^3, within 60 ticks', () => {
    const { sim } = smallNest();
    const nest = sim.state.nests[0];
    const food = nest.chambers.find((c) => c.type === 'food')!;
    const room = { x: food.center.x - 16 * BU, y: food.center.y, z: food.center.z };
    sim.enqueue({ type: 'cheat.carveEllipsoid', center: room, radii: { x: 4 * BU, y: 1.25 * BU, z: 6 * BU }, yawDeg: 0 });
    const from = { x: food.center.x - food.radii.x + 0.5 * BU, y: food.center.y - food.radii.y + BU, z: food.center.z };
    const to = { x: room.x + 3.5 * BU, y: from.y, z: room.z };
    runTicks(sim, 1);
    sim.kernel.carveCapsule(from, to, BU, { force: true });
    runTicks(sim, 60);
    const general = nest.chambers.filter((c) => c.type === 'general');
    expect(general.length).toBe(1);
    expect(Math.abs(general[0].volume - 126)).toBeLessThanOrEqual(12);
  });

  it('roof, depth and floor area of an isolated room', () => {
    const sim = nestSim({ nest: 'small' });
    const nest = sim.state.nests[0];
    const royal = nest.chambers.find((c) => c.type === 'royal')!;
    detectNestChambers(sim, nest);
    expect(royal.depthBu).toBeCloseTo(19, 0);
    expect(royal.floorArea).toBeGreaterThan(30);
    expect(royal.covered).toBe(false);
  });
});

describe('capacity, occupancy, designation', () => {
  it('check 18: a nursery of 100 BU^3 with 40 eggs and 20 larvae has brood capacity 150 and occupancy 30', () => {
    const { sim } = smallNest();
    const nest = sim.state.nests[0];
    detectNestChambers(sim, nest);
    const nursery = nest.chambers.find((c) => c.type === 'nursery')!;
    nursery.volume = 100;
    designateChamber(sim, nursery.id, 'nursery', 'player'); // recomputes the capacity for the volume
    expect(nursery.capacity.brood).toBeCloseTo(150, 6);
    const colony = sim.state.colonies[0];
    for (let n = 0; n < 60; n++) {
      spawnBrood(sim, { colony: colony.id, stage: n < 40 ? 'egg' : 'larva', destined: 'worker', pos: { ...nursery.center }, chamberId: nursery.id, nestId: nest.id });
    }
    updateOccupancy(sim, nest);
    expect(nursery.occupancy.brood).toBeCloseTo(30, 6);
    expect(nursery.occupancy.brood / nursery.capacity.brood).toBeCloseTo(0.2, 6);
  });

  it('designation: one royal per nest, type and volume rules, findChamberAt', () => {
    const { sim } = smallNest();
    const nest = sim.state.nests[0];
    detectNestChambers(sim, nest);
    const [food, nursery, royal] = ['food', 'nursery', 'royal'].map((t) => nest.chambers.find((c) => c.type === t)!);
    expect(designateChamber(sim, food.id, 'royal', 'player')).toBe(true);
    expect(royal.type).toBe('general');
    expect(nest.chambers.filter((c) => c.type === 'royal').length).toBe(1);
    expect(designateChamber(sim, nursery.id, 'granary', 'player')).toBe(false); // Lasius has no granaries
    expect(designateChamber(sim, nursery.id, 'founding', 'player')).toBe(false);
    const tiny = nursery.volume;
    nursery.volume = 5;
    expect(designateChamber(sim, nursery.id, 'rest', 'player')).toBe(false); // below the rest minimum (12)
    nursery.volume = tiny;
    expect(findChamberAt(sim, nursery.center)?.id).toBe(nursery.id);
    expect(findChamberAt(sim, { x: 1, y: 1, z: 1 })).toBeNull();
  });

  it('the founding cell becomes royal at 8 adult workers (GDD 03 §6.5)', () => {
    const { sim } = smallNest();
    const nest = sim.state.nests[0];
    const royal = nest.chambers.find((c) => c.type === 'royal')!;
    royal.type = 'founding';
    royal.designatedBy = 'auto';
    checkRoyal(sim, nest);
    expect(royal.type).toBe('founding');
    for (let n = 0; n < 8; n++) placeWorker(sim, { ...royal.center }, { x: 1, y: 0, z: 0 }, nest.id);
    checkRoyal(sim, nest);
    expect(royal.type).toBe('royal');
  });
});
