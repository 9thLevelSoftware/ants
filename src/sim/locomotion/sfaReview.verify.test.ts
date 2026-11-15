// Reviewer tests for sim-fix-ants item 1 and the locomotion cost changes (fine separation grid, cached AI speed,
// standing walkers not stepped): edge cases of nest point goals, crowds at one goal, and save / load equality.
import { describe, expect, it } from 'vitest';
import type { Ant, Sim } from '@/sim/types';
import { createSim } from '@/sim/sim';
import { restore, snapshot, stateHash } from '@/sim/save';
import { navTo } from './index';
import { locoSim, placeInChamber, playerNest, runUntilDone, workers } from './testkit';
import { floorBelow } from './stallkit';

function standingWhileMoving(sim: Sim, ants: readonly Ant[], maxTicks: number): { ticks: number; standing: number; worst: number } {
  const bu = sim.world.bu, per = new Map<number, number>();
  let standing = 0;
  const ticks = runUntilDone(sim, ants, maxTicks, () => {
    for (const a of ants) {
      if (a.nav.status !== 'moving' || a.medium === 'air' || a.speed >= 0.05 * bu) continue;
      standing++;
      per.set(a.id, (per.get(a.id) ?? 0) + 1);
    }
  });
  return { ticks, standing, worst: Math.max(0, ...per.values()) };
}

describe('reviewer: nest point goals, edge cases (sim-fix-ants 1)', () => {
  it('a goal under the walker with arrival radius 0 ends at once (no stand at "moving")', () => {
    const sim = locoSim({ nest: 'small', workers: 1, seed: 3 });
    const nest = playerNest(sim), ant = workers(sim)[0];
    for (const c of nest.chambers) {
      placeInChamber(sim, [ant], nest, c, 11);
      const goal = floorBelow(sim, ant.pos)!;
      navTo(sim, ant, goal, 0);
      const r = standingWhileMoving(sim, [ant], 100);
      expect(ant.nav.status, `chamber ${c.id}`).toBe('arrived');
      expect(r.ticks, JSON.stringify(r)).toBeLessThanOrEqual(10);
    }
  });

  it('chamber to chamber walks to a point goal arrive without standing (field -> final seek hand-over)', () => {
    const sim = locoSim({ nest: 'small', workers: 1, seed: 3 });
    const nest = playerNest(sim), ant = workers(sim)[0], bu = sim.world.bu;
    const rows: { from: number; to: number; status: string; ticks: number; worst: number }[] = [];
    for (const a of nest.chambers) for (const b of nest.chambers) {
      if (a === b) continue;
      placeInChamber(sim, [ant], nest, a, 5);
      const goal = floorBelow(sim, { x: b.center.x + 0.3 * b.radii.x, y: b.center.y, z: b.center.z })!;
      navTo(sim, ant, goal, 0.5 * bu);
      const r = standingWhileMoving(sim, [ant], 1200);
      rows.push({ from: a.id, to: b.id, status: ant.nav.status, ticks: r.ticks, worst: r.worst });
    }
    expect(rows.every((r) => r.status === 'arrived'), JSON.stringify(rows)).toBe(true);
    expect(Math.max(...rows.map((r) => r.worst)), JSON.stringify(rows)).toBeLessThanOrEqual(8);
  });

  it('a crowd of 24 sent to one point in a chamber: every request ends in bounded time', () => {
    const sim = locoSim({ nest: 'small', workers: 24, seed: 4 });
    const nest = playerNest(sim), bu = sim.world.bu, ants = workers(sim);
    const c = nest.chambers[1];
    placeInChamber(sim, ants, nest, c, 9);
    const goal = floorBelow(sim, { x: c.center.x, y: c.center.y, z: c.center.z })!;
    for (const a of ants) navTo(sim, a, goal, 0.6 * bu);
    const r = standingWhileMoving(sim, ants, 600);
    const arrived = ants.filter((a) => a.nav.status === 'arrived').length;
    console.log('[review crowd]', JSON.stringify({ ...r, arrived, failed: ants.filter((a) => a.nav.status === 'failed').length }));
    expect(ants.filter((a) => a.nav.status === 'moving')).toHaveLength(0);
    expect(arrived).toBeGreaterThan(ants.length / 2);
  });
});

describe('reviewer: save / load equality with the new locomotion caches', () => {
  it('walkers busy in the nest: snapshot -> restore in mid-walk continues exactly like the uninterrupted run', () => {
    const a = locoSim({ nest: 'small', workers: 30, seed: 7 });
    const nest = playerNest(a), bu = a.world.bu, ants = workers(a);
    ants.forEach((w, i) => placeInChamber(a, [w], nest, nest.chambers[i % nest.chambers.length], 20 + i));
    let k = 0;
    const errands = (sim: Sim) => {
      // every 25 ticks a few idle walkers get a new goal in another chamber (state-only choice: deterministic)
      if (sim.state.tick % 25 !== 0) return;
      const list = workers(sim);
      for (let i = 0; i < list.length; i++) {
        const w = list[(i + k) % list.length];
        if (w.nav.status === 'moving' || i > 6) continue;
        const c = nest.chambers[(i + sim.state.tick / 25) % nest.chambers.length];
        const g = floorBelow(sim, { x: c.center.x + ((i % 3) - 1) * bu, y: c.center.y, z: c.center.z })!;
        navTo(sim, w, g, 0.6 * bu);
      }
      k++;
    };
    for (let t = 0; t < 333; t++) { errands(a); a.tick(); }
    const b = createSim(restore(snapshot(a)).state, a.world, { systems: a.systems });
    expect(stateHash(b.state)).toBe(stateHash(a.state));
    const kA = k;
    for (let t = 0; t < 400; t++) { k = kA + Math.floor(t / 25); errands(a); a.tick(); }
    k = kA;
    for (let t = 0; t < 400; t++) { k = kA + Math.floor(t / 25); errands(b); b.tick(); }
    expect(stateHash(b.state)).toBe(stateHash(a.state));
  });
});
