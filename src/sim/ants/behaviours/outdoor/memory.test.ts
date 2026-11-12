// Route memory (GDD 02 §9.3), depleted-source memory and source choice (§5.5) at unit level.

import { describe, expect, it } from 'vitest';
import type { Ant, Sim } from '@/sim/types';
import { ROUTE_FIX_VISITS } from '@/sim/balance/foraging';
import { makeTestSim } from '@/sim/testing';
import { chooseSource, isDepletedFor, markDepleted, sourceScore } from './choice';
import { K } from './keys';
import { commitRoute, learnedRoute, outboundWaypoints, pathLength, prepareRoute, routeFor } from './routes';
import { announce } from './testkit';

function setup(): { sim: Sim; ant: Ant } {
  const sim = makeTestSim({ sizeBu: 300, nest: 'small', workers: 3, systems: [] });
  const ant = sim.state.ants.find((a) => a.caste === 'worker')!;
  return { sim, ant };
}

/** Writes a crumb trail (entrance first) and puts the ant at its end. */
function crumbs(ant: Ant, pts: [number, number][]): void {
  const m = ant.mem;
  pts.forEach(([x, z], i) => { m.crumbs[3 * i] = x; m.crumbs[3 * i + 1] = 0; m.crumbs[3 * i + 2] = z; });
  m.crumbLen = pts.length - 1;
  m.crumbHead = m.crumbLen;
  const [x, z] = pts[pts.length - 1];
  ant.pos = { x, y: 0, z };
}

const straight = (n: number, step: number): [number, number][] => Array.from({ length: n }, (_, i) => [100 + i * step, 100] as [number, number]);

describe('route memory', () => {
  it('simplifies the outbound crumbs (Douglas-Peucker) into at most 32 waypoints', () => {
    const { sim, ant } = setup();
    crumbs(ant, straight(40, 24));
    const out = new Float32Array(96);
    expect(outboundWaypoints(sim, ant, out)).toBe(2);
    // a polyline with a corner every 10 crumbs (5 legs) and some jitter below the tolerance
    const zig: [number, number][] = Array.from({ length: 51 }, (_, i) => [100 + i * 20, 100 + (Math.floor(i / 10) % 2 === 0 ? (i % 10) : 10 - (i % 10)) * 20 + (i % 3)]);
    crumbs(ant, zig);
    const n = outboundWaypoints(sim, ant, out);
    expect(n).toBeLessThanOrEqual(32);
    expect(n).toBeGreaterThanOrEqual(5);
    expect(n).toBeLessThanOrEqual(8);
  });

  it('three matching round trips make a learned route; route-learned fires on the third', () => {
    const { sim, ant } = setup();
    const learned: number[] = [];
    const emit = sim.emit.bind(sim);
    sim.emit = (e) => { if (e.type === 'route-learned') learned.push(e.sourceId); emit(e); };
    for (let trip = 1; trip <= 3; trip++) {
      crumbs(ant, straight(20, 24));
      prepareRoute(sim, ant, 42);
      expect(ant.bb[K.pendVisits]).toBe(trip);
      commitRoute(sim, ant);
      expect(routeFor(ant, 42)!.visits).toBe(trip);
      expect(learned.length).toBe(trip >= ROUTE_FIX_VISITS ? 1 : 0);
    }
    expect(learnedRoute(ant, 42)).not.toBeNull();
  });

  it('a different path replaces the slot (visits 1) and the shorter of two matching paths is kept', () => {
    const { sim, ant } = setup();
    crumbs(ant, straight(20, 24));
    prepareRoute(sim, ant, 7); commitRoute(sim, ant);
    crumbs(ant, straight(20, 24)); prepareRoute(sim, ant, 7); commitRoute(sim, ant);
    expect(routeFor(ant, 7)!.visits).toBe(2);
    // a detour 200 mm to the side: no match
    crumbs(ant, [[100, 100], [300, 400], [556, 100]]);
    prepareRoute(sim, ant, 7); commitRoute(sim, ant);
    expect(routeFor(ant, 7)!.visits).toBe(1);
    const r = routeFor(ant, 7)!;
    expect(pathLength(r.wp, r.n)).toBeGreaterThan(456);
  });

  it('a source found empty is avoided for a day; twice in a row clears its route slot', () => {
    const { sim, ant } = setup();
    crumbs(ant, straight(10, 24));
    prepareRoute(sim, ant, 9); commitRoute(sim, ant);
    expect(markDepleted(sim, ant, 9)).toBe(false);
    expect(isDepletedFor(sim, ant, 9)).toBe(true);
    expect(routeFor(ant, 9)).not.toBeNull();
    expect(markDepleted(sim, ant, 9)).toBe(true);
    expect(routeFor(ant, 9)).toBeNull();
    sim.state.tick += 6001;
    expect(isDepletedFor(sim, ant, 9)).toBe(false);
  });
});

describe('source choice (GDD 02 §5.5)', () => {
  function twoSources(): { sim: Sim; ant: Ant; sugar: number; protein: number } {
    const { sim, ant } = setup();
    const col = sim.state.colonies[0];
    const e = sim.stores.nests.get(col.nestIds[0])!.entrances[0];
    const bu = sim.world.bu;
    const before = sim.state.sources.length;
    sim.enqueue({ type: 'cheat.spawnFood', kind: 'sugar', variant: 'sugar-granules', pos: { x: e.pos.x + 60 * bu, y: 0, z: e.pos.z }, units: 100, stage: null });
    sim.enqueue({ type: 'cheat.spawnFood', kind: 'crumb', variant: 'crumb-protein', pos: { x: e.pos.x - 60 * bu, y: 0, z: e.pos.z }, units: 15, stage: null });
    sim.applyPendingCommands();
    const [s, p] = sim.state.sources.slice(before);
    announce(sim, col, s);
    announce(sim, col, p);
    return { sim, ant, sugar: s.id, protein: p.id };
  }

  it('picks the protein source under a protein deficit and the sugar under a carbohydrate deficit', () => {
    const { sim, ant, sugar, protein } = twoSources();
    const col = sim.state.colonies[0];
    col.needs.needP = 1; col.needs.needC = 0; col.needs.sP = 0.5;
    expect(chooseSource(sim, ant)).toBe(protein);
    col.needs.needP = 0; col.needs.needC = 1;
    expect(chooseSource(sim, ant)).toBe(sugar);
  });

  it('scores a source inside an avoid marker 0 and a valid lead wins', () => {
    const { sim, ant, sugar, protein } = twoSources();
    const col = sim.state.colonies[0];
    const s = sim.stores.sources.get(sugar)!;
    expect(sourceScore(sim, ant, s)).toBeGreaterThan(0);
    sim.state.markers.push({
      id: sim.state.nextId++, alive: true, kind: 'avoid', pos: { ...s.pos }, radius: 20 * sim.world.bu, colony: col.id,
      targetChamberId: -1, sourceChamberId: -1, expiresTick: -1, params: { mode: null, priority: null, chamberType: null, planId: -1 },
      placedTick: 0,
    });
    sim.stores.markers.rebuild();
    expect(sourceScore(sim, ant, s)).toBe(0);
    const p = sim.stores.sources.get(protein)!;
    ant.mem.lead = { sourceId: p.id, pos: { ...p.pos }, tick: sim.state.tick };
    expect(chooseSource(sim, ant)).toBe(protein);
  });
});
