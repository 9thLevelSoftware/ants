// Desired directions of the non-trip requests: wander (bounded region), trail following (three antennal sensors
// on the tangent plane, GDD 02 §7-8.4) and breadcrumb retrace (crumbs.ts). Noise is a hash of (id, tick), so no RNG
// stream is consumed.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, PheroChannel, Sim, Walker } from '@/sim/types';
import { retraceTarget } from './crumbs';
import { noiseGauss, rotateTangent, set3 } from './mathx';
import type { LocoRuntime } from './runtime';
import type { NavScratch } from './scratch';

const _l: Vec3 = { x: 0, y: 0, z: 0 }, _c: Vec3 = { x: 0, y: 0, z: 0 }, _rr: Vec3 = { x: 0, y: 0, z: 0 };
const _h: Vec3 = { x: 0, y: 0, z: 0 };

/** Wander: the heading drifts by gaussian noise; beyond the radius the walker is pulled back to the centre. */
export function wanderDesired(w: Walker, s: NavScratch, r: LocoRuntime, id: number, tick: number, dt: number, out: Vec3): void {
  const a = noiseGauss(id, tick, 7) * r.P.wanderSigma * Math.sqrt(dt);
  rotateTangent(out, w.fwd, w.up, a);
  if (s.radius > 0) {
    const dx = s.center.x - w.pos.x, dz = s.center.z - w.pos.z, d = Math.sqrt(dx * dx + dz * dz);
    if (d > s.radius * 0.7) {
      const k = (r.P.wanderPull * (d - s.radius * 0.7)) / (s.radius * 0.3 * d);
      out.x += dx * k; out.z += dz * k;
    }
  }
}

/** Sensor point at reach along fwd rotated by angle a on the tangent plane. */
function sensor(out: Vec3, w: Walker, a: number, reach: number): Vec3 {
  rotateTangent(_h, w.fwd, w.up, a);
  return set3(out, w.pos.x + _h.x * reach, w.pos.y + _h.y * reach, w.pos.z + _h.z * reach);
}

/**
 * Trail following: L / C / R sensors (ANTENNA_REACH at +-35 deg and straight ahead); turn rate
 * omega = gain (L - R) / (L + R + 1) plus small noise while on the trail. Returns the strongest reading (0 = none),
 * writes the desired direction. Direction along the trail: outbound = away from home (homeVec growing), inbound
 * = toward home; a walker heading the wrong way turns round once when it picks the trail up.
 */
export function trailDesired(sim: Sim, w: Walker, s: NavScratch, r: LocoRuntime, id: number, tick: number, dt: number,
  out: Vec3): number {
  const P = r.P, phero = sim.phero, ch = s.trailChannel as PheroChannel, col = s.trailColony;
  const L = phero.sample(col, ch, sensor(_l, w, P.antAngle, P.antReach));
  const C = phero.sample(col, ch, sensor(_c, w, 0, P.antReach));
  const R = phero.sample(col, ch, sensor(_rr, w, -P.antAngle, P.antReach));
  const best = Math.max(L, C, R);
  if (best < P.trailDetect) {
    // gap: keep the heading (no noise) so short breaks are crossed
    set3(out, w.fwd.x, w.fwd.y, w.fwd.z);
    return 0;
  }
  let omega = (P.trailGain * (L - R)) / (L + R + 1);
  // a centre sensor weaker than both sides means the trail bends sharply: turn toward the stronger side harder
  if (C < L && C < R) omega *= 2;
  const turn = omega * dt + noiseGauss(id, tick, 11) * P.trailNoise * Math.sqrt(dt);
  rotateTangent(out, w.fwd, w.up, turn);
  const ant = w as Partial<Ant>;
  if (s.trailDir !== 0 && ant.mem) {
    const h = ant.mem.homeVec;
    const toward = h.x * out.x + h.y * out.y + h.z * out.z; // > 0: heading home
    const wrong = s.trailDir > 0 ? toward > 0 : toward < 0;
    if (wrong && !s.trailTurned) set3(out, -out.x, -out.y, -out.z);
    s.trailTurned = 1;
  }
  return best;
}

/** Retrace: steer to the current crumb (shortcuts included). False when home (crumb 0) is reached. */
export function retraceDesired(sim: Sim, ant: Ant, s: NavScratch, r: LocoRuntime, out: Vec3): boolean {
  if (!retraceTarget(sim, ant, s, r, _c)) return false;
  if (ant.medium === 'surface') set3(out, _c.x - ant.pos.x, 0, _c.z - ant.pos.z);
  else set3(out, _c.x - ant.pos.x, _c.y - ant.pos.y, _c.z - ant.pos.z);
  return true;
}
