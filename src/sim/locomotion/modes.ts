// Desired directions of the non-trip requests: wander (bounded region), trail following (three antennal sensors
// on the tangent plane, GDD 02 §7-8.4) and breadcrumb retrace (crumbs.ts). Noise is a hash of (id, tick), so no RNG
// stream is consumed.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, PheroChannel, Sim, Walker } from '@/sim/types';
import { retraceTarget as retraceTargetImp } from './crumbs';
import { noiseGauss as noiseGaussImp, rotateTangent as rotateTangentImp, set3 as set3Imp } from './mathx';
import { avoidDiscs as avoidDiscsImp, type LocoRuntime } from './runtime';
import type { CostDisc } from './grid/search';
import { isAutonomousAnt as isAutonomousAntImp } from './trip';
import type { NavScratch } from './scratch';

// Hot imports re-bound as local consts (Vitest reads imported bindings through getters; see 02-kernel.md §2.11).
const avoidDiscs = avoidDiscsImp, isAutonomousAnt = isAutonomousAntImp, retraceTarget = retraceTargetImp, noiseGauss = noiseGaussImp, rotateTangent = rotateTangentImp, set3 = set3Imp;

const _l: Vec3 = { x: 0, y: 0, z: 0 }, _c: Vec3 = { x: 0, y: 0, z: 0 }, _rr: Vec3 = { x: 0, y: 0, z: 0 };
const _h: Vec3 = { x: 0, y: 0, z: 0 };
/** Trail heading memory (EMA time constant, s) and the reversal limit (cos 100 deg). */
const TRAIL_HEADING_TAU_S = 2;
const TRAIL_NO_REVERSE_COS = Math.cos((100 * Math.PI) / 180);

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

/** Weight of a trail reading at p: `inside` within any avoid disc, else 1. */
function avoidWeight(discs: readonly CostDisc[] | null, p: Vec3, inside: number): number {
  if (!discs) return 1;
  for (let i = 0; i < discs.length; i++) {
    const d = discs[i], dx = p.x - d.x, dz = p.z - d.z;
    if (dx * dx + dz * dz <= d.r * d.r) return inside;
  }
  return 1;
}

/** The first avoid disc containing p, or null. */
function discAt(discs: readonly CostDisc[], p: Vec3): CostDisc | null {
  for (let i = 0; i < discs.length; i++) {
    const d = discs[i], dx = p.x - d.x, dz = p.z - d.z;
    if (dx * dx + dz * dz <= d.r * d.r) return d;
  }
  return null;
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
  // GDD 02 §12.2: inside the colony's avoid discs an autonomous ant follows a trail at weight x 0.1
  const discs = isAutonomousAnt(w) ? avoidDiscs(sim, r, (w as Ant).colony) : null;
  const rawL = phero.sample(col, ch, sensor(_l, w, P.antAngle, P.antReach));
  const rawC = phero.sample(col, ch, sensor(_c, w, 0, P.antReach));
  const rawR = phero.sample(col, ch, sensor(_rr, w, -P.antAngle, P.antReach));
  const L = rawL * avoidWeight(discs, _l, P.avoidTrailW), C = rawC * avoidWeight(discs, _c, P.avoidTrailW);
  const R = rawR * avoidWeight(discs, _rr, P.avoidTrailW);
  const best = Math.max(L, C, R);
  if (best < P.trailDetect && discs && Math.max(rawL, rawC, rawR) >= P.trailDetect) {
    // the trail goes on, but into an avoid disc where it hardly counts: no gap crossing into the disc, the walker
    // turns out of it by the shortest way instead (GDD 02 §12.2) and loses the trail unless it finds it outside
    const d = discAt(discs, _c);
    if (d) { set3(out, w.pos.x - d.x, 0, w.pos.z - d.z); return 0; }
  }
  if (best < P.trailDetect) {
    // a gap: go on along the recent trail heading (the average of the last second, not the momentary zig-zag)
    // so short breaks are crossed; bends are taken while still on the trail
    if (s.lastDir.x * s.lastDir.x + s.lastDir.y * s.lastDir.y + s.lastDir.z * s.lastDir.z > 1e-6) set3(out, s.lastDir.x, s.lastDir.y, s.lastDir.z);
    else set3(out, w.fwd.x, w.fwd.y, w.fwd.z);
    return 0;
  }
  // GDD 02 §8.4 steering law on the side antennae (the centre one only tells strength: steering on it makes
  // walkers orbit cell peaks): omega = gain (L - R) / (L + R + 1), integrated over this step's dt, as a heading
  // offset that the walker's turn-rate limit then smooths.
  const turn = (P.trailGain * dt * (L - R)) / (L + R + 1) + noiseGauss(id, tick, 11) * P.trailNoise * Math.sqrt(dt);
  rotateTangent(out, w.fwd, w.up, turn);
  // no reversals while following: keep within 100 deg of the recent trail heading
  const lx = s.lastDir.x, ly = s.lastDir.y, lz = s.lastDir.z, ll = Math.hypot(lx, ly, lz);
  if (ll > 1e-6 && (out.x * lx + out.y * ly + out.z * lz) / ll < TRAIL_NO_REVERSE_COS) set3(out, w.fwd.x, w.fwd.y, w.fwd.z);
  const k = Math.min(1, dt / TRAIL_HEADING_TAU_S);
  s.lastDir.x += (w.fwd.x - lx) * k; s.lastDir.y += (w.fwd.y - ly) * k; s.lastDir.z += (w.fwd.z - lz) * k;
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
  // on a steep face (a stem, a trunk, a wall) the crumbs lie along the way the ant climbed: aim at them in 3D, or a
  // plan-view aim circles the stem and never comes down (loco-fix3: tenders lost on a shrub at suburban-garden #2)
  if (ant.medium === 'surface' && Math.abs(ant.up.y) >= r.P.pinnedUpY) set3(out, _c.x - ant.pos.x, 0, _c.z - ant.pos.z);
  else set3(out, _c.x - ant.pos.x, _c.y - ant.pos.y, _c.z - ant.pos.z);
  return true;
}
