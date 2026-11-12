// Small helpers shared by the source files: the ecology RNG stream and surface placement.

import { rngFork, type RngState } from '@/core/rng';
import type { Vec3 } from '@/core/math/vec3';
import type { SimState, WorldData, WorldField } from '@/sim/types';
import { terrainHeightAt } from '@/sim/entities';

const STREAM = 'rng.ecology';

/**
 * The `rng.ecology` sub-stream (GDD 05 §0), created on first use exactly like Sim.stream does, so code that only
 * has an EntityCtx (New Game) and code with a Sim draw from the same persisted stream.
 */
export function ecologyRng(state: SimState): RngState {
  let s = state.rngStreams[STREAM];
  if (!s) {
    s = rngFork(state.config.world.seed, STREAM);
    state.rngStreams[STREAM] = s;
  }
  return s;
}

/** Steps up through a solid (slab, floor, stone) looking for free space, in multiples of this many BU. */
const CLIMB_STEP_BU = 0.5;
/** ... at most this many steps. */
const CLIMB_MAX_STEPS = 400;
/** f below minus this (BU) counts as inside a solid (the field is smoothed near contacts). */
const SOLID_TOL_BU = 0.1;

/**
 * Surface point above ground point (x, z) into out: the terrain, or the top of the solid lying on it (a slab or a
 * floor) when the terrain point is inside one. Returns false if no free space was found.
 */
export function surfacePointAt(world: WorldData, field: WorldField | null, x: number, z: number, out: Vec3): boolean {
  out.x = x;
  out.z = z;
  out.y = terrainHeightAt(world.terrain, x, z);
  if (!field) return true;
  const step = CLIMB_STEP_BU * world.bu;
  const tol = SOLID_TOL_BU * world.bu;
  let n = 0;
  while (field.sample(out) < -tol && n < CLIMB_MAX_STEPS) {
    out.y += step;
    n++;
  }
  if (n >= CLIMB_MAX_STEPS) return false;
  if (n > 0) field.project(out, 0, out);
  return true;
}
