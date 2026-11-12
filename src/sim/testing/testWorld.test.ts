// makeTestWorld / makeTestSim on the real kernel: standard features, the small nest, workers inside it, and a
// walk from the deepest chamber to the surface with kernel nest-nav + walker only (F-int acceptance 3).
import { describe, expect, it } from 'vitest';
import type { Ant, Sim } from '@/sim/types';
import { nestFieldId } from '@/sim/types';
import { walkerSnapshot, walkerStep } from '@/sim/locomotion/walker';
import { makeTestSim, makeTestWorld } from './testWorld';

const DT = 0.1;
/** Cruise speed of the test walk, BU/s (seed §3: ~12 BU/s). */
const CRUISE_BU = 12;

function onLevelSet(sim: Sim, a: Ant): number {
  return Math.abs(sim.field.sample(a.pos) - a.footOffset);
}

describe('makeTestWorld', () => {
  it('builds the standard features with unique ids, a climb route and a world object', () => {
    const w = makeTestWorld({ features: 'all', prims: 2 });
    const ids = w.prims.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(w.prims.length).toBe(2 + 5); // wall, leg, top, stone, stem
    expect(w.climbRoutes).toHaveLength(1);
    const obj = w.objects[0];
    expect(obj.routeIds).toEqual([w.climbRoutes[0].id]);
    expect(w.prims[obj.primStart].objectId).toBe(obj.id);
    for (let i = 1; i < w.climbRoutes[0].points.length; i++) {
      const a = w.climbRoutes[0].points[i - 1], b = w.climbRoutes[0].points[i];
      expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeLessThanOrEqual(8 * w.bu);
    }
  });

  it('climb route points lie near the table surface (within 1 BU of f = 0)', () => {
    const sim = makeTestSim({ features: ['table'] });
    for (const p of sim.world.climbRoutes[0].points) expect(Math.abs(sim.field.sample(p))).toBeLessThan(sim.world.bu);
  });
});

describe('makeTestSim small nest', () => {
  const sim = makeTestSim({ nest: 'small', workers: 20 });
  const bu = sim.world.bu;
  const nest = sim.state.nests[0];
  const exit = { kind: 'exit' as const, id: -1 };

  it('registers the nest with one open entrance and three chambers', () => {
    expect(sim.state.colonies[0].nestIds).toEqual([nest.id]);
    expect(nest.entrances.map((e) => e.status)).toEqual(['open']);
    expect(nest.chambers.map((c) => c.type)).toEqual(['food', 'nursery', 'royal']);
    expect(sim.state.worldDelta.carve.keys.length).toBeGreaterThan(0);
    expect(sim.kernel.nav.hasTarget(nestFieldId(nest.id, exit))).toBe(true);
  });

  it('places 20 workers inside the nest on valid surfaces', () => {
    const workers = sim.state.ants.filter((a) => a.caste === 'worker');
    expect(workers).toHaveLength(20);
    for (const a of workers) {
      expect(onLevelSet(sim, a)).toBeLessThan(0.02 * bu);
      expect(sim.field.isUnderground(a.pos)).toBe(true);
      expect(a.up.y).toBeGreaterThan(0.7); // standing on a chamber floor
      expect(a.nestId).toBe(nest.id);
      expect(nest.chambers.some((c) => c.id === a.chamberId)).toBe(true);
      expect(sim.nestNav.distance(nest.id, exit, a.pos)).toBeGreaterThan(0);
    }
  });

  it('every chamber reaches the exit (GDD 03 N1)', () => {
    for (const c of nest.chambers) {
      expect(sim.nestNav.distance(nest.id, { kind: 'chamber', id: c.id }, c.center)).toBe(0);
    }
    const royal = nest.chambers[2];
    const floor = { x: royal.center.x, y: royal.center.y - royal.radii.y + 0.3 * bu, z: royal.center.z };
    expect(sim.nestNav.distance(nest.id, exit, floor)).toBeLessThan(80 * bu);
  });

  // Controller: phase 1 descends the exit field to the opening; phase 2 (latched once reached, so the walker cannot
  // flip back to the field at the rim and oscillate between surface and cavity) walks up and away from the hole.
  function walkOut(ant: Ant): { ticks: number; startDist: number; minClear: number } {
    const field = nestFieldId(nest.id, exit);
    const target = { x: 0, y: 0, z: 0 }, want = { x: 0, y: 0, z: 0 };
    const ent = nest.entrances[0];
    let ticks = 0, minClear = Infinity, atOpening = false;
    const startDist = sim.kernel.nav.distanceAt(field, ant.pos);
    for (; ticks < 1500; ticks++) {
      const out = !sim.field.isInSubstrate(ant.pos.x, ant.pos.y, ant.pos.z);
      if (out && Math.hypot(ant.pos.x - ent.pos.x, ant.pos.z - ent.pos.z) > ent.radius + bu) break;
      const d = atOpening ? 0 : sim.kernel.nav.lookahead(field, ant.pos, 4, target);
      if (d > 0.5 * bu && Number.isFinite(d)) {
        want.x = target.x - ant.pos.x; want.y = target.y - ant.pos.y; want.z = target.z - ant.pos.z;
      } else {
        atOpening = true;
        const ax = ant.pos.x - ent.pos.x, az = ant.pos.z - ent.pos.z, al = Math.hypot(ax, az);
        // away from the hole's axis (or along +z when standing on it), plus a lift out of the throat
        want.x = al > 1e-6 ? ax / al : 0; want.z = al > 1e-6 ? az / al : 1;
        want.y = sim.field.isInSubstrate(ant.pos.x, ant.pos.y, ant.pos.z) ? 1 : 0;
      }
      walkerSnapshot(ant);
      walkerStep(sim.field, ant, want, CRUISE_BU * bu, DT, sim.kernel.walker);
      minClear = Math.min(minClear, sim.field.sample(ant.pos) / ant.footOffset);
    }
    return { ticks, startDist, minClear };
  }

  it('every worker walks from its chamber out to the surface with kernel nest-nav + walker only', () => {
    const workers = sim.state.ants.filter((a) => a.caste === 'worker');
    expect(workers.length).toBe(20);
    for (const ant of workers) {
      const { ticks, startDist, minClear } = walkOut(ant);
      expect(Number.isFinite(startDist), `ant ${ant.id} start`).toBe(true);
      // path length / cruise speed is about 3-4 s; allow generous slack for wall corners but not a random walk
      expect(ticks, `ant ${ant.id} ticks`).toBeLessThan(10 * Math.ceil(startDist / (CRUISE_BU * bu) + 6));
      expect(minClear, `ant ${ant.id} clearance`).toBeGreaterThan(0.3);
      expect(ant.medium, `ant ${ant.id} medium`).toBe('surface');
      expect(sim.field.isInSubstrate(ant.pos.x, ant.pos.y, ant.pos.z)).toBe(false);
      expect(ant.pos.y).toBeGreaterThan(sim.field.height(ant.pos.x, ant.pos.z) - 0.5 * bu);
    }
  });
});
