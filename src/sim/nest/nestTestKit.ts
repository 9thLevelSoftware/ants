// Test support for the nest module (imported by *.test.ts only): small sims running just the nest system,
// worlds of one soil material, workers placed on cavity floors, moisture control.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, MaterialId, Nest, Primitive, Sim } from '@/sim/types';
import { materialCode } from '@/sim/types';
import { spawnAnt } from '@/sim/entities';
import { walkerPlace } from '@/sim/locomotion/walker';
import { makeTestSim, makeTestWorld, type TestSimOptions } from '@/sim/testing';
import { commandsSystem } from '@/sim/systems';
import { nestSystem } from './system';

export interface NestSimOptions extends TestSimOptions {
  /** Ground material of the whole world (surface and subsoil). Default loam. */
  material?: MaterialId;
  /** Soil moisture 0..1 everywhere. Default 0.4. */
  moisture?: number;
}

/** A test sim on a flat world running only the nest system (plus commands). */
export function nestSim(opts: NestSimOptions = {}): Sim {
  const world = opts.world ?? makeTestWorld({ ...opts, prims: opts.prims as Primitive[] | number | undefined });
  if (opts.material) {
    world.ground.surface.data.fill(materialCode(opts.material));
    world.ground.subsoil.data.fill(materialCode(opts.material));
  }
  const sim = makeTestSim({ ...opts, world, systems: opts.systems ?? [commandsSystem, nestSystem] });
  setMoisture(sim, opts.moisture ?? 0.4);
  return sim;
}

/** Sets surface and deep soil moisture everywhere. */
export function setMoisture(sim: Sim, m: number): void {
  const mo = sim.state.env.moisture;
  mo.theta0.fill(Math.round(m * 255));
  mo.theta1.fill(Math.round(m * 255));
}

/** The player colony's nest, made "established" with its origin at `origin` (inside the test cavity). */
export function playerNest(sim: Sim, origin?: Vec3): Nest {
  const nest = sim.stores.nests.get(sim.state.colonies[0].nestIds[0])!;
  if (origin) nest.origin = { ...origin };
  nest.founding = null;
  return nest;
}

/** A worker of the player colony placed on the surface below p (traced down), facing fwd. */
export function placeWorker(sim: Sim, p: Vec3, fwd: Vec3, nestId = -1): Ant {
  const colony = sim.state.colonies[0];
  const ant = spawnAnt(sim, { colony: colony.id, caste: 'worker', pos: p, fwd, ageGd: 5, nestId });
  if (!walkerPlace(sim.field, ant, p, { dir: { x: 0, y: -1, z: 0 }, heading: fwd }, sim.kernel.walker)) {
    throw new Error(`placeWorker: no surface below ${JSON.stringify(p)}`);
  }
  return ant;
}

/** Feet point of an ant (body centre minus the foot offset along its up). */
export function feetOf(ant: Ant): Vec3 {
  return { x: ant.pos.x - ant.up.x * ant.footOffset, y: ant.pos.y - ant.up.y * ant.footOffset, z: ant.pos.z - ant.up.z * ant.footOffset };
}

export function runTicks(sim: Sim, n: number): void {
  for (let i = 0; i < n; i++) sim.tick();
}

/** Collects events of the given types emitted while fn runs (after the tick flush). */
export function collect<T extends { type: string }>(sim: Sim, types: string[], fn: () => void): T[] {
  const out: T[] = [];
  const off = sim.events.onAny(((type: string, payload: unknown) => {
    if (types.includes(type)) out.push(payload as T);
  }) as never);
  try { fn(); sim.events.flush(); } finally { off(); }
  return out;
}

/** Sum of the open fractions within r of c, BU^3 (GDD 03 App. E "volumes from query.voxel sums"). */
export function openVolumeNear(sim: Sim, c: Vec3, r: number): number {
  const v = sim.carve.voxel;
  let s = 0;
  for (let k = Math.floor((c.z - r) / v); k <= Math.ceil((c.z + r) / v); k++)
    for (let j = Math.floor((c.y - r) / v); j <= Math.ceil((c.y + r) / v); j++)
      for (let i = Math.floor((c.x - r) / v); i <= Math.ceil((c.x + r) / v); i++) {
        if ((i * v - c.x) ** 2 + (j * v - c.y) ** 2 + (k * v - c.z) ** 2 > r * r) continue;
        const o = sim.carve.sampleAt(i, j, k);
        s += Math.min(1, Math.max(0, o / 127.5 - 0.5));
      }
  return s * (v / sim.world.bu) ** 3;
}
