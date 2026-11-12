// Trips: nest -> surface -> nest with automatic legs (criterion 2), arrival spreading, entity targets.
import { describe, expect, it } from 'vitest';
import { nestFieldId } from '@/sim/types';
import { locoStats, navTo, navToTarget, placeOnSurface } from './index';
import { clearance, deepestChamber, locoSim, placeInChamber, playerNest, runUntilDone, workers } from './testkit';

const EXIT = { kind: 'exit', id: -1 } as const;

describe('trips with automatic legs', () => {
  it('criterion 2: 200 walkers go from the deepest chamber to a surface target 500 BU away and back', () => {
    const sim = locoSim({ nest: 'small', workers: 200, sizeBu: 1100, features: 'all', prims: 40, seed: 5 });
    const bu = sim.world.bu, speed = 6 * bu;
    const nest = playerNest(sim), deep = deepestChamber(nest), entrance = nest.entrances[0];
    const ants = workers(sim);
    expect(ants.length).toBe(200);
    placeInChamber(sim, ants, nest, deep);
    const target = { x: entrance.pos.x - 400 * bu, y: 0, z: entrance.pos.z - 300 * bu };
    target.y = sim.field.height(target.x, target.z);
    const surfaceLen = Math.hypot(target.x - entrance.pos.x, target.z - entrance.pos.z);
    expect(surfaceLen).toBeCloseTo(500 * bu, -1);
    const exitId = nestFieldId(nest.id, EXIT);
    const ideal = ants.map((a) => (sim.nestNav.distanceAt(exitId, a.pos) + surfaceLen) / speed);
    for (const a of ants) expect(navTo(sim, a, target, 3 * bu, { speed })).toBe(true);
    const t0 = sim.state.tick;
    const outTicks = new Map<number, number>();
    runUntilDone(sim, ants, 4000, () => {
      for (const a of ants) if (!outTicks.has(a.id) && a.nav.status !== 'moving') outTicks.set(a.id, sim.state.tick - t0);
    });
    const outOk = ants.filter((a, i) => a.nav.status === 'arrived' && (outTicks.get(a.id) ?? Infinity) / 10 <= 2 * ideal[i]);
    // back home to the deepest chamber (entering through the entrance, then its chamber field)
    const back = ants.map((a) => (Math.hypot(a.pos.x - entrance.pos.x, a.pos.z - entrance.pos.z) + 40 * bu) / speed);
    for (const a of ants) expect(navToTarget(sim, a, { kind: 'chamber', id: deep.id, pos: deep.center }, bu, { speed })).toBe(true);
    const t1 = sim.state.tick;
    const backTicks = new Map<number, number>();
    runUntilDone(sim, ants, 4000, () => {
      for (const a of ants) if (!backTicks.has(a.id) && a.nav.status !== 'moving') backTicks.set(a.id, sim.state.tick - t1);
    });
    const backOk = ants.filter((a, i) => a.nav.status === 'arrived' && (backTicks.get(a.id) ?? Infinity) / 10 <= 2 * back[i]);
    const stats = locoStats(sim);
    // eslint-disable-next-line no-console
    console.log(`LOCO_TRIP out ${outOk.length}/200 back ${backOk.length}/200, ideal out ${(ideal.reduce((x, y) => x + y) / 200).toFixed(1)} s`,
      `max out ${Math.max(...outTicks.values()) / 10} s, max back ${Math.max(...backTicks.values()) / 10} s`, JSON.stringify(stats));
    expect(outOk.length).toBeGreaterThanOrEqual(198);
    expect(backOk.length).toBeGreaterThanOrEqual(198);
    for (const a of ants) {
      expect(clearance(sim, a)).toBeGreaterThanOrEqual(0.3);
      expect(a.nestId).toBe(nest.id);
    }
  }, 120_000);

  it('spreads arrival points around a shared surface goal', () => {
    const sim = locoSim({ nest: 'small', workers: 30, sizeBu: 256 });
    const bu = sim.world.bu;
    const ants = workers(sim);
    const c = sim.world.size / 2;
    const target = { x: c - 50 * bu, y: 0, z: c };
    for (const a of ants) navTo(sim, a, target, 4 * bu, { speed: 6 * bu });
    runUntilDone(sim, ants, 2000);
    expect(ants.every((a) => a.nav.status === 'arrived')).toBe(true);
    // not all piled on one spot: mean pairwise distance well above zero
    let sum = 0, n = 0;
    for (let i = 0; i < ants.length; i++) for (let j = i + 1; j < ants.length; j++) { sum += Math.hypot(ants[i].pos.x - ants[j].pos.x, ants[i].pos.z - ants[j].pos.z); n++; }
    expect(sum / n).toBeGreaterThan(1 * bu);
  });

  it('follows a moving entity target and fails when it disappears', () => {
    const sim = locoSim({ sizeBu: 256, nest: 'small', workers: 2 });
    const bu = sim.world.bu;
    const [a, b] = workers(sim);
    // b walks away on the surface; a follows it
    const c = sim.world.size / 2;
    expect(navTo(sim, b, { x: c - 60 * bu, y: 0, z: c + 30 * bu }, bu, { speed: 3 * bu })).toBe(true);
    expect(navToTarget(sim, a, { kind: 'ant', id: b.id, pos: { ...b.pos } }, 2 * bu, { speed: 7 * bu })).toBe(true);
    runUntilDone(sim, [a], 3000);
    expect(a.nav.status).toBe('arrived');
    expect(Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y, a.pos.z - b.pos.z)).toBeLessThan(4 * bu);
    expect(navToTarget(sim, a, { kind: 'item', id: 999999, pos: { ...a.pos } }, bu)).toBe(false);
    expect(a.nav.status).toBe('failed');
  });

  it('leaves a natural cavity (no nest) by its opening, even when the goal lies the other way', () => {
    const sim = locoSim({ sizeBu: 300 });
    const bu = sim.world.bu, c = sim.world.size / 2, y = -8 * bu;
    // a closed cavity 8 BU below ground, a channel east to a shaft that rises to the surface 10 BU east
    sim.kernel.carveSphere({ x: c, y, z: c }, 4 * bu, { force: true });
    for (let t = 0; t <= 1; t += 0.02) sim.kernel.carveSphere({ x: c + (3 + 7 * t) * bu, y: y + 0.5 * bu, z: c }, 1.2 * bu, { force: true });
    for (let t = 0; t <= 1; t += 0.02) sim.kernel.carveSphere({ x: c + 10 * bu, y: y + (0.5 + 8 * t) * bu, z: c }, 1.2 * bu, { force: true });
    sim.world.cavities.push({
      id: 1, kind: 'root-gallery', min: { x: c - 4 * bu, y: y - 4 * bu, z: c - 4 * bu }, max: { x: c + 12 * bu, y: 1 * bu, z: c + 4 * bu },
      openings: [{ pos: { x: c + 10 * bu, y: 0, z: c }, normal: { x: 0, y: 1, z: 0 }, radius: 1.2 * bu }],
    });
    sim.tick();
    const ant = sim.state.ants[0];
    expect(placeOnSurface(sim, ant, { x: c - 1 * bu, y, z: c }, { x: 0, y: -1, z: 0 })).toBe(true);
    sim.tick();
    expect(ant.medium).toBe('cavity');
    expect(navTo(sim, ant, { x: c - 40 * bu, y: 0, z: c }, 2 * bu, { speed: 6 * bu })).toBe(true);
    let maxX = -Infinity;
    runUntilDone(sim, [ant], 3000, () => { maxX = Math.max(maxX, ant.pos.x); });
    expect(ant.nav.status).toBe('arrived');
    expect((maxX - c) / bu).toBeGreaterThan(8); // out through the opening in the east
  });
});
