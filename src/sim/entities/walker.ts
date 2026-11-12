// Fresh kinematic and memory records for new walkers (ants, creatures).

import type { Vec3 } from '@/core/math/vec3';
import type { AntMemory, NavState, Walker } from '@/sim/types';
import { CRUMB_CAP, DECISION_LOG, DEPLETED_SLOTS, ROUTE_SLOTS, ROUTE_WAYPOINTS_MAX } from '@/sim/balance';
import { copyV, v3 } from './util';

export function newNavState(pos: Vec3, arriveDist: number): NavState {
  return {
    mode: 'none', dest: copyV(pos), destKind: 'none', destId: -1, arriveDist, path: null, pathIdx: 0,
    fieldNest: -1, fieldTarget: -1, fieldKind: 'none', status: 'idle', stuckTicks: 0, desiredDir: v3(),
    desiredSpeed: 0, routeId: -1,
  };
}

/** Walker standing at pos (already on the level set) with the given frame. */
export function newWalker(pos: Vec3, up: Vec3, fwd: Vec3, footOffset: number, radius: number, arriveDist: number): Walker {
  return {
    pos: copyV(pos), up: copyV(up), fwd: copyV(fwd),
    prevPos: copyV(pos), prevUp: copyV(up), prevFwd: copyV(fwd),
    speed: 0, footOffset, radius, medium: 'surface', vel: v3(), gait: 0,
    nav: newNavState(pos, arriveDist),
  };
}

export function newAntMemory(): AntMemory {
  const routes = [];
  for (let i = 0; i < ROUTE_SLOTS; i++) {
    routes.push({ sourceId: -1, wp: new Float32Array(ROUTE_WAYPOINTS_MAX * 3), n: 0, visits: 0, lastUsed: -1 });
  }
  const depleted = [];
  for (let i = 0; i < DEPLETED_SLOTS; i++) depleted.push({ sourceId: -1, untilTick: -1 });
  const decisions = [];
  for (let i = 0; i < DECISION_LOG; i++) decisions.push({ tick: -1, code: -1, detail: 0 });
  return {
    crumbs: new Float32Array(CRUMB_CAP * 3), crumbHead: 0, crumbLen: 0, homeVec: v3(), homeVecErr: 0,
    knownSourceId: -1, homeEntranceId: -1, trips: 0, lastSuccessTick: -1, routes, depleted,
    lead: { sourceId: -1, pos: v3(), tick: -1 }, decisions,
  };
}
