// Weather hooks consumed by locomotion (GDD 06 §3.3, §3.10; viab-loco item 5):
//   - under water (a flooded nest voxel, or a puddle at least WX_PUDDLE_AVOID_BU deep): speed x waterSpeedMult; a
//     walker under water outside a nest has medium 'water' (inside a nest it stays 'cavity', so nest membership,
//     fields and the floor bias keep working);
//   - stunned (ant.bb[WX_STUN_KEY] after a rain hit, a collapse or a creature): the ant does not walk;
//   - wet surfaces (surfaceWetness 0..1): grip x lerp(1, wetGripMult, wetness) for walkers outside nests;
//   - puddle depth per nav cell (the moisture grid is the 16 BU nav grid): planner cost x WX_PUDDLE_AVOID_COST at
//     WX_PUDDLE_AVOID_BU, blocked at WX_PUDDLE_BLOCK_BU (puddles.ts); the possessed ant is never planned, so it may
//     swim through.
// Pure reads of state (the moisture grid, nest flood water) plus the nest flood module's isUnderWater.

import type { Ant, Sim, Walker } from '@/sim/types';
import { WX_PUDDLE_AVOID_BU, WX_PUDDLE_UNIT_MM, WX_STUN_KEY } from '@/sim/balance/weather';
// namespace import, read at call time: the nest module imports locomotion (mounds), so no binding is read while
// the modules are still being evaluated
import * as flood from '@/sim/nest/flood/drown';
import type { LocoRuntime } from './runtime';
import type { WalkerKin } from './walker';

/** The ant is stunned this tick (shared key of rain hits, collapses, combat and creatures). */
export function isStunned(sim: Sim, ant: Ant): boolean {
  const until = ant.bb[WX_STUN_KEY];
  return until !== undefined && until > sim.state.tick;
}

/** Standing puddle depth over the cell holding (x, z), mm (0 without a moisture grid). */
export function puddleDepth(sim: Sim, x: number, z: number): number {
  const m = sim.state.env.moisture;
  if (!m || m.nx <= 0) return 0;
  const ix = Math.min(m.nx - 1, Math.max(0, Math.floor(x / m.cell)));
  const iz = Math.min(m.nz - 1, Math.max(0, Math.floor(z / m.cell)));
  return m.puddle[iz * m.nx + ix] * WX_PUDDLE_UNIT_MM;
}

/** Ids of nests holding flood water this tick (cached per tick). */
function floodedNests(sim: Sim, r: LocoRuntime): ReadonlySet<number> {
  const tick = sim.state.tick;
  if (r.floodTick === tick) return r.flooded;
  r.floodTick = tick;
  r.flooded.clear();
  const list = sim.stores.nests.list;
  for (let i = 0; i < list.length; i++) if (list[i].alive && list[i].flood && list[i].flood.water > 0) r.flooded.add(list[i].id);
  return r.flooded;
}

function nestOf(w: Walker | WalkerKin): number {
  const n = (w as Partial<Ant>).nestId;
  return typeof n === 'number' ? n : -1;
}

/**
 * Is the walker under water now (`nest`: the nest it is in, -1 none)? Cheap pre-checks first: inside a nest only when that nest (or, for a walker in
 * carved space of no nest, any nest) holds water; on the surface only over a puddle cell at least
 * WX_PUDDLE_AVOID_BU deep. Then the nest flood module decides (GDD 03 §11.3, GDD 06 §3.10).
 */
export function walkerUnderWater(sim: Sim, w: Walker | WalkerKin, r: LocoRuntime, nest = nestOf(w)): boolean {
  if (w.medium === 'air') return false;
  const wet = floodedNests(sim, r);
  let candidate = false;
  if (nest >= 0 || w.medium === 'cavity') candidate = nest >= 0 ? wet.has(nest) : wet.size > 0;
  if (!candidate && nest < 0) candidate = puddleDepth(sim, w.pos.x, w.pos.z) >= WX_PUDDLE_AVOID_BU * sim.world.bu;
  return candidate && flood.isUnderWater(sim, w.pos);
}

/** Grip multiplier of a wet surface (GDD 06 §3.10 friction x0.9) for a walker outside the nests. */
export function wetGripMult(sim: Sim, w: Walker, r: LocoRuntime): number {
  if (w.medium === 'cavity' || nestOf(w) >= 0) return 1;
  const m = sim.state.env.moisture;
  const wet = m && m.surfaceWet !== undefined ? m.surfaceWet : 0;
  if (!(wet > 0)) return 1;
  return 1 - (1 - r.P.wetGrip) * Math.min(1, wet);
}
