/**
 * Third-person camera rig (pure math, no three): orbit defined in the ant's SMOOTHED local frame.
 *
 * - The rig keeps its own reference heading `ref` in the tangent plane; every update it is parallel-transported by
 *   the rotation previous-upVis -> upVis (same operator as the walker), so floor -> wall -> ceiling transitions never
 *   spin the camera. Mouse orbit rotates `ref` about upVis (yaw) and changes `pitch`. Optional auto-follow eases
 *   `ref` toward the ant heading when the player is moving and has not touched the mouse recently.
 * - Collision: sphere trace of the field f from the focus point toward the desired camera position (camera sphere
 *   radius `radius`); pull-in is instant, easing back out is slow.
 * - Tunnels: a "roominess" probe (short sphere traces in 7 directions) blends distance, FOV and pitch from surface
 *   values to tunnel values.
 * - Near plane from the camera's clearance f(camera) so the frustum's near corners never cross geometry.
 * - antOpacity fades the possessed ant out when the camera is very close.
 */
import { Field } from './field';
import {
  type Vec3, v3, copy, addScaled, dot, normalize, rotateMinimal, rotateAxis, projectOnPlane, cross, scale, set,
} from './vec3';

export interface CamParams {
  distSurface: number; distTunnel: number; minDist: number;
  fovSurface: number; fovTunnel: number; // degrees (vertical)
  pitchSurface: number; pitchTunnel: number; // default pitch (rad) above the tangent plane
  radius: number; focusHeight: number;
  easeOutTau: number; tunnelTau: number; followRate: number; followDelay: number;
  roomOpen: number; roomTight: number; // mm: probe average above roomOpen => surface, below roomTight => tunnel
  nearMin: number; nearMax: number; far: number;
  fadeStart: number; fadeEnd: number;
}

export const DEFAULT_CAM: CamParams = {
  distSurface: 26, distTunnel: 6.5, minDist: 0.9,
  fovSurface: 50, fovTunnel: 80,
  pitchSurface: 0.42, pitchTunnel: 0.22,
  radius: 0.3, focusHeight: 1.1,
  easeOutTau: 0.35, tunnelTau: 0.35, followRate: 2.2, followDelay: 1.2,
  roomOpen: 26, roomTight: 9,
  nearMin: 0.03, nearMax: 1.0, far: 4000,
  fadeStart: 3.2, fadeEnd: 1.3,
};

export interface CamOutput {
  pos: Vec3; target: Vec3; up: Vec3; fov: number; near: number; far: number; antOpacity: number;
  dist: number; desired: number; tunnel: number;
}

const _a = v3(), _b = v3(), _r = v3();

export class CameraRig {
  readonly p: CamParams;
  ref = v3(1, 0, 0);
  prevUp = v3(0, 1, 0);
  /** user offsets */
  pitchOffset = 0; zoom = 1;
  dist = 20; tunnel = 0; sinceOrbit = 99;
  out: CamOutput = { pos: v3(), target: v3(), up: v3(0, 1, 0), fov: 50, near: 0.1, far: 4000, antOpacity: 1, dist: 20, desired: 20, tunnel: 0 };
  initialised = false;

  constructor(params: CamParams = DEFAULT_CAM) { this.p = params; }

  orbit(dYaw: number, dPitch: number): void {
    rotateAxis(this.ref, this.ref, this.prevUp, dYaw);
    this.pitchOffset = Math.max(-0.9, Math.min(1.1, this.pitchOffset + dPitch));
    this.sinceOrbit = 0;
  }
  zoomBy(f: number): void { this.zoom = Math.max(0.15, Math.min(4, this.zoom * f)); }

  /** snap behind the ant (after teleport) */
  reset(up: Vec3, fwd: Vec3): void {
    copy(this.prevUp, up); copy(this.ref, fwd); this.initialised = false;
  }

  /** probe how much free space surrounds the focus (mm, averaged over 7 short sphere traces) */
  roominess(F: Field, f: Vec3, up: Vec3, fwd: Vec3): number {
    cross(_r, fwd, up); // right
    const dirs: [number, number, number][] = [[0, 1, 0], [1, 0.4, 0], [-1, 0.4, 0], [0, 0.4, -1], [0, 0.4, 1], [0.7, 0.7, -0.7], [-0.7, 0.7, -0.7]];
    const L = this.p.roomOpen * 1.5;
    let s = 0;
    for (const [rx, uy, fz] of dirs) {
      set(_a, _r.x * rx + up.x * uy + fwd.x * fz, _r.y * rx + up.y * uy + fwd.y * fz, _r.z * rx + up.z * uy + fwd.z * fz);
      normalize(_a, _a);
      s += F.sphereTrace(f.x, f.y, f.z, _a.x, _a.y, _a.z, L, 0.2);
    }
    return s / dirs.length;
  }

  update(dt: number, F: Field, antPos: Vec3, upVis: Vec3, fwdVis: Vec3, moving: boolean, follow = true): CamOutput {
    const P = this.p, o = this.out;
    if (!this.initialised) { copy(this.prevUp, upVis); copy(this.ref, fwdVis); }
    // parallel transport of the reference heading with the smoothed up
    rotateMinimal(this.ref, this.ref, this.prevUp, upVis);
    projectOnPlane(this.ref, this.ref, upVis);
    if (dot(this.ref, this.ref) < 1e-8) copy(this.ref, fwdVis);
    normalize(this.ref, this.ref);
    copy(this.prevUp, upVis);
    // auto-follow toward the ant heading
    this.sinceOrbit += dt;
    if (follow && moving && this.sinceOrbit > P.followDelay) {
      cross(_a, this.ref, fwdVis);
      const ang = Math.atan2(dot(_a, upVis), dot(this.ref, fwdVis));
      const maxA = P.followRate * dt;
      rotateAxis(this.ref, this.ref, upVis, Math.max(-maxA, Math.min(maxA, ang)));
    }
    // focus point: above the ant along up, limited by headroom
    const headroom = F.sphereTrace(antPos.x, antPos.y, antPos.z, upVis.x, upVis.y, upVis.z, P.focusHeight + P.radius, 0.05);
    const fh = Math.max(0.2, Math.min(P.focusHeight, headroom - P.radius));
    addScaled(o.target, antPos, upVis, fh);
    // tunnel-ness
    const room = this.roominess(F, o.target, upVis, this.ref);
    const tTarget = Math.max(0, Math.min(1, (P.roomOpen - room) / (P.roomOpen - P.roomTight)));
    if (!this.initialised) this.tunnel = tTarget;
    else this.tunnel += (tTarget - this.tunnel) * (1 - Math.exp(-dt / P.tunnelTau));
    const tn = this.tunnel;
    const desired = (P.distSurface + (P.distTunnel - P.distSurface) * tn) * this.zoom;
    const pitch = Math.max(-1.2, Math.min(1.45, P.pitchSurface + (P.pitchTunnel - P.pitchSurface) * tn + this.pitchOffset));
    // camera direction: behind (-ref) and above (up)
    scale(_b, this.ref, -Math.cos(pitch));
    addScaled(_b, _b, upVis, Math.sin(pitch));
    normalize(_b, _b);
    const hit = F.sphereTrace(o.target.x, o.target.y, o.target.z, _b.x, _b.y, _b.z, desired, P.radius);
    const allowed = Math.max(P.minDist * 0.5, Math.min(desired, hit - 0.05));
    if (!this.initialised || allowed < this.dist) this.dist = allowed;
    else this.dist += (allowed - this.dist) * (1 - Math.exp(-dt / P.easeOutTau));
    addScaled(o.pos, o.target, _b, this.dist);
    copy(o.up, upVis);
    // FOV widens in tunnels and when pulled in hard
    const squeeze = Math.max(0, Math.min(1, 1 - this.dist / Math.max(1e-3, desired)));
    o.fov = P.fovSurface + (P.fovTunnel - P.fovSurface) * Math.max(tn, squeeze * 0.6);
    // near plane from clearance: corners of the near rectangle are ~1.9 * near away at fov 80 / 16:9
    const clearance = F.f(o.pos.x, o.pos.y, o.pos.z);
    o.near = Math.max(P.nearMin, Math.min(P.nearMax, 0.45 * clearance, this.dist * 0.4));
    o.far = P.far;
    const dAnt = Math.hypot(o.pos.x - antPos.x, o.pos.y - antPos.y, o.pos.z - antPos.z);
    const u = Math.max(0, Math.min(1, (dAnt - P.fadeEnd) / (P.fadeStart - P.fadeEnd)));
    o.antOpacity = 0.12 + 0.88 * u * u * (3 - 2 * u);
    o.dist = this.dist; o.desired = desired; o.tunnel = tn;
    this.initialised = true;
    return o;
  }
}

