// Criterion 8 and GDD 01 §4: the possessed ant from PlayerIntent: climbing a wall, going over an edge without
// flipping the heading (App. E 15), hurry 1.6 x cruise, the temperature floor (App. E 25), grip, the map limit
// (GDD 04 App. E 20) and the per-frame predictor.
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/core/math/vec3';
import type { Ant, PlayerIntent, Primitive, Sim } from '@/sim/types';
import { AntFlag, PrimFlag } from '@/sim/types';
import { integratePossessed, locoStats, placeOnSurface, possessedPose } from './index';
import { locoSim, v3 } from './testkit';

const ROT = { x: 0, y: 0, z: 0, w: 1 };
const BU = 4;

function block(id: number, x: number, z: number, halfX: number, height: number, halfZ: number): Primitive {
  return {
    id, shape: 'box', pos: { x: x * BU, y: (height / 2 - 1) * BU, z: z * BU }, rot: { ...ROT },
    size: { x: halfX * BU, y: (height / 2) * BU, z: halfZ * BU }, round: 0.3 * BU, material: 'plaster',
    flags: PrimFlag.CLIMBABLE, objectId: -1,
  };
}

function possess(sim: Sim, pos: Vec3, fwd: Vec3, tb = 25): Ant {
  const ant = sim.state.ants[0];
  sim.enqueue({ type: 'cheat.teleport', antId: ant.id, pos });
  sim.tick();
  ant.fwd = { ...fwd };
  ant.tb = tb;
  ant.flags |= AntFlag.POSSESSED;
  sim.state.player.possessedAntId = ant.id;
  return ant;
}

function intent(dir: Vec3, hurry = false, grip = false): PlayerIntent {
  return { dir, hurry, grip, held: [], flight: null };
}

function walk(sim: Sim, ticks: number, each?: () => void): void {
  for (let i = 0; i < ticks; i++) { sim.tick(); each?.(); }
}

describe('possessed ant movement', () => {
  it('criterion 8a: walking into a wall climbs it', () => {
    const sim = locoSim({ sizeBu: 128, prims: [block(1, 70, 64, 2, 30, 20)] });
    const ant = possess(sim, v3(60 * BU, 0, 64 * BU), v3(1, 0, 0));
    sim.setPlayerIntent(intent(v3(1, 0, 0)));
    walk(sim, 50);
    expect(ant.pos.y).toBeGreaterThan(8 * BU);
    expect(ant.up.x).toBeLessThan(-0.9); // on the wall face looking at -x
    expect(ant.fwd.y).toBeGreaterThan(0.9); // heading straight up
    expect(Math.abs(ant.pos.z - 64 * BU)).toBeLessThan(BU);
  });

  it('criterion 8b / GDD 01 E15: walking off a table-top edge continues down the side without flipping the heading', () => {
    const sim = locoSim({ sizeBu: 128, prims: [block(1, 90, 64, 10, 20, 15)] });
    const topY = 19 * BU;
    const ant = possess(sim, v3(94 * BU, topY + BU, 64 * BU), v3(1, 0, 0));
    expect(ant.up.y).toBeGreaterThan(0.99);
    sim.setPlayerIntent(intent(v3(1, 0, 0)));
    let path = 0, prev = { ...ant.pos }, reversals = 0;
    const along: number[] = [];
    walk(sim, 40, () => {
      const d = Math.hypot(ant.pos.x - prev.x, ant.pos.y - prev.y, ant.pos.z - prev.z);
      path += d;
      along.push(path);
      if (ant.fwd.x < -0.3) reversals++; // turned back toward the top
      prev = { ...ant.pos };
    });
    for (let i = 1; i < along.length; i++) expect(along[i]).toBeGreaterThan(along[i - 1]); // moves every tick
    expect(reversals).toBe(0);
    expect(ant.up.x).toBeGreaterThan(0.9); // on the side face
    expect(ant.fwd.y).toBeLessThan(-0.9); // heading down it
    expect(ant.pos.y).toBeLessThan(topY - 4 * BU);
  });

  it('criterion 8c: hurry speed is 1.6 x cruise (Lasius 9.6 vs 6 BU/s)', () => {
    const sim = locoSim({ sizeBu: 256 });
    const ant = possess(sim, v3(100 * BU, 0, 128 * BU), v3(1, 0, 0));
    sim.setPlayerIntent(intent(v3(1, 0, 0)));
    walk(sim, 10);
    const cruise = ant.speed;
    sim.setPlayerIntent(intent(v3(1, 0, 0), true));
    walk(sim, 10);
    const hurry = ant.speed;
    expect(cruise / BU).toBeCloseTo(6, 1);
    expect(hurry / cruise).toBeCloseTo(1.6, 2);
    sim.setPlayerIntent(intent(v3(1, 0, 0), false, true));
    walk(sim, 10);
    expect(ant.speed / cruise).toBeCloseTo(0.4, 2); // grip
  });

  it('GDD 01 E25: at tempFactor 0.4 (12.5 C) on naturalist the player floor gives 30 +- 2 BU in 10 game s', () => {
    const sim = locoSim({ sizeBu: 256 });
    expect(sim.state.config.difficulty.params.playerTempFloor).toBe(0.5);
    const ant = possess(sim, v3(100 * BU, 0, 128 * BU), v3(1, 0, 0), 12.5);
    sim.setPlayerIntent(intent(v3(1, 0, 0)));
    const x0 = ant.pos.x;
    walk(sim, 100);
    expect((ant.pos.x - x0) / BU).toBeGreaterThan(28);
    expect((ant.pos.x - x0) / BU).toBeLessThan(32);
  });

  it('turns at TURN_RATE and pivots on the spot beyond PIVOT_ANGLE', () => {
    const sim = locoSim({ sizeBu: 256 });
    const ant = possess(sim, v3(100 * BU, 0, 128 * BU), v3(1, 0, 0));
    sim.setPlayerIntent(intent(v3(-1, 0, 0.0001))); // straight behind: pivot
    sim.tick();
    expect(ant.speed).toBe(0);
    walk(sim, 7); // 300 deg/s: 180 deg in 0.6 s
    expect(ant.fwd.x).toBeLessThan(-0.9);
    walk(sim, 2);
    expect(ant.speed).toBeGreaterThan(0);
  });

  it('GDD 04 E20: a possessed worker teleported outside the map is back inside [8 BU, side - 8 BU] after one tick', () => {
    const sim = locoSim({ sizeBu: 256 });
    const ant = possess(sim, v3(-50 * BU, 0, 128 * BU), v3(1, 0, 0));
    expect(ant.pos.x).toBeGreaterThanOrEqual(8 * BU - 1e-6);
    sim.setPlayerIntent(intent(v3(-1, 0, 0))); // pushing outward slides along the limit
    walk(sim, 30);
    expect(ant.pos.x).toBeGreaterThanOrEqual(8 * BU - 1e-6);
  });

  it('per-frame prediction runs ahead of the tick with the same step and never changes sim state', () => {
    const sim = locoSim({ sizeBu: 256 });
    const ant = possess(sim, v3(100 * BU, 0, 128 * BU), v3(1, 0, 0));
    sim.setPlayerIntent(intent(v3(1, 0, 0.5)));
    walk(sim, 5);
    const before = JSON.stringify(ant);
    let maxErr = 0;
    for (let tick = 0; tick < 20; tick++) {
      for (let f = 0; f < 6; f++) {
        integratePossessed(sim, ant, 1 / 60);
        expect(JSON.stringify(ant)).toBe(tick === 0 ? before : JSON.stringify(ant));
      }
      const pose = possessedPose(sim)!;
      const ahead = Math.hypot(pose.pos.x - ant.pos.x, pose.pos.z - ant.pos.z);
      sim.tick();
      // the prediction 0.1 s ahead lands where the tick put the ant
      const err = Math.hypot(pose.pos.x - ant.pos.x, pose.pos.z - ant.pos.z);
      if (tick > 0) maxErr = Math.max(maxErr, err);
      expect(ahead).toBeGreaterThan(0);
    }
    expect(maxErr).toBeLessThan(0.15 * BU);
  });

  it('per-frame prediction of an ant without locomotion scratch does not create it (no state write)', () => {
    const sim = locoSim({ sizeBu: 256 });
    const ant = possess(sim, v3(100 * BU, 0, 128 * BU), v3(1, 0, 0));
    delete ant.nav.loco; // as after a possession before the first locomotion tick
    sim.setPlayerIntent(intent(v3(1, 0, 0)));
    const before = JSON.stringify(ant);
    for (let f = 0; f < 6; f++) integratePossessed(sim, ant, 1 / 60);
    expect(ant.nav.loco).toBeUndefined();
    expect(JSON.stringify(ant)).toBe(before);
    expect(possessedPose(sim)).not.toBeNull();
  });

  it('edge latch: a desired direction that would point back up after an edge is frozen in the ant frame', () => {
    const sim = locoSim({ sizeBu: 128, prims: [block(1, 90, 64, 10, 30, 15)] });
    const topY = 29 * BU;
    const ant = possess(sim, v3(96 * BU, topY + BU, 64 * BU), v3(1, 0, 0));
    // a camera looking forward and a little up: on the side face the tangent part of this points UP the wall
    const d = { x: 0.96, y: 0.28, z: 0 };
    sim.setPlayerIntent(intent(d));
    let latched = false, flipped = false, onSideTicks = 0;
    walk(sim, 40, () => {
      if (ant.nav.loco?.latch) latched = true;
      if (ant.up.x > 0.9) { onSideTicks++; if (onSideTicks <= 10 && ant.fwd.y > 0.3) flipped = true; }
    });
    expect(latched).toBe(true);
    expect(onSideTicks).toBeGreaterThan(5);
    expect(flipped).toBe(false); // for the first second on the side it keeps walking down
  });

  it('grip and slope limits (GDD 04 §3): a glass underside cannot be held, a plaster one can', () => {
    for (const material of ['glass', 'plaster'] as const) {
      const slab: Primitive = { ...block(1, 64, 90, 15, 2, 15), material };
      slab.pos = { x: 90 * BU, y: 20 * BU, z: 90 * BU };
      const sim = locoSim({ sizeBu: 160, prims: [slab] });
      const ant = sim.state.ants[0];
      sim.tick();
      expect(placeOnSurface(sim, ant, v3(90 * BU, 15 * BU, 90 * BU), v3(0, 1, 0))).toBe(true);
      expect(ant.up.y).toBeLessThan(-0.9);
      walk(sim, 10);
      if (material === 'glass') { expect(locoStats(sim).slips).toBeGreaterThan(0); expect(ant.up.y).toBeGreaterThan(0.9); }
      else { expect(locoStats(sim).slips).toBe(0); expect(ant.up.y).toBeLessThan(-0.9); }
    }
  });
});
