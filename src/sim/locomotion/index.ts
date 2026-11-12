// Locomotion API: behaviours steer walkers only through these functions and poll `nav.status`.
// STUB written by F1b; owner: loco (walker.ts internals: F2-kernel).

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, NestFieldTarget, PheroChannel, Sim, System, TargetRef, Walker } from '@/sim/types';

/** Moves every walker one tick (steering, surface walking, falling, water). Stub: loco. */
export const locomotionSystem: System = { name: 'locomotion', run: () => {} };

/** Seek a point (planner fallback when blocked). Returns false if no route. Stub: false. */
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
