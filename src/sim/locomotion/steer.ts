// Steering on the surface walker: blends the leg's desired direction with light separation from nestmates, the
// prefer-floor bias in cavities (spike-nest §5 item 4), map-edge repulsion (GDD 04 §14) and avoid-marker repulsion
// (GDD 02 §12.2), then turns the heading toward the tangent part at a limited rate. A direction whose tangent part
// is small (pushing into a wall) leaves the transported heading alone, so the walker climbs instead of turning.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Sim, Walker } from '@/sim/types';
import { normalizeInPlace as normalizeInPlaceImp, rotateTangent as rotateTangentImp, signedAngle as signedAngleImp, tangentPart as tangentPartImp } from './mathx';
import { avoidDiscs as avoidDiscsImp, type LocoRuntime } from './runtime';

// Hot imports re-bound as local consts (Vitest reads imported bindings through getters; see 02-kernel.md §2.11).
const normalizeInPlace = normalizeInPlaceImp, rotateTangent = rotateTangentImp, signedAngle = signedAngleImp, tangentPart = tangentPartImp, avoidDiscs = avoidDiscsImp;

const _t: Vec3 = { x: 0, y: 0, z: 0 };
const DOWN: Vec3 = { x: 0, y: -1, z: 0 };

/**
 * Turns w.fwd toward the tangent part of dir by at most maxAngle (rad). Returns the remaining |angle| (rad), or
 * -1 when dir had no usable tangent part (heading kept).
 */
export function turnToward(w: Walker, dir: Vec3, maxAngle: number, minSteer: number): number {
  const dl = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);
  if (!(dl > 1e-9)) return -1;
  const tl = tangentPart(_t, dir, w.up);
  if (tl < minSteer * dl) return -1;
  _t.x /= tl; _t.y /= tl; _t.z /= tl;
  let a = signedAngle(w.fwd, _t, w.up);
  const rest = Math.abs(a);
  if (a > maxAngle) a = maxAngle; else if (a < -maxAngle) a = -maxAngle;
  if (a !== 0) {
    rotateTangent(w.fwd, w.fwd, w.up, a);
    // keep fwd tangent and unit
    tangentPart(w.fwd, w.fwd, w.up);
    normalizeInPlace(w.fwd);
  }
  return Math.max(0, rest - Math.abs(a));
}

/** Adds weight x (unit tangent of "down") inside cavities: walkers drift back to tunnel floors. */
export function addFloorBias(w: Walker, out: Vec3, weight: number): void {
  if (w.medium !== 'cavity') return;
  const l = tangentPart(_t, DOWN, w.up);
  if (l < 1e-6) return;
  const k = weight * Math.min(1, l);
  out.x += (_t.x / l) * k; out.y += (_t.y / l) * k; out.z += (_t.z / l) * k;
}

/** Light separation from nearby ants (radius sepR), weight sepW at contact, at most sepMax neighbours. */
export function addSeparation(sim: Sim, w: Walker, selfId: number, r: LocoRuntime, out: Vec3): void {
  const P = r.P, ids = r.ids;
  sim.index.queryAnts(w.pos, P.sepR, ids);
  let n = 0;
  for (let i = 0; i < ids.length && n < P.sepMax; i++) {
    if (ids[i] === selfId) continue;
    const o = sim.stores.ants.get(ids[i]);
    if (!o) continue;
    const dx = w.pos.x - o.pos.x, dy = w.pos.y - o.pos.y, dz = w.pos.z - o.pos.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d >= P.sepR) continue;
    n++;
    if (d < 1e-6) {
      // exactly on top of each other: split deterministically by id
      const s = selfId < ids[i] ? 1 : -1;
      out.x += w.fwd.z * s * P.sepW; out.z -= w.fwd.x * s * P.sepW;
      continue;
    }
    const k = (P.sepW * (1 - d / P.sepR)) / d;
    out.x += dx * k; out.y += dy * k; out.z += dz * k;
  }
}

/** Pushes inward within the soft map margin (GDD 04 §14 EDGE_MARGIN_BU), strength 0..edgeRepulse. */
export function addEdgeRepulsion(sim: Sim, w: Walker, r: LocoRuntime, out: Vec3): void {
  const m = r.P.edgeMargin, size = sim.world.size, k = r.P.edgeRepulse;
  const x = w.pos.x, z = w.pos.z;
  if (x < m) out.x += k * (1 - x / m);
  else if (x > size - m) out.x -= k * (1 - (size - x) / m);
  if (z < m) out.z += k * (1 - z / m);
  else if (z > size - m) out.z -= k * (1 - (size - z) / m);
}

/** Repulsion from the colony's avoid markers for autonomous ants (radius + pad). */
export function addAvoidRepulsion(sim: Sim, ant: Ant, r: LocoRuntime, out: Vec3): void {
  const discs = avoidDiscs(sim, r, ant.colony);
  for (let i = 0; i < discs.length; i++) {
    const d = discs[i], R = d.r + r.P.avoidPad;
    const dx = ant.pos.x - d.x, dz = ant.pos.z - d.z, l = Math.sqrt(dx * dx + dz * dz);
    if (l >= R || l < 1e-6) continue;
    const k = (r.P.avoidW * (1 - l / R)) / l;
    out.x += dx * k; out.z += dz * k;
  }
}
