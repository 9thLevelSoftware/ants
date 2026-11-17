// Test helpers of the wood-nesting module: a Camponotus test sim with a decayed log lying on the ground (and a twig
// that is too thin to nest in), plus a small chamber carved in the log for brood tests.

import type { Ant, Primitive, Sim, System } from '@/sim/types';
import { PrimFlag } from '@/sim/types';
import { makeTestSim } from '@/sim/testing/testWorld';
import { spawnAnt } from '@/sim/entities';
import { carveEllipsoid } from '@/sim/nest/carveOps';

export const CP = 'camponotus-pennsylvanicus' as const;
export const BU = 9;
/** Log: radius 10 BU, 120 BU long along +X, centre 8 BU above the ground (half sunk). */
export const LOG_ID = 1;
export const TWIG_ID = 2;
export const LOG_CENTRE = { x: 64 * BU, y: 8 * BU, z: 40 * BU };
const Z_QUARTER = { x: 0, y: 0, z: -Math.SQRT1_2, w: Math.SQRT1_2 }; // local +Y -> world +X

export function testLog(material: 'wood-decayed' | 'wood-sound' = 'wood-decayed'): Primitive {
  return {
    id: LOG_ID, shape: 'cylinder', pos: { ...LOG_CENTRE }, rot: { ...Z_QUARTER }, size: { x: 10 * BU, y: 60 * BU, z: 0 },
    round: 0, material, flags: PrimFlag.DIGGABLE | PrimFlag.CLIMBABLE, objectId: -1,
  };
}

function twig(): Primitive {
  return {
    id: TWIG_ID, shape: 'capsule', pos: { x: 30 * BU, y: 1 * BU, z: 30 * BU }, rot: { ...Z_QUARTER },
    size: { x: 0.6 * BU, y: 10 * BU, z: 0 }, round: 0, material: 'wood-decayed', flags: PrimFlag.DIGGABLE, objectId: -1,
  };
}

/** A Camponotus sim (no systems unless given) on a flat test world with the log and the twig. */
export function woodSim(opts: { material?: 'wood-decayed' | 'wood-sound'; systems?: readonly System[] } = {}): Sim {
  return makeTestSim({ species: CP, prims: [testLog(opts.material), twig()], systems: opts.systems ?? [] });
}

/** Carves a chamber (8 x 2.5 x 5 BU) in the middle of the log, returns its centre. */
export function carveLogChamber(sim: Sim): { x: number; y: number; z: number } {
  const c = { x: LOG_CENTRE.x, y: LOG_CENTRE.y, z: LOG_CENTRE.z };
  carveEllipsoid(sim, c, { x: 4 * BU, y: 1.25 * BU, z: 2.5 * BU });
  return c;
}

/** A worker of the player colony at p, facing `fwd`. */
export function worker(sim: Sim, caste: 'minor' | 'media' | 'major', p: { x: number; y: number; z: number }, fwd = { x: 1, y: 0, z: 0 }, flags = 0): Ant {
  const a = spawnAnt(sim, { colony: sim.state.colonies[0].id, caste, pos: { ...p }, fwd, ageGd: 5 });
  a.flags |= flags;
  return a;
}
