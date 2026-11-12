// Avoid markers on the way (GDD 02 §12.2; App. E 20): autonomous ants never walk through an avoid disc, and ants
// inside one leave it by the shortest exit. Locomotion already prices the discs in its planner and repels walkers
// near them; this adds what a behaviour knows: when the straight way to its goal, or the planned path (whose
// entrance flow field and coarse 16 BU cells can graze a disc), enters a disc, the ant first walks to a waypoint
// beside it (or straight out of it). At most AVOID_DETOURS_MAX detours per trip; "an ant whose only way home
// crosses it may cross".

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Marker, Sim } from '@/sim/types';
import { AVOID_DETOURS_MAX, AVOID_EXIT_PAD_BU, LEG_ARRIVE_BU } from '@/sim/balance/foraging';
import { K } from './keys';
import { goTo, moving } from './nav';

const tmp: Vec3 = { x: 0, y: 0, z: 0 };

function segDist2(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  const cx = ax + dx * t - px, cz = az + dz * t - pz;
  return cx * cx + cz * cz;
}

/** The first of the colony's avoid discs that the ant's way to `goal` enters (straight line or planned path). */
function blocking(sim: Sim, ant: Ant, goal: { x: number; z: number }): Marker | null {
  const path = ant.nav.status === 'moving' ? ant.nav.path : null;
  for (const m of sim.stores.markers.list) {
    if (!m.alive || m.kind !== 'avoid' || m.colony !== ant.colony) continue;
    const r2 = m.radius * m.radius;
    if (segDist2(m.pos.x, m.pos.z, ant.pos.x, ant.pos.z, goal.x, goal.z) <= r2) return m;
    if (path) {
      let ax = ant.pos.x, az = ant.pos.z;
      for (let i = Math.max(0, ant.nav.pathIdx); i < path.length; i++) {
        if (segDist2(m.pos.x, m.pos.z, ax, az, path[i].x, path[i].z) <= r2) return m;
        ax = path[i].x; az = path[i].z;
      }
    }
  }
  return null;
}

/**
 * One think of the detour logic toward `goal`. 'leg' while walking a detour leg (or after starting one), 'done'
 * when a leg just ended (the caller re-plans its own way), 'none' when nothing is in the way.
 */
export function avoidLeg(sim: Sim, ant: Ant, goal: { x: number; z: number }): 'leg' | 'done' | 'none' {
  if ((ant.bb[K.avoidExit] ?? -1) >= 0) {
    if (moving(ant)) return 'leg';
    ant.bb[K.avoidExit] = -1;
    return 'done';
  }
  if ((ant.bb[K.avoidDone] ?? 0) >= AVOID_DETOURS_MAX) return 'none';
  const m = blocking(sim, ant, goal);
  if (!m) return 'none';
  const pad = AVOID_EXIT_PAD_BU * sim.world.bu;
  const dx = ant.pos.x - m.pos.x, dz = ant.pos.z - m.pos.z, d = Math.hypot(dx, dz);
  if (d <= m.radius + pad) {
    // inside or on the rim: straight out
    const k = (m.radius + 2 * pad) / Math.max(d, 1e-6);
    tmp.x = m.pos.x + (d > 1e-6 ? dx * k : m.radius + 2 * pad); tmp.z = m.pos.z + (d > 1e-6 ? dz * k : 0);
  } else {
    // beside the disc, on the side the ant already is, perpendicular to its way
    const hx = goal.x - ant.pos.x, hz = goal.z - ant.pos.z, hl = Math.hypot(hx, hz) || 1;
    const side = dx * -hz + dz * hx >= 0 ? 1 : -1;
    const r = m.radius + 3 * pad;
    tmp.x = m.pos.x + (-hz / hl) * r * side; tmp.z = m.pos.z + (hx / hl) * r * side;
  }
  tmp.y = sim.field.height(tmp.x, tmp.z);
  ant.bb[K.avoidExit] = m.id;
  ant.bb[K.avoidDone] = (ant.bb[K.avoidDone] ?? 0) + 1;
  goTo(sim, ant, tmp, LEG_ARRIVE_BU);
  return 'leg';
}

/** New trip leg: the detour budget starts again. */
export function resetAvoid(ant: Ant): void {
  ant.bb[K.avoidExit] = -1;
  ant.bb[K.avoidDone] = 0;
}
