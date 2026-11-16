// Collapse of unstable ceilings (GDD 03 §12, App. E24): warning first, then a capped slump heap; brood unharmed and
// moved to open voxels, ants stunned and hurt; Gentle never collapses; stable rooms never warn.

import { describe, expect, it } from 'vitest';
import type { Ant, Brood, Chamber, DigPlan, Sim } from '@/sim/types';
import { spawnBrood } from '@/sim/entities';
import { commandsSystem } from '@/sim/systems';
import { capacityOf } from '../chambers/registry';
import { nestSim, placeWorker, playerNest, setMoisture } from '../nestTestKit';
import { packSample } from '../voxelKey';
import { collapseSystem, disturbNest, maxSpanOf } from './index';

interface Room { sim: Sim; chamber: Chamber; larvae: Brood[]; workers: Ant[] }

/** A free-dug room 10 BU wide and 1.5 BU tall, 6 BU deep, in the given soil and moisture, with 5 larvae and 2 workers. */
function room(material: 'sand' | 'loam', moisture: number): Room {
  const sim = nestSim({ material, moisture, systems: [commandsSystem, collapseSystem] });
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
  const floor = center.y - radii.y + 0.3 * bu;
  const larvae: Brood[] = [];
  for (let n = 0; n < 5; n++) {
    const pos = { x: center.x + (n - 2) * 1.5 * bu, y: floor, z: center.z + (n % 2) * bu };
    larvae.push(spawnBrood(sim, { colony: sim.state.colonies[0].id, stage: 'larva', destined: 'worker', pos, nestId: nest.id, chamberId: chamber.id }));
  }
  const workers = [
    placeWorker(sim, { x: center.x + 0.5 * bu, y: center.y, z: center.z }, { x: 1, y: 0, z: 0 }, nest.id),
    placeWorker(sim, { x: center.x - 1 * bu, y: center.y, z: center.z + 1 * bu }, { x: 0, y: 0, z: 1 }, nest.id),
  ];
  return { sim, chamber, larvae, workers };
}

const run = (sim: Sim, n: number): void => { for (let i = 0; i < n; i++) sim.tick(); };

function record(sim: Sim): { warn: number[]; collapse: number[] } {
  const out = { warn: [] as number[], collapse: [] as number[] };
  sim.events.on('collapse-warning', () => out.warn.push(sim.state.tick));
  sim.events.on('collapse', () => out.collapse.push(sim.state.tick));
  return out;
}

describe('GDD 03 App. E24: collapse in dry sand', () => {
  it('warns within 250 ticks, collapses 600 ticks later; afterwards no span over 3.0 BU, brood alive in open voxels, workers -10 %', () => {
    const { sim, chamber, larvae, workers } = room('sand', 0.05);
    expect(maxSpanOf(sim, chamber)).toBeGreaterThan(3);
    const ev = record(sim);
    run(sim, 250);
    expect(ev.warn.length).toBe(1);
    const warnTick = ev.warn[0];
    run(sim, 700);
    expect(ev.collapse.length).toBe(1);
    expect(Math.abs(ev.collapse[0] - (warnTick + 600))).toBeLessThanOrEqual(10);
    expect(maxSpanOf(sim, chamber)).toBeLessThanOrEqual(3.0 + 1e-6);
    for (const b of larvae) {
      expect(b.alive).toBe(true);
      expect(sim.carve.openness(b.pos.x, b.pos.y, b.pos.z)).toBeGreaterThanOrEqual(0.5);
    }
    for (const w of workers) expect(w.hp).toBeCloseTo(w.maxHp * 0.9, 6);
    expect(playerNest(sim).lastCollapseTick).toBe(ev.collapse[0] - 1); // events are flushed after the tick counter advanced
  });

  it('on Gentle the warning comes but no collapse within 3,000 ticks', () => {
    const { sim } = room('sand', 0.05);
    sim.state.config.rules.collapse = false;
    const ev = record(sim);
    run(sim, 3000);
    expect(ev.warn.length).toBeGreaterThanOrEqual(1);
    expect(ev.collapse.length).toBe(0);
  });

  it('the same room in damp sand (S_max 8) and in loam (16) never warns', () => {
    for (const [mat, m] of [['sand', 0.5], ['loam', 0.4]] as const) {
      const { sim } = room(mat, m);
      const ev = record(sim);
      run(sim, 1100);
      expect(ev.warn.length).toBe(0);
    }
  });

  it('a disturbance halves S_max: damp sand warns at once', () => {
    const { sim, chamber } = room('sand', 0.5);
    setMoisture(sim, 0.5);
    expect(disturbNest(sim, chamber.center, 20 * sim.world.bu, 'footsteps')).toBe(1);
  });
});

describe('GDD 03 §12 "When checked": plan completion and moisture changes trigger a check', () => {
  it('drying the soil by more than 0.1 checks at once, not at the next hourly check', () => {
    const { sim } = room('sand', 0.5);
    const ev = record(sim);
    run(sim, 100); // the hourly sand check ran at tick 90; the next is at 340
    expect(ev.warn.length).toBe(0);
    setMoisture(sim, 0.05);
    run(sim, 20);
    expect(ev.warn.length).toBe(1);
    expect(ev.warn[0]).toBeLessThanOrEqual(121);
  });

  it('a moisture drift of 0.1 or less waits for the scheduled check', () => {
    const { sim } = room('sand', 0.5);
    const ev = record(sim);
    run(sim, 100);
    setMoisture(sim, 0.45);
    run(sim, 200);
    expect(ev.warn.length).toBe(0);
  });

  it('a plan that completes checks the nest at once (loam is otherwise checked every 1,000 ticks)', () => {
    const { sim, chamber } = room('loam', 0.4);
    const ev = record(sim);
    run(sim, 100);
    expect(ev.warn.length).toBe(0);
    // the plan widened the room to a 20 BU span: unstable in loam (S_max 16)
    const bu = sim.world.bu;
    chamber.radii = { x: 10 * bu, y: 0.75 * bu, z: 10 * bu };
    sim.kernel.carveEllipsoid(chamber.center, chamber.radii, { force: true });
    const nest = playerNest(sim);
    nest.digPlans.push({ id: sim.state.nextId++, nestId: nest.id, kind: 'chamber', status: 'complete', statusTick: sim.state.tick } as unknown as DigPlan);
    run(sim, 20);
    expect(ev.warn.length).toBe(1);
  });
});
