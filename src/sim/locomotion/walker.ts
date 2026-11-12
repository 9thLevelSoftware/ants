// Surface walker: one controller for ground, walls, ceilings, stems, table undersides and tunnels
// (docs/01-design-seed.md §3). A walker lives on the level set f(p) = footOffset of the world field.
//
// Per substep (length <= half a voxel):
//   1. tangent step       c = pos + fwd * s
//   2. re-projection      Newton onto f = footOffset (step clamped to 1.5 s + slack)
//   3. sanity checks      chord length plausible, chord midpoint in free space, normal turned < 110 degrees;
//                         otherwise halve s (3 times) and finally report 'blocked' (no tunnelling, no flips)
//   4. parallel transport fwd <- R(up -> n) fwd, re-orthogonalised; up <- n
// Falling ("let go") is ballistic with linear drag, swept against f by sphere tracing; on contact the walker
// re-projects and keeps its heading projected onto the new tangent plane.
//
// Guarantees: never ends a step inside a solid (f >= 0.3 footOffset, else the step is reverted and 'failed' is
// returned), never writes NaN (bad inputs are ignored), recovers from failed projections by letting go.
// Pure and allocation-free. The kernel never sets medium 'water' (locomotion may, after the step).

import type { Vec3 } from '@/core/math/vec3';
import type { WorldField } from '@/sim/world/field';
import { walkerParamsForBU as walkerParamsForBUImp, type WalkerParams } from './walkerParams';
import { anyPerp as anyPerpImp, finite3 as finite3Imp, rotateMinimal as rotateMinimalImp, tangentOf as tangentOfImp } from './walkerMath';

// Hot imports re-bound as local consts: under Vitest (vite-node) an imported binding is read through a getter
// on a module object, several times slower in tight loops; in the browser build both forms are equivalent.
const walkerParamsForBU = walkerParamsForBUImp, anyPerp = anyPerpImp, finite3 = finite3Imp, rotateMinimal = rotateMinimalImp, tangentOf = tangentOfImp;

export type WalkerMediumKind = 'surface' | 'cavity' | 'air' | 'water';

/** Structural kinematics (matches the contracts' Walker without nav/radius). Lengths mm, speeds mm/s. */
export interface WalkerKin {
  /** On the level set f = footOffset. */
  pos: Vec3;
  /** Unit surface normal. */
  up: Vec3;
  /** Unit tangent heading. */
  fwd: Vec3;
  /** Previous tick (render interpolation); written only by walkerSnapshot / walkerPlace. */
  prevPos: Vec3; prevUp: Vec3; prevFwd: Vec3;
  /** mm/s travelled in the last step. */
  speed: number;
  /** mm above the surface. */
  footOffset: number;
  medium: WalkerMediumKind;
  /** mm/s, used while medium === 'air'. */
  vel: Vec3;
  /** Stride phase 0..1. */
  gait: number;
}

/**
 * Result of a walker call:
 *  ok       moved (or stood) normally
 *  blocked  could not advance further this step (wall too sharp, thin sheet ahead): heading kept
 *  fell     lost the surface (projection failed after a change, or walked off into nothing): now falling
 *  falling  in the air
 *  landed   touched a surface this step and re-attached
 *  failed   nothing sensible was possible (no surface near, out of the world, invariant): state reverted
 */
export type WalkStatus = 'ok' | 'blocked' | 'fell' | 'falling' | 'landed' | 'failed';

export function createWalkerKin(footOffset: number): WalkerKin {
  const v = (x = 0, y = 0, z = 0) => ({ x, y, z });
  return {
    pos: v(), up: v(0, 1, 0), fwd: v(1, 0, 0), prevPos: v(), prevUp: v(0, 1, 0), prevFwd: v(1, 0, 0),
    speed: 0, footOffset, medium: 'surface', vel: v(), gait: 0,
  };
}

const z3 = (): Vec3 => ({ x: 0, y: 0, z: 0 });
const _c = z3(), _g = z3(), _n = z3(), _t = z3(), _d = z3();
const _p0 = z3(), _u0 = z3(), _f0 = z3(), _v0 = z3();
const DOWN: Vec3 = { x: 0, y: -1, z: 0 };

function dist3(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function paramsOf(field: WorldField, P?: WalkerParams): WalkerParams {
  return P ?? walkerParamsForBU(field.bu);
}

function footOf(w: WalkerKin, P: WalkerParams): number {
  return w.footOffset > 0 ? w.footOffset : P.footOffset;
}

/** Copies the current pose into prev* (call once at the start of every simulation tick). */
export function walkerSnapshot(w: WalkerKin): void {
  w.prevPos.x = w.pos.x; w.prevPos.y = w.pos.y; w.prevPos.z = w.pos.z;
  w.prevUp.x = w.up.x; w.prevUp.y = w.up.y; w.prevUp.z = w.up.z;
  w.prevFwd.x = w.fwd.x; w.prevFwd.y = w.fwd.y; w.prevFwd.z = w.fwd.z;
}

/** Local Newton projection of q onto f = foot (gradient at the result in _g). */
function projectLocal(field: WorldField, q: Vec3, foot: number, maxMove: number, tol: number, P: WalkerParams): boolean {
  return field.newtonProject(q, foot, maxMove, P.projIters, P.projTol, tol, _g);
}

function normalizeG(out: Vec3): boolean {
  const l = Math.sqrt(_g.x * _g.x + _g.y * _g.y + _g.z * _g.z);
  if (!(l > 1e-9)) return false;
  out.x = _g.x / l; out.y = _g.y / l; out.z = _g.z / l;
  return true;
}

/** Re-orients the walker to a new normal n by parallel transport and sets up = n. */
function transportTo(w: WalkerKin, n: Vec3): void {
  rotateMinimal(w.fwd, w.fwd, w.up, n);
  tangentOf(w.fwd, w.fwd, n);
  w.up.x = n.x; w.up.y = n.y; w.up.z = n.z;
}

function detectMedium(field: WorldField, w: WalkerKin): void {
  w.medium = field.isInSubstrate(w.pos.x, w.pos.y, w.pos.z) ? 'cavity' : 'surface';
}

function startFalling(w: WalkerKin): void {
  w.medium = 'air';
  w.vel.x = 0; w.vel.y = 0; w.vel.z = 0;
}

/**
 * Snaps the walker onto the nearest surface to `pos`. Where the field is flat or far (saturated cavity interior,
 * high above ground) it first sphere-traces along `opts.dir` (default straight down). The heading becomes the
 * tangent projection of `opts.heading` (default: the current fwd). Also resets prev*, vel, speed. Returns false
 * (walker unchanged) if no surface was found.
 */
export function walkerPlace(field: WorldField, w: WalkerKin, pos: Vec3, opts: { dir?: Vec3; heading?: Vec3 } = {}, params?: WalkerParams): boolean {
  const P = paramsOf(field, params), foot = footOf(w, P);
  if (!finite3(pos)) return false;
  _c.x = pos.x; _c.y = pos.y; _c.z = pos.z;
  const f = field.gradientXYZ(_c.x, _c.y, _c.z, _g);
  const gl = Math.sqrt(_g.x * _g.x + _g.y * _g.y + _g.z * _g.z);
  if (gl < 0.2 || f > 2.5 * foot) {
    const d = opts.dir ?? DOWN;
    const dl = Math.sqrt(d.x * d.x + d.y * d.y + d.z * d.z);
    if (dl > 1e-9) {
      _d.x = d.x / dl; _d.y = d.y / dl; _d.z = d.z / dl;
      const t = field.sphereTrace(_c, _d, P.placeTrace, foot);
      _c.x += _d.x * t; _c.y += _d.y * t; _c.z += _d.z * t;
    }
  }
  if (!field.project(_c, foot, _c, _n)) return false;
  w.pos.x = _c.x; w.pos.y = _c.y; w.pos.z = _c.z;
  const h = opts.heading ?? w.fwd;
  if (finite3(h)) tangentOf(w.fwd, h, _n); else anyPerp(w.fwd, _n);
  w.up.x = _n.x; w.up.y = _n.y; w.up.z = _n.z;
  w.vel.x = 0; w.vel.y = 0; w.vel.z = 0;
  w.speed = 0;
  detectMedium(field, w);
  walkerSnapshot(w);
  return true;
}

/** Detaches and starts a ballistic fall with a push (mm/s, default 6 BU/s) away from the surface. */
export function walkerLetGo(field: WorldField, w: WalkerKin, push?: number, params?: WalkerParams): void {
  if (w.medium === 'air') return;
  const s = push ?? paramsOf(field, params).letGoPush;
  w.medium = 'air';
  w.vel.x = w.up.x * s; w.vel.y = w.up.y * s; w.vel.z = w.up.z * s;
}

/**
 * Call after the field changed around the walker (carve, fill, moved primitive). Re-projects onto the level set;
 * if that is not possible within reattachMax the walker lets go (falls; a buried walker pops out on landing).
 * Returns true if it stayed attached.
 */
export function walkerSurfaceChanged(field: WorldField, w: WalkerKin, params?: WalkerParams): boolean {
  if (w.medium === 'air') return false;
  const P = paramsOf(field, params), foot = footOf(w, P);
  _c.x = w.pos.x; _c.y = w.pos.y; _c.z = w.pos.z;
  if (projectLocal(field, _c, foot, P.reattachMax, P.acceptTol, P) && normalizeG(_n)
    && dist3(_c, w.pos) <= P.reattachMax) {
    w.pos.x = _c.x; w.pos.y = _c.y; w.pos.z = _c.z;
    transportTo(w, _n);
    detectMedium(field, w);
    return true;
  }
  startFalling(w);
  return false;
}

/** Turns the heading towards the tangent part of a world direction (ignored if that part is too small). */
function steer(w: WalkerKin, d: Vec3, P: WalkerParams): void {
  if (!finite3(d)) return;
  const dl = Math.sqrt(d.x * d.x + d.y * d.y + d.z * d.z);
  if (!(dl > 1e-9)) return;
  const k = d.x * w.up.x + d.y * w.up.y + d.z * w.up.z;
  const tx = d.x - w.up.x * k, ty = d.y - w.up.y * k, tz = d.z - w.up.z * k;
  const tl = Math.sqrt(tx * tx + ty * ty + tz * tz);
  if (tl < P.minSteer * dl) return;
  w.fwd.x = tx / tl; w.fwd.y = ty / tl; w.fwd.z = tz / tl;
}

/**
 * Advances the walker for dt seconds at `speed` mm/s. On a surface: the heading turns to the tangent part of
 * desiredDir (null = keep the transported heading) and the walker moves speed * dt (at most maxStepDist) in
 * substeps. In the air: ballistic fall.
 * Updates pos/up/fwd/vel/speed/gait/medium (not prev*). See WalkStatus.
 */
export function walkerStep(field: WorldField, w: WalkerKin, desiredDir: Vec3 | null, speed: number, dt: number,
  params?: WalkerParams): WalkStatus {
  const P = paramsOf(field, params), foot = footOf(w, P);
  if (!(dt > 0) || !Number.isFinite(dt)) return 'ok';
  if (!finite3(w.pos) || !finite3(w.up) || !finite3(w.fwd)) return 'failed';
  _p0.x = w.pos.x; _p0.y = w.pos.y; _p0.z = w.pos.z;
  _u0.x = w.up.x; _u0.y = w.up.y; _u0.z = w.up.z;
  _f0.x = w.fwd.x; _f0.y = w.fwd.y; _f0.z = w.fwd.z;
  _v0.x = w.vel.x; _v0.y = w.vel.y; _v0.z = w.vel.z;
  const medium0 = w.medium, gait0 = w.gait;
  const status = w.medium === 'air' ? fallStep(field, w, dt, foot, P) : surfaceStep(field, w, desiredDir, speed, dt, foot, P);
  // invariant guard: never end inside a solid, never write NaN
  const ok = finite3(w.pos) && finite3(w.up) && finite3(w.fwd) && finite3(w.vel) && Number.isFinite(w.gait)
    && (w.medium === 'air' || field.isClear(w.pos.x, w.pos.y, w.pos.z, P.minClearanceFoot * foot));
  if (status === 'failed' || !ok) {
    w.pos.x = _p0.x; w.pos.y = _p0.y; w.pos.z = _p0.z;
    w.up.x = _u0.x; w.up.y = _u0.y; w.up.z = _u0.z;
    w.fwd.x = _f0.x; w.fwd.y = _f0.y; w.fwd.z = _f0.z;
    w.vel.x = _v0.x; w.vel.y = _v0.y; w.vel.z = _v0.z;
    w.medium = medium0; w.gait = gait0; w.speed = 0;
    return 'failed';
  }
  return status;
}

function surfaceStep(field: WorldField, w: WalkerKin, desiredDir: Vec3 | null, speed: number, dt: number, foot: number,
  P: WalkerParams): WalkStatus {
  // the surface may have changed under the walker (carve, fill, drift): re-attach or let go
  if (!field.isNearLevel(w.pos.x, w.pos.y, w.pos.z, foot, P.reprojTol) && !walkerSurfaceChanged(field, w, P)) {
    w.speed = 0;
    return 'fell';
  }
  if (desiredDir) steer(w, desiredDir, P);
  let remaining = Number.isFinite(speed) && speed > 0 ? speed * dt : 0;
  if (remaining > P.maxStepDist) remaining = P.maxStepDist; // bogus speed * dt must not stall the tick
  let moved = 0;
  let status: WalkStatus = 'ok';
  const pos = w.pos;
  while (remaining > 1e-9) {
    let s = Math.min(P.maxSubstep, remaining);
    let accepted = false, chord = 0;
    for (let attempt = 0; attempt <= P.substepRetries; attempt++) {
      _c.x = pos.x + w.fwd.x * s; _c.y = pos.y + w.fwd.y * s; _c.z = pos.z + w.fwd.z * s;
      if (projectLocal(field, _c, foot, 1.5 * s + P.projSlack, P.acceptTol, P) && normalizeG(_n)) {
        chord = dist3(_c, pos);
        const turn = _n.x * w.up.x + _n.y * w.up.y + _n.z * w.up.z;
        if (chord < P.chordFactor * s + P.chordSlack && turn > P.maxTurnCos
          && field.isClear((_c.x + pos.x) * 0.5, (_c.y + pos.y) * 0.5, (_c.z + pos.z) * 0.5, P.midMinFoot * foot)) { accepted = true; break; }
      }
      s *= 0.5;
    }
    if (!accepted) { status = 'blocked'; break; }
    transportTo(w, _n);
    pos.x = _c.x; pos.y = _c.y; pos.z = _c.z;
    remaining -= s;
    moved += chord;
  }
  w.speed = moved / dt;
  const g = w.gait + moved / P.stride;
  w.gait = g - Math.floor(g);
  detectMedium(field, w);
  return status;
}

function fallStep(field: WorldField, w: WalkerKin, dt: number, foot: number, P: WalkerParams): WalkStatus {
  const vel = w.vel;
  vel.y -= P.gravity * dt;
  const k = 1 / (1 + P.drag * dt);
  vel.x *= k; vel.y *= k; vel.z *= k;
  const sp = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
  w.speed = sp;
  const L = sp * dt;
  if (L > 1e-9) {
    _d.x = vel.x / sp; _d.y = vel.y / sp; _d.z = vel.z / sp;
    const t = field.sphereTrace(w.pos, _d, L, foot * P.fallRadiusFoot);
    w.pos.x += _d.x * t; w.pos.y += _d.y * t; w.pos.z += _d.z * t;
    if (t < L - 1e-6) return land(field, w, foot, P);
  }
  if (w.pos.y < field.minHeight - P.maxFallBelow) return 'failed';
  return 'falling';
}

/** March straight up out of a solid (buried walker) until f >= foot; pseudo-distances bound the steps. */
function escapeUp(field: WorldField, q: Vec3, foot: number, maxDist: number): boolean {
  const minStep = field.params.traceMinStep;
  for (let t = 0, it = 0; t < maxDist && it < 4096; it++) {
    const f = field.sampleXYZ(q.x, q.y, q.z);
    if (f >= foot) return true;
    const step = Math.max((foot - f) * 0.9, minStep);
    q.y += step;
    t += step;
  }
  return false;
}

function land(field: WorldField, w: WalkerKin, foot: number, P: WalkerParams): WalkStatus {
  _c.x = w.pos.x; _c.y = w.pos.y; _c.z = w.pos.z;
  if (!field.project(_c, foot, _c, _n)) {
    // buried (e.g. a fill closed over the walker): pop out upwards, then attach
    _c.x = w.pos.x; _c.y = w.pos.y; _c.z = w.pos.z;
    if (field.sampleXYZ(_c.x, _c.y, _c.z) >= foot || !escapeUp(field, _c, foot, P.placeTrace)) return 'failed';
    if (!field.project(_c, foot, _c, _n)) return 'failed';
  }
  w.pos.x = _c.x; w.pos.y = _c.y; w.pos.z = _c.z;
  // keep the heading: project onto the new tangent plane (the fall direction is a fallback)
  _t.x = w.fwd.x; _t.y = w.fwd.y; _t.z = w.fwd.z;
  const d = _t.x * _n.x + _t.y * _n.y + _t.z * _n.z;
  if (Math.abs(d) > 0.999) { _t.x = w.vel.x; _t.y = w.vel.y; _t.z = w.vel.z; }
  tangentOf(w.fwd, _t, _n);
  w.up.x = _n.x; w.up.y = _n.y; w.up.z = _n.z;
  w.vel.x = 0; w.vel.y = 0; w.vel.z = 0;
  detectMedium(field, w);
  return 'landed';
}
