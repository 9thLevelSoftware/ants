// Test support for the sealing property test (never imported by game code): a founding shaft of a given pitch and
// throat width, carved with the debug brushes into a chosen soil, with the founding cell at its foot. The geometry
// is set-up only; sealing itself goes through the real `seal-entrance` primitive.

import type { MaterialId, Sim } from '@/sim/types';
import { materialCode } from '@/sim/types';
import { makeTestSim, makeTestWorld } from '@/sim/testing';
import { nestOf, phase, queen, stepUntil } from './testkit';

export interface ThroatSpec {
  /** Shaft pitch from the horizontal, degrees (90 = vertical). */
  pitchDeg: number;
  /** Shaft (and throat) diameter, BU. */
  widthBu: number;
  soil: MaterialId;
  /** Depth of the shaft's foot below the ground, BU (default 10). */
  depthBu?: number;
  seed?: number;
}

export interface ThroatCase {
  sim: Sim;
  mouth: { x: number; y: number; z: number };
  floor: { x: number; y: number; z: number };
  /** A point on the shaft axis `bu` BU (along the shaft) below the mouth, lifted to the floor side. */
  shaftAt(bu: number): { x: number; y: number; z: number };
}

/** A searching test sim on a flat world whose ground is `soil` throughout. */
export function soilSim(soil: MaterialId, seed = 1): Sim {
  const world = makeTestWorld({ sizeBu: 128, seed });
  world.ground.surface.data.fill(materialCode(soil));
  world.ground.subsoil.data.fill(materialCode(soil));
  const sim = makeTestSim({ world, seed });
  sim.enqueue({ type: 'openingSkipIntro' });
  stepUntil(sim, () => phase(sim) === 'search', 200);
  return sim;
}

/** Carves the shaft and the cell (phase `digging` set first), puts the queen on the cell floor, waits for `seal`. */
export function throatCase(spec: ThroatSpec): ThroatCase {
  const sim = soilSim(spec.soil, spec.seed ?? 1);
  const nest = nestOf(sim);
  sim.enqueue({ type: 'cheat.setFoundingState', nestId: nest.id, state: 'digging' });
  const q = queen(sim), bu = sim.world.bu;
  const depth = spec.depthBu ?? 10;
  const th = (spec.pitchDeg * Math.PI) / 180;
  const run = depth / Math.tan(th), len = depth / Math.sin(th);
  const x0 = q.pos.x, z0 = q.pos.z, g = sim.field.height(x0, z0);
  const r = (spec.widthBu / 2) * bu;
  for (let s = -0.5; s <= len; s += 0.3) {
    const t = s / len;
    sim.enqueue({ type: 'cheat.carveSphere', pos: { x: x0 + t * run * bu, y: g - t * depth * bu, z: z0 }, r });
  }
  const cell = { x: x0 + (run + 2) * bu, y: g - (depth + 0.5) * bu, z: z0 };
  sim.enqueue({ type: 'cheat.carveEllipsoid', center: cell, radii: { x: 2.5 * bu, y: 1.1 * bu, z: 2.5 * bu }, yawDeg: 0 });
  sim.tick();
  const floor = { x: cell.x, y: cell.y - 0.9 * bu, z: cell.z };
  sim.enqueue({ type: 'cheat.teleport', antId: q.id, pos: floor });
  sim.tick();
  stepUntil(sim, () => phase(sim) === 'seal', 900);
  return {
    sim, mouth: { x: x0, y: g, z: z0 }, floor,
    shaftAt: (b: number) => { const t = b / len; return { x: x0 + t * run * bu, y: g - t * depth * bu - r * 0.5, z: z0 }; },
  };
}
