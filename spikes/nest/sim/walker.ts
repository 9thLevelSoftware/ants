/**
 * SurfaceWalker: one controller for ground, walls, ceilings, stems, table undersides and tunnels.
 * The walker lives on the level set f(p) = footOffset of the field (docs/01-design-seed.md section 3).
 *
 * Per substep (length <= maxSubstep = half a voxel):
 *   1. tangent step:      c = p + fwd * s
 *   2. re-projection:     Newton iterations c -= (f(c) - footOffset) * grad / |grad|^2   (step length clamped)
 *   3. sanity checks:     moved distance plausible, segment midpoint in free space, normal turned < maxTurn
 *                         (otherwise halve s and retry; after 3 halvings the walker is "blocked" this frame)
 *   4. parallel transport: fwd <- R(up -> n') fwd, re-orthogonalised against n'; up <- n'
 * Visual frame (upVis, fwdVis) is exponentially smoothed for rendering and the camera; physics never reads it.
 * "Let go": ballistic fall with linear drag, swept against f by sphere tracing; on contact re-project and keep the
 * heading (projected onto the new tangent plane).
 *
 * Pure TypeScript (no three). Allocation-free in the step loop.
 */
import { Field } from './field';
import {
  type Vec3, v3, copy, addScaled, dot, normalize, rotateMinimal, rotateAxis, projectOnPlane, anyPerp, cross, set,
} from './vec3';

export interface WalkerParams {
  footOffset: number; // mm, body-centre height above the surface (level set value)
  maxSubstep: number; // mm, <= half a voxel
  projIters: number;
  projTol: number; // mm
  maxTurnCos: number; // reject a substep whose normal turns more than acos(maxTurnCos)
  upTau: number; // s, visual up smoothing time constant
  fwdTau: number; // s, visual forward smoothing
  gravity: number; // mm/s^2
  drag: number; // 1/s (terminal velocity = gravity / drag)
  speed: number; // mm/s at input 1
  turnRate: number; // rad/s at input 1
}

export const DEFAULT_WALKER: WalkerParams = {
  footOffset: 0.6, maxSubstep: 1.0, projIters: 6, projTol: 0.004, maxTurnCos: -0.35,
  upTau: 0.07, fwdTau: 0.05, gravity: 9810, drag: 14, speed: 48, turnRate: 3.5,
};

export interface WalkerInput {
  /** -1..1 along the heading */
  forward: number;
  /** -1..1, positive = turn left (counter-clockwise seen from above the surface) */
  turn: number;
  /** optional desired direction (world); the heading turns toward its tangent projection at turnRate */
  desired?: Vec3 | null;
}

const _c = v3(), _g = v3(), _n = v3(), _t = v3(), _m = v3(), _d = v3();

export class SurfaceWalker {
  readonly field: Field;
  readonly p: WalkerParams;
  pos = v3(); up = v3(0, 1, 0); fwd = v3(1, 0, 0);
  upVis = v3(0, 1, 0); fwdVis = v3(1, 0, 0);
  vel = v3();
  falling = false;
  blocked = false;
  /** stats */
  substeps = 0; rejects = 0;

  constructor(field: Field, params: WalkerParams = DEFAULT_WALKER) { this.field = field; this.p = params; }

  /** Newton projection of q onto f = footOffset (in place). Returns final |f - footOffset| (Infinity if degenerate). */
  project(q: Vec3, maxMove = 2.0): number {
    const F = this.field, foot = this.p.footOffset;
    let err = Infinity;
    for (let it = 0; it < this.p.projIters; it++) {
      const val = F.f(q.x, q.y, q.z) - foot;
      err = Math.abs(val);
      if (err < this.p.projTol) return err;
      const g = F.grad(q.x, q.y, q.z, _g);
      if (g < 1e-4) return Infinity;
      let s = -val / (g * g);
      const stepLen = Math.abs(s) * g;
      if (stepLen > maxMove) s *= maxMove / stepLen;
      addScaled(q, q, _g, s);
    }
    return Math.abs(F.f(q.x, q.y, q.z) - foot);
  }

  /**
   * Place the walker on the nearest surface to (x,y,z). If the field is flat there (saturated cavity interior or high
   * in the air) first sphere-trace along `dir` (default down). heading = angle about +Y for the initial forward.
   */
  place(x: number, y: number, z: number, heading = 0, dir: Vec3 = v3(0, -1, 0)): boolean {
    const F = this.field;
    set(_c, x, y, z);
    const g = F.grad(x, y, z, _g);
    const fv = F.f(x, y, z);
    if (g < 0.2 || fv > 1.5) {
      normalize(_d, dir);
      const t = F.sphereTrace(x, y, z, _d.x, _d.y, _d.z, 400, this.p.footOffset);
      addScaled(_c, _c, _d, t);
    }
    let err = Infinity;
    for (let k = 0; k < 6 && err > 0.02; k++) err = this.project(_c, 2.0);
    if (err > 0.05) return false;
    copy(this.pos, _c);
    F.normal(_c.x, _c.y, _c.z, this.up);
    set(_t, Math.cos(heading), 0, -Math.sin(heading));
    projectOnPlane(this.fwd, _t, this.up);
    if (dot(this.fwd, this.fwd) < 1e-6) anyPerp(this.fwd, this.up);
    normalize(this.fwd, this.fwd);
    copy(this.upVis, this.up); copy(this.fwdVis, this.fwd);
    this.falling = false; set(this.vel, 0, 0, 0);
    return true;
  }

  /** rotate the heading about the surface normal */
  turn(angle: number): void {
    rotateAxis(this.fwd, this.fwd, this.up, angle);
    projectOnPlane(this.fwd, this.fwd, this.up); normalize(this.fwd, this.fwd);
  }

  /** turn the heading toward the tangent projection of world direction d by at most maxAngle. Returns |proj|. */
  steerTowards(d: Vec3, maxAngle: number): number {
    projectOnPlane(_t, d, this.up);
    const l = Math.sqrt(dot(_t, _t));
    if (l < 1e-4) return 0;
    _t.x /= l; _t.y /= l; _t.z /= l;
    cross(_m, this.fwd, _t);
    const sin = dot(_m, this.up), cos = dot(this.fwd, _t);
    let a = Math.atan2(sin, cos);
    if (a > maxAngle) a = maxAngle; else if (a < -maxAngle) a = -maxAngle;
    this.turn(a);
    return l;
  }

  /** Move along the surface by signed distance d. Returns the distance actually covered. */
  move(d: number): number {
    const P = this.p, F = this.field;
    const sign = d < 0 ? -1 : 1;
    let remaining = Math.abs(d), covered = 0;
    this.blocked = false;
    while (remaining > 1e-6) {
      let s = Math.min(P.maxSubstep, remaining);
      let ok = false;
      for (let attempt = 0; attempt < 4; attempt++) {
        addScaled(_c, this.pos, this.fwd, s * sign);
        const err = this.project(_c, s * 1.5 + 0.2);
        if (err < 0.03) {
          const moved = Math.hypot(_c.x - this.pos.x, _c.y - this.pos.y, _c.z - this.pos.z);
          // midpoint of the chord must be in free space (catches projection onto the far side of a thin sheet)
          const fm = F.f((_c.x + this.pos.x) * 0.5, (_c.y + this.pos.y) * 0.5, (_c.z + this.pos.z) * 0.5);
          F.normal(_c.x, _c.y, _c.z, _n);
          if (moved < 2.5 * s + 0.1 && fm > 0.2 * P.footOffset && dot(_n, this.up) > P.maxTurnCos) { ok = true; break; }
        }
        this.rejects++;
        s *= 0.5;
      }
      this.substeps++;
      if (!ok) { this.blocked = true; break; }
      // parallel transport of the heading by the rotation old normal -> new normal
      rotateMinimal(this.fwd, this.fwd, this.up, _n);
      projectOnPlane(this.fwd, this.fwd, _n);
      if (dot(this.fwd, this.fwd) < 1e-8) anyPerp(this.fwd, _n);
      normalize(this.fwd, this.fwd);
      copy(this.up, _n);
      copy(this.pos, _c);
      remaining -= s; covered += s;
    }
    return covered * sign;
  }

  /** Detach and fall under gravity until the swept body touches a surface. */
  letGo(push = 25): void {
    if (this.falling) return;
    this.falling = true;
    addScaled(this.vel, v3(), this.up, push);
  }

  /** Advance one simulation step (dt seconds). */
  update(dt: number, input: WalkerInput): void {
    const P = this.p, F = this.field;
    if (this.falling) {
      // v' = g - drag v (semi-implicit)
      this.vel.y -= P.gravity * dt;
      const k = 1 / (1 + P.drag * dt);
      this.vel.x *= k; this.vel.y *= k; this.vel.z *= k;
      const sp = Math.hypot(this.vel.x, this.vel.y, this.vel.z);
      const L = sp * dt;
      if (L > 1e-6) {
        set(_d, this.vel.x / sp, this.vel.y / sp, this.vel.z / sp);
        const t = F.sphereTrace(this.pos.x, this.pos.y, this.pos.z, _d.x, _d.y, _d.z, L, P.footOffset * 0.98, 1.0, 0.01);
        addScaled(this.pos, this.pos, _d, t);
        if (t < L - 1e-6) this.land();
      }
    } else {
      if (input.desired) this.steerTowards(input.desired, P.turnRate * dt);
      if (input.turn) this.turn(input.turn * P.turnRate * dt);
      if (input.forward) this.move(input.forward * P.speed * dt);
      // the surface changed under the walker (dig/fill) or drifted: re-project; if that fails, fall
      const err = Math.abs(F.f(this.pos.x, this.pos.y, this.pos.z) - P.footOffset);
      if (err > 0.02) {
        copy(_c, this.pos);
        if (this.project(_c, 1.0) < 0.03) { copy(this.pos, _c); F.normal(_c.x, _c.y, _c.z, this.up); }
        else { this.falling = true; set(this.vel, 0, 0, 0); }
      }
    }
    this.smoothVisual(dt);
  }

  private land(): void {
    const F = this.field;
    copy(_c, this.pos);
    this.project(_c, 1.0);
    copy(this.pos, _c);
    F.normal(_c.x, _c.y, _c.z, this.up);
    projectOnPlane(this.fwd, this.fwd, this.up);
    if (dot(this.fwd, this.fwd) < 1e-6) { projectOnPlane(this.fwd, this.fwdVis, this.up); if (dot(this.fwd, this.fwd) < 1e-6) anyPerp(this.fwd, this.up); }
    normalize(this.fwd, this.fwd);
    this.falling = false; set(this.vel, 0, 0, 0);
  }

  smoothVisual(dt: number): void {
    const target = this.falling ? _m : this.up;
    if (this.falling) set(_m, 0, 1, 0);
    const a = 1 - Math.exp(-dt / this.p.upTau);
    // transport the visual heading with the visual up so it never swings through the surface
    copy(_t, this.upVis);
    this.upVis.x += (target.x - this.upVis.x) * a; this.upVis.y += (target.y - this.upVis.y) * a; this.upVis.z += (target.z - this.upVis.z) * a;
    if (dot(this.upVis, this.upVis) < 1e-6) copy(this.upVis, target);
    normalize(this.upVis, this.upVis);
    rotateMinimal(this.fwdVis, this.fwdVis, _t, this.upVis);
    const b = 1 - Math.exp(-dt / this.p.fwdTau);
    this.fwdVis.x += (this.fwd.x - this.fwdVis.x) * b; this.fwdVis.y += (this.fwd.y - this.fwdVis.y) * b; this.fwdVis.z += (this.fwd.z - this.fwdVis.z) * b;
    projectOnPlane(this.fwdVis, this.fwdVis, this.upVis);
    if (dot(this.fwdVis, this.fwdVis) < 1e-8) projectOnPlane(this.fwdVis, this.fwd, this.upVis);
    if (dot(this.fwdVis, this.fwdVis) < 1e-8) anyPerp(this.fwdVis, this.upVis);
    normalize(this.fwdVis, this.fwdVis);
  }

  /** call after the field changed around the walker (dig/fill): re-project or start falling */
  surfaceChanged(): void {
    if (this.falling) return;
    copy(_c, this.pos);
    if (this.project(_c, 1.5) < 0.03) {
      copy(this.pos, _c);
      this.field.normal(_c.x, _c.y, _c.z, _n);
      rotateMinimal(this.fwd, this.fwd, this.up, _n);
      projectOnPlane(this.fwd, this.fwd, _n);
      if (dot(this.fwd, this.fwd) < 1e-8) anyPerp(this.fwd, _n);
      normalize(this.fwd, this.fwd);
      copy(this.up, _n);
    } else { this.falling = true; set(this.vel, 0, 0, 0); }
  }

  /** snap the visual frame to the physical one (after teleports) */
  snapVisual(): void { copy(this.upVis, this.up); copy(this.fwdVis, this.fwd); }
}
