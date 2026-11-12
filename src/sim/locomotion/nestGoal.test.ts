// sim-fix-ants item 1, reproductions: an autonomous walker with a point goal inside a nest used to stand still for
// seconds with nav.status 'moving' and speed 0 (goals 0.4-2 BU away; moves smaller than one 0.5 BU voxel; upside
// down on a ceiling with the goal below). Each case must now arrive promptly, without standing.
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Sim } from '@/sim/types';
import { locoStats, navTo, placeOnSurface } from './index';
import { locoSim, placeInChamber, playerNest, workers } from './testkit';
import { floorBelow } from './stallkit';
import { chamberAt } from './nests';

interface Walk { status: string; ticks: number; standing: number }

/** Walks to goal; counts ticks at 'moving' with (almost) no speed. */
function walk(sim: Sim, ant: Ant, goal: Vec3, arriveBu: number, maxTicks = 300): Walk {
  const bu = sim.world.bu;
  navTo(sim, ant, goal, arriveBu * bu);
  let standing = 0, t = 0;
  for (; t < maxTicks && ant.nav.status === 'moving'; t++) {
    sim.tick();
    if (ant.nav.status === 'moving' && ant.medium !== 'air' && ant.speed < 0.05 * bu) standing++;
  }
  return { status: ant.nav.status, ticks: t, standing };
}

function setup() {
  const sim = locoSim({ nest: 'small', workers: 1, seed: 3 });
  return { sim, bu: sim.world.bu, nest: playerNest(sim), ant: workers(sim)[0] };
}

/** Each chamber, 6 headings around the start spot, distances in BU. */
function nearGoals(distances: readonly number[], arrivals: readonly number[]): Walk[] {
  const { sim, bu, nest, ant } = setup();
  const out: Walk[] = [];
  for (const c of nest.chambers) for (const d of distances) for (let k = 0; k < 6; k++) for (const arrive of arrivals) {
    placeInChamber(sim, [ant], nest, c, 7 + k);
    const a = (k / 6) * 2 * Math.PI;
    const goal = floorBelow(sim, { x: ant.pos.x + Math.cos(a) * d * bu, y: ant.pos.y, z: ant.pos.z + Math.sin(a) * d * bu });
    if (goal) out.push(walk(sim, ant, goal, arrive));
  }
  return out;
}

function summary(ws: Walk[]) {
  return {
    n: ws.length, notArrived: ws.filter((w) => w.status !== 'arrived').length,
    maxTicks: Math.max(...ws.map((w) => w.ticks)), standing: ws.reduce((s, w) => s + w.standing, 0),
    maxStanding: Math.max(...ws.map((w) => w.standing)),
  };
}

describe('nest point goals (sim-fix-ants 1)', () => {
  it('goals 0.4-2 BU away are reached in under 2 s without standing', () => {
    const s = summary(nearGoals([0.4, 1, 1.5, 2], [0.5, 0.8]));
    expect(s.n).toBeGreaterThan(100);
    expect(s.notArrived, JSON.stringify(s)).toBe(0);
    expect(s.maxTicks, JSON.stringify(s)).toBeLessThanOrEqual(20);
    expect(s.standing, JSON.stringify(s)).toBeLessThanOrEqual(0.02 * s.n * 10);
    expect(s.maxStanding, JSON.stringify(s)).toBeLessThanOrEqual(5);
  });

  it('moves smaller than one nest voxel (0.5 BU) arrive', () => {
    const s = summary(nearGoals([0.2, 0.3, 0.45], [0.2, 0.5]));
    expect(s.notArrived, JSON.stringify(s)).toBe(0);
    expect(s.maxTicks, JSON.stringify(s)).toBeLessThanOrEqual(12);
    expect(s.maxStanding, JSON.stringify(s)).toBeLessThanOrEqual(5);
  });

  it('upside down on a chamber ceiling with the goal below: lets go, lands and arrives', () => {
    const { sim, bu, nest, ant } = setup();
    const ws: Walk[] = [];
    for (const c of nest.chambers) for (let k = 0; k < 6; k++) {
      const a = (k / 6) * 2 * Math.PI, rr = (k % 3) * 0.25 * c.radii.x;
      const p = { x: c.center.x + Math.cos(a) * rr, y: c.center.y, z: c.center.z + Math.sin(a) * rr };
      expect(placeOnSurface(sim, ant, p, { x: 0, y: 1, z: 0 })).toBe(true);
      expect(ant.up.y).toBeLessThan(-0.5);
      ant.nestId = nest.id;
      const goal = floorBelow(sim, { x: p.x + bu, y: p.y, z: p.z });
      if (goal) ws.push(walk(sim, ant, goal, 0.8));
    }
    const s = summary(ws);
    expect(s.n).toBe(18);
    expect(s.notArrived, JSON.stringify(s)).toBe(0);
    expect(s.maxTicks, JSON.stringify(s)).toBeLessThanOrEqual(20);
    expect(s.maxStanding, JSON.stringify(s)).toBeLessThanOrEqual(5);
    expect(locoStats(sim).drops).toBeGreaterThan(0);
  });

  it('upside down in a tunnel with the goal on the tunnel floor below', () => {
    const { sim, bu, nest, ant } = setup();
    // a tunnel ceiling spot: open space outside every chamber, an overhang above, the floor within 2.5 BU below
    let found = false;
    const o = nest.origin;
    for (let i = 0; i < 4000 && !found; i++) {
      const p = { x: o.x + ((i % 20) - 4) * bu, y: o.y - (2 + ((i / 20) | 0) % 20) * bu, z: o.z + (((i / 400) | 0) - 2) * 2 * bu };
      if (sim.field.sample(p) <= 0.3 * bu || chamberAt(nest, p) >= 0) continue;
      if (!placeOnSurface(sim, ant, p, { x: 0, y: 1, z: 0 }) || ant.up.y > -0.8) continue;
      const below = floorBelow(sim, ant.pos);
      found = below !== null && ant.pos.y - below.y < 2.5 * bu && chamberAt(nest, ant.pos) < 0;
    }
    expect(found).toBe(true);
    ant.nestId = nest.id;
    const goal = floorBelow(sim, { x: ant.pos.x, y: ant.pos.y - 0.3 * bu, z: ant.pos.z });
    expect(goal).not.toBeNull();
    const w = walk(sim, ant, goal!, 0.8);
    expect(w.status).toBe('arrived');
    expect(w.ticks).toBeLessThanOrEqual(30);
    expect(w.standing).toBeLessThanOrEqual(5);
  });
});
