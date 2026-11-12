// Test kit: a scripted walk of the founding queen from the surface down the small test nest's shaft and tunnels to
// its deepest chamber and back out (testNest.ts), on the REAL kernel field and surface walker. Each frame hands the
// queen's pose to a callback, so camera tests can run any rig over a path that has the real nest geometry (the
// queen-sized 1 BU radius shaft that made the Stage 1A tunnel shot unusable).
import { makeTestSim } from '@/sim/testing';
import { spawnAnt } from '@/sim/entities';
import { walkerLetGo, walkerPlace, walkerStep } from '@/sim/locomotion/walker';
import type { Ant, Nest, Sim } from '@/sim/types';
import type { Vec3 } from '@/core';

/** An up vector below this (world y) counts as hanging from a ceiling. */
const CEILING_UP_Y = -0.6;

export interface WalkFrame {
  /** Frame index and phase of the walk. */
  i: number;
  phase: 'surface-in' | 'down' | 'up' | 'surface-out';
  ant: Ant;
  /** fSubstrate(ant) < 0. */
  underground: boolean;
}

export interface NestWalkOptions {
  /** Frame step, real s (default 1/30). */
  dt?: number;
  /** Walk speed, BU/s (default 4). */
  speedBu?: number;
  /** Safety cap on frames per leg (default 3000). */
  maxFramesPerLeg?: number;
  /** Who walks: the founding queen (default; 2.1 BU in a 2 BU tunnel) or a fresh worker (1 BU). */
  caste?: 'queen' | 'worker';
}

export interface NestWalk {
  sim: Sim;
  nest: Nest;
  /** The walker (the queen, or the worker with caste 'worker'). */
  queen: Ant;
  /** Deepest chamber of the nest (the walk's turning point). */
  deepestChamberId: number;
  run(onFrame: (f: WalkFrame) => void): { frames: number; reachedDeepest: boolean; backOut: boolean };
}

export function makeNestWalk(opts: NestWalkOptions = {}): NestWalk {
  const sim = makeTestSim({ nest: 'small', systems: [] });
  const nest = sim.state.nests[0];
  const bu = sim.world.bu;
  const queen = opts.caste === 'worker'
    ? spawnAnt(sim, { colony: sim.state.colonies[0].id, caste: 'worker', pos: { ...sim.world.queenStart.pos }, fwd: { x: 1, y: 0, z: 0 }, ageGd: 5 })
    : sim.state.ants.find((a) => a.caste === 'queen')!;
  const deepest = [...nest.chambers].sort((a, b) => a.center.y - b.center.y)[0];
  const ent = nest.entrances[0].pos;
  // start 10 BU west of the entrance on the surface, facing it
  const start = { x: ent.x - 10 * bu, y: ent.y + bu, z: ent.z };
  walkerPlace(sim.field, queen, start, { dir: { x: 0, y: -1, z: 0 }, heading: { x: 1, y: 0, z: 0 } }, sim.kernel.walker);
  const dt = opts.dt ?? 1 / 30, speed = (opts.speedBu ?? 4) * bu, cap = opts.maxFramesPerLeg ?? 3000;
  const dir: Vec3 = { x: 0, y: 0, z: 0 };

  const run = (onFrame: (f: WalkFrame) => void) => {
    let i = 0;
    const step = (phase: WalkFrame['phase'], want: () => boolean): boolean => {
      for (let n = 0; n < cap; n++) {
        if (!want()) return true;
        // a chamber ceiling: an ant does not hang on there to go down, it lets go and drops to the floor
        if (phase === 'down' && queen.medium !== 'air' && queen.up.y < CEILING_UP_Y && sim.field.substrate(queen.pos) < 0) {
          walkerLetGo(sim.field, queen, 0, sim.kernel.walker);
        }
        walkerStep(sim.field, queen, dir, speed, dt, sim.kernel.walker);
        onFrame({ i: i++, phase, ant: queen, underground: sim.field.substrate(queen.pos) < 0 });
      }
      return false;
    };
    const toward = (p: Vec3) => { dir.x = p.x - queen.pos.x; dir.y = p.y - queen.pos.y; dir.z = p.z - queen.pos.z; };
    const horiz = (p: Vec3) => Math.hypot(p.x - queen.pos.x, p.z - queen.pos.z);
    // 1. walk to the entrance mouth
    step('surface-in', () => { toward(ent); dir.y = 0; return horiz(ent) > 0.8 * bu; });
    // 2. down the nest field to the deepest chamber's centre (stop on its floor within 2 BU horizontally); the
    // route is remembered every 0.5 BU so the way back retraces it (the exit field points straight up the shaft,
    // which a floor walker cannot follow from a chamber floor)
    const toChamber = { kind: 'chamber' as const, id: deepest.id };
    const route: Vec3[] = [];
    const remember = () => {
      const last = route[route.length - 1];
      if (queen.medium !== 'air' && (!last || Math.hypot(queen.pos.x - last.x, queen.pos.y - last.y, queen.pos.z - last.z) > 0.5 * bu)) route.push({ ...queen.pos });
    };
    const reachedDeepest = step('down', () => {
      remember();
      if (!sim.nestNav.descend(nest.id, toChamber, queen.pos, dir)) toward(deepest.center);
      return horiz(deepest.center) > 2 * bu || queen.pos.y > deepest.center.y + deepest.radii.y;
    });
    // 3. back along the remembered route until above ground, 4. then walk off on the surface
    route.unshift({ x: ent.x - 3 * bu, y: ent.y, z: ent.z }); // out over the rim onto the ground it came from
    let k = route.length - 1;
    const backOut = step('up', () => {
      while (k > 0 && Math.hypot(route[k].x - queen.pos.x, route[k].y - queen.pos.y, route[k].z - queen.pos.z) < 0.6 * bu) k--;
      toward(route[k]);
      return k > 0 || horiz(route[0]) > 0.8 * bu;
    });
    const away = { x: ent.x + 12 * bu, y: ent.y, z: ent.z + 6 * bu };
    step('surface-out', () => { toward(away); dir.y = 0; return horiz(away) > 1.5 * bu; });
    return { frames: i, reachedDeepest, backOut };
  };
  return { sim, nest, queen, deepestChamberId: deepest.id, run };
}

/**
 * A worker climbing the test table's route (GDD 01 E13): flat ground, up the leg, along the underside of the top (a
 * ceiling), round the edge and onto the top. Waypoints of the route's own climb points, steered with the real walker.
 */
export function makeTableClimb(opts: NestWalkOptions = {}): { sim: Sim; ant: Ant; run(onFrame: (f: WalkFrame) => void): { frames: number; reachedTop: boolean } } {
  const sim = makeTestSim({ features: ['table'], systems: [] });
  const bu = sim.world.bu;
  const route = sim.world.climbRoutes[0];
  const pts = route.points;
  const start = { x: pts[0].x - 8 * bu, y: pts[0].y + bu, z: pts[0].z };
  const ant = spawnAnt(sim, { colony: sim.state.colonies[0].id, caste: 'worker', pos: start, fwd: { x: 1, y: 0, z: 0 }, ageGd: 5 });
  walkerPlace(sim.field, ant, start, { dir: { x: 0, y: -1, z: 0 }, heading: { x: 1, y: 0, z: 0 } }, sim.kernel.walker);
  const dt = opts.dt ?? 1 / 30, speed = (opts.speedBu ?? 6) * bu, cap = opts.maxFramesPerLeg ?? 2400;
  const dir: Vec3 = { x: 0, y: 0, z: 0 };
  const run = (onFrame: (f: WalkFrame) => void) => {
    let k = 0, i = 0;
    const goal = pts[pts.length - 1];
    for (; i < cap; i++) {
      while (k < pts.length - 1 && Math.hypot(pts[k].x - ant.pos.x, pts[k].y - ant.pos.y, pts[k].z - ant.pos.z) < 1.2 * bu) k++;
      const p = pts[k];
      dir.x = p.x - ant.pos.x; dir.y = p.y - ant.pos.y; dir.z = p.z - ant.pos.z;
      walkerStep(sim.field, ant, dir, speed, dt, sim.kernel.walker);
      onFrame({ i, phase: 'surface-in', ant, underground: sim.field.substrate(ant.pos) < 0 });
      if (k === pts.length - 1 && Math.hypot(goal.x - ant.pos.x, goal.z - ant.pos.z) < 1.5 * bu) return { frames: i + 1, reachedTop: true };
    }
    return { frames: i, reachedTop: false };
  };
  return { sim, ant, run };
}
