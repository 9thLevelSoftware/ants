// Criterion 3: a target behind a tall wall is reached through a gap the nav grid finds; a table-top point of
// interest is reached and left along its climb route. Also avoid markers in planning (GDD 02 §12.2).
import { describe, expect, it } from 'vitest';
import type { Primitive } from '@/sim/types';
import { PrimFlag } from '@/sim/types';
import { isLocoNavGrid } from './grid/navGridImpl';
import { navTo, navToPoi } from './index';
import { makeTestWorld } from '@/sim/testing/testWorld';
import { locoSim, runUntilDone, v3 } from './testkit';

const ROT = { x: 0, y: 0, z: 0, w: 1 };

/** Two tall boxes along x = cx with a gap centred at gapZ (all BU), 60 BU high (> NAV_OVER_MAX 40 BU). */
function wallWithGap(bu: number, cx: number, z0: number, gapZ: number, gapHalf: number, z1: number): Primitive[] {
  const h = 30 * bu, a0 = z0 * bu, a1 = (gapZ - gapHalf) * bu, b0 = (gapZ + gapHalf) * bu, b1 = z1 * bu;
  const box = (id: number, za: number, zb: number): Primitive => ({
    id, shape: 'box', pos: { x: cx * bu, y: h - bu, z: (za + zb) / 2 }, rot: { ...ROT }, size: { x: 1.5 * bu, y: h, z: (zb - za) / 2 },
    round: 0.25 * bu, material: 'concrete', flags: PrimFlag.CLIMBABLE, objectId: -1,
  });
  return [box(1, a0, a1), box(2, b0, b1)];
}

describe('nav grid planning on the surface', () => {
  it('criterion 3a: reaches a target behind a tall wall through the gap instead of climbing it', () => {
    const bu = 4;
    const sim = locoSim({ sizeBu: 400, prims: wallWithGap(bu, 200, 60, 280, 16, 360) });
    const ant = sim.state.ants[0];
    const grid = sim.navGrid;
    // the wall blocks its cells, the gap stays open
    sim.tick();
    expect(isLocoNavGrid(grid)).toBe(true);
    expect(grid.blocked(200 * bu, 150 * bu)).toBe(true);
    expect(grid.blocked(200 * bu, 280 * bu)).toBe(false);
    const start = v3(160 * bu, 0, 200 * bu), goal = v3(240 * bu, 0, 200 * bu);
    sim.enqueue({ type: 'cheat.teleport', antId: ant.id, pos: start });
    sim.tick();
    expect(navTo(sim, ant, goal, 2 * bu, { speed: 6 * bu })).toBe(true);
    let maxY = -Infinity, crossZ = NaN, prevX = ant.pos.x;
    runUntilDone(sim, [ant], 3000, () => {
      maxY = Math.max(maxY, ant.pos.y);
      if (prevX < 200 * bu && ant.pos.x >= 200 * bu) crossZ = ant.pos.z / bu;
      prevX = ant.pos.x;
    });
    expect(ant.nav.status).toBe('arrived');
    expect(maxY).toBeLessThan(3 * bu); // never climbed the 60 BU wall
    expect(Math.abs(crossZ - 280)).toBeLessThan(16); // crossed x = 200 inside the gap
  });

  it('criterion 3b: a table-top point of interest is reached and left along the climb route', () => {
    const sim = locoSim({ sizeBu: 128, features: ['table'] });
    const bu = sim.world.bu;
    const route = sim.world.climbRoutes[0];
    const top = route.points[route.points.length - 1];
    sim.world.pois.push({ id: 9001, kind: 'food-spot', pos: { ...top }, objectId: route.objectId });
    const ant = sim.state.ants[0];
    const start = v3(top.x + 30 * bu, 0, top.z + 6 * bu);
    sim.enqueue({ type: 'cheat.teleport', antId: ant.id, pos: start });
    sim.tick();
    expect(navToPoi(sim, ant, 9001, bu, { speed: 6 * bu })).toBe(true);
    const modes = new Set<string>();
    let minNode = Infinity;
    runUntilDone(sim, [ant], 2000, () => {
      modes.add(ant.nav.mode);
      if (ant.nav.mode === 'climb') minNode = Math.min(minNode, ant.nav.pathIdx);
    });
    expect(ant.nav.status).toBe('arrived');
    expect(modes.has('climb')).toBe(true);
    expect(ant.pos.y).toBeGreaterThan(top.y - bu);
    // leave: back to the ground on the far side, down the route
    const away = v3(top.x - 30 * bu, 0, top.z - 10 * bu);
    expect(navTo(sim, ant, away, 2 * bu, { speed: 6 * bu })).toBe(true);
    const down: number[] = [];
    let onLeg = false;
    runUntilDone(sim, [ant], 2000, () => {
      if (ant.nav.mode === 'climb') down.push(ant.nav.pathIdx);
      // walking down the leg: close to the leg's axis and between ground and table top
      if (Math.hypot(ant.pos.x - (route.points[0].x + bu), ant.pos.z - route.points[0].z) < 2.5 * bu && ant.pos.y > 3 * bu && ant.pos.y < top.y - 3 * bu) onLeg = true;
    });
    expect(ant.nav.status).toBe('arrived');
    expect(down.length).toBeGreaterThan(0);
    expect(down[down.length - 1]).toBeLessThan(down[0]); // node index decreased: walked down the route
    expect(onLeg).toBe(true);
    expect(ant.pos.y).toBeLessThan(bu);
  });

  it('avoid markers: autonomous ants plan around them (GDD 02 §12.2, App. E 20 at the planner level)', () => {
    const sim = locoSim({ sizeBu: 400 });
    const bu = sim.world.bu;
    const ant = sim.state.ants[0];
    const c = sim.world.size / 2;
    sim.state.markers.push({
      id: 7777, alive: true, kind: 'avoid', pos: v3(c, 0, c), radius: 30 * bu, colony: ant.colony, targetChamberId: -1,
      sourceChamberId: -1, expiresTick: -1, params: { mode: null, priority: null, chamberType: null, planId: -1 }, placedTick: 0,
    });
    sim.stores.markers.rebuild();
    sim.enqueue({ type: 'cheat.teleport', antId: ant.id, pos: v3(c - 80 * bu, 0, c) });
    sim.tick();
    expect(navTo(sim, ant, v3(c + 80 * bu, 0, c), 2 * bu, { speed: 6 * bu })).toBe(true);
    let minD = Infinity;
    runUntilDone(sim, [ant], 3000, () => { minD = Math.min(minD, Math.hypot(ant.pos.x - c, ant.pos.z - c)); });
    expect(ant.nav.status).toBe('arrived');
    expect(minD).toBeGreaterThan(28 * bu);
  });

  it('GDD 04 §11: a walker crosses a full-width wall through a door crack (micro-portal edge), there and back', () => {
    const bu = 4;
    // a 60 BU tall door across the map, its foot 1.5 BU above the ground: the crack under it is the only way (the
    // walker is the founding queen, 2.1 BU long: she needs 0.45 x 2.1 = 0.96 BU of clearance)
    const door: Primitive = {
      id: 1, shape: 'box', pos: { x: 160 * bu, y: 31.5 * bu, z: 160 * bu }, rot: { ...ROT },
      size: { x: 1.5 * bu, y: 30 * bu, z: 170 * bu }, round: 0, material: 'wood-sound', flags: PrimFlag.CLIMBABLE, objectId: -1,
    };
    const world = makeTestWorld({ sizeBu: 320, prims: [door] });
    world.micro.push({
      id: 1, kind: 'door-crack', posA: v3(157 * bu, 0, 150 * bu), posB: v3(163 * bu, 0, 150 * bu), gapMm: 1.5 * bu,
      minClearanceBu: 1.2, lengthBu: 6, useful: true, reason: 'test',
    });
    const sim = locoSim({ world });
    const ant = sim.state.ants[0];
    expect(ant.caste).toBe('queen');
    sim.enqueue({ type: 'cheat.teleport', antId: ant.id, pos: v3(110 * bu, 0, 180 * bu) });
    sim.tick();
    for (const goalX of [210, 110]) {
      expect(navTo(sim, ant, v3(goalX * bu, 0, 180 * bu), 2 * bu, { speed: 6 * bu })).toBe(true);
      let maxY = -Infinity, crossZ = NaN, prevX = ant.pos.x;
      runUntilDone(sim, [ant], 3000, () => {
        maxY = Math.max(maxY, ant.pos.y);
        if ((prevX - 160 * bu) * (ant.pos.x - 160 * bu) <= 0 && prevX !== ant.pos.x) crossZ = ant.pos.z / bu;
        prevX = ant.pos.x;
      });
      expect(ant.nav.status).toBe('arrived');
      expect(maxY).toBeLessThan(2 * bu); // under the door, not over it
      expect(Math.abs(crossZ - 150)).toBeLessThan(4);
    }
    // a closed crack (weather strip) leaves no route
    sim.state.worldDelta.microState.push({ id: 1, discovered: false, discoveredTick: -1, open: false });
    sim.tick();
    navTo(sim, ant, v3(210 * bu, 0, 180 * bu), 2 * bu, { speed: 6 * bu });
    runUntilDone(sim, [ant], 50);
    expect(ant.nav.status).toBe('failed');
    expect(ant.pos.x).toBeLessThan(160 * bu);
  });
});
