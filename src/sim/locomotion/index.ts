// Locomotion API: behaviours steer walkers only through these functions and poll `nav.status`.
// STUB written by F1b/F1c with final signatures; owner: loco. The surface walker itself is the kernel's
// (walker.ts, F2; wired by F-int).

import type { Vec3 } from '@/core/math/vec3';
import type {
  Ant, CommandHandlerMap, NestFieldTarget, PheroChannel, Sim, System, TargetRef, Walker,
} from '@/sim/types';
import { walkerPlace } from './walker';

/** Moves every walker one tick (steering, surface walking, falling, water). Stub: loco. */
export const locomotionSystem: System = { name: 'locomotion', phase: 'locomotion', run: () => {} };

export const systems: readonly System[] = [locomotionSystem];

/** Seek a point (planner fallback when blocked); arriveDist mm. False if no route. Stub: false. */
export function navTo(_sim: Sim, _w: Walker, _dest: Vec3, _arriveDist?: number): boolean {
  return false;
}

/** Seek a (possibly moving) target entity. Stub: false. */
export function navToTarget(_sim: Sim, _w: Walker, _target: TargetRef, _arriveDist?: number): boolean {
  return false;
}

/** Stop and hold position. Stub: no-op. */
export function navStop(_sim: Sim, _w: Walker): void {}

/** Random walk around a centre within a radius (mm). Stub: false. */
export function navWander(_sim: Sim, _w: Walker, _center: Vec3, _radius: number): boolean {
  return false;
}

/** Follow a pheromone trail of a colony and channel. Stub: false. */
export function navFollowTrail(_sim: Sim, _w: Walker, _colony: number, _channel: PheroChannel): boolean {
  return false;
}

/** Retrace the ant's breadcrumbs home (shortcuts allowed). Stub: false. */
export function navRetrace(_sim: Sim, _ant: Ant): boolean {
  return false;
}

/** Follow a nest distance field downhill. Stub: false. */
export function navFollowField(_sim: Sim, _w: Walker, _nestId: number, _target: NestFieldTarget): boolean {
  return false;
}

/** Follow an authored climb route. Stub: false. */
export function navClimb(_sim: Sim, _w: Walker, _routeId: number): boolean {
  return false;
}

/** Per-frame integration of the possessed ant from player intent. Stub: no-op (loco / actions). */
export function integratePossessed(_sim: Sim, _ant: Ant, _dtSeconds: number): void {}

/**
 * Puts a walker on the level set f = footOffset near `pos` (spawn, teleport, after carving under it), resetting
 * its interpolation state and nav. Returns false (walker unchanged) if no surface was found. Uses the kernel's
 * walkerPlace: where the field gives no direction (open air, chamber interior) it sphere-traces down first.
 */
export function placeOnSurface(sim: Sim, w: Walker, pos: Vec3): boolean {
  if (!walkerPlace(sim.field, w, pos, {}, sim.kernel.walker)) return false;
  w.nav.status = 'idle';
  w.nav.mode = 'none';
  return true;
}

export const commandHandlers: Partial<CommandHandlerMap> = {
  'cheat.teleport': (sim, c) => {
    const ant = sim.stores.ants.get(c.antId);
    if (ant && !placeOnSurface(sim, ant, c.pos)) {
      ant.pos = { ...c.pos };
      ant.prevPos = { ...c.pos };
    }
  },
};
