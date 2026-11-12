/**
 * Third-person camera rig for the kernel demo: the nest spike's rig (spikes/nest/sim/camera-rig.ts) ported onto the
 * production WorldField. Orbit in the ant's smoothed frame with a parallel-transported reference heading, sphere-trace
 * collision, tunnel adaptation from a 7-ray roominess probe, near plane from clearance, ant fade.
 */
import type { Vec3 } from '@/core/math/vec3';
import type { WorldField } from '@/sim/world/field';
import { addScaled, copy, cross, dot, normalize, projectOnPlane, rotateAxis, rotateMinimal, scale, set, v3 } from './vec';

export const CAM = {
  distSurface: 26, distTunnel: 6.5, minDist: 0.9, fovSurface: 50, fovTunnel: 80, pitchSurface: 0.42, pitchTunnel: 0.22,
  radius: 0.3, focusHeight: 1.1, easeOutTau: 0.35, tunnelTau: 0.35, roomOpen: 26, roomTight: 9,
  nearMin: 0.03, nearMax: 1.0, far: 4000, fadeStart: 3.2, fadeEnd: 1.3,
};

export interface CamOutput { pos: Vec3; target: Vec3; up: Vec3; fov: number; near: number; far: number; antOpacity: number; dist: number; tunnel: number }

const _a = v3(), _b = v3(), _r = v3();
const DIRS: [number, number, number][] = [[0, 1, 0], [1, 0.4, 0], [-1, 0.4, 0], [0, 0.4, -1], [0, 0.4, 1], [0.7, 0.7, -0.7], [-0.7, 0.7, -0.7]];

export class CameraRig {
  ref = v3(1, 0, 0);
  prevUp = v3(0, 1, 0);
  pitchOffset = 0; zoom = 1; dist = 20; tunnel = 0;
  out: CamOutput = { pos: v3(), target: v3(), up: v3(0, 1, 0), fov: 50, near: 0.1, far: 4000, antOpacity: 1, dist: 20, tunnel: 0 };
  private initialised = false;

  orbit(dYaw: number, dPitch: number): void {
    rotateAxis(this.ref, this.ref, this.prevUp, dYaw);
    this.pitchOffset = Math.max(-0.9, Math.min(1.1, this.pitchOffset + dPitch));
  }

  reset(up: Vec3, fwd: Vec3): void { copy(this.prevUp, up); copy(this.ref, fwd); this.initialised = false; }

  private roominess(F: WorldField, f: Vec3, up: Vec3, fwd: Vec3): number {
    cross(_r, fwd, up);
    let s = 0;
    for (const [rx, uy, fz] of DIRS) {
      set(_a, _r.x * rx + up.x * uy + fwd.x * fz, _r.y * rx + up.y * uy + fwd.y * fz, _r.z * rx + up.z * uy + fwd.z * fz);
      normalize(_a, _a);
      s += F.sphereTrace(f, _a, CAM.roomOpen * 1.5, 0.2);
    }
    return s / DIRS.length;
  }

  update(dt: number, F: WorldField, antPos: Vec3, upVis: Vec3, fwdVis: Vec3): CamOutput {
    const P = CAM, o = this.out;
    if (!this.initialised) { copy(this.prevUp, upVis); copy(this.ref, fwdVis); }
    rotateMinimal(this.ref, this.ref, this.prevUp, upVis);
    projectOnPlane(this.ref, this.ref, upVis);
    if (dot(this.ref, this.ref) < 1e-8) copy(this.ref, fwdVis);
    normalize(this.ref, this.ref);
    copy(this.prevUp, upVis);
    const headroom = F.sphereTrace(antPos, upVis, P.focusHeight + P.radius, 0.05);
    const fh = Math.max(0.2, Math.min(P.focusHeight, headroom - P.radius));
    addScaled(o.target, antPos, upVis, fh);
    const room = this.roominess(F, o.target, upVis, this.ref);
    const tTarget = Math.max(0, Math.min(1, (P.roomOpen - room) / (P.roomOpen - P.roomTight)));
    if (!this.initialised) this.tunnel = tTarget;
    else this.tunnel += (tTarget - this.tunnel) * (1 - Math.exp(-dt / P.tunnelTau));
    const tn = this.tunnel;
    const desired = (P.distSurface + (P.distTunnel - P.distSurface) * tn) * this.zoom;
    const pitch = Math.max(-1.2, Math.min(1.45, P.pitchSurface + (P.pitchTunnel - P.pitchSurface) * tn + this.pitchOffset));
    scale(_b, this.ref, -Math.cos(pitch));
    addScaled(_b, _b, upVis, Math.sin(pitch));
    normalize(_b, _b);
    const hit = F.sphereTrace(o.target, _b, desired, P.radius);
    const allowed = Math.max(P.minDist * 0.5, Math.min(desired, hit - 0.05));
    if (!this.initialised || allowed < this.dist) this.dist = allowed;
    else this.dist += (allowed - this.dist) * (1 - Math.exp(-dt / P.easeOutTau));
    addScaled(o.pos, o.target, _b, this.dist);
    copy(o.up, upVis);
    const squeeze = Math.max(0, Math.min(1, 1 - this.dist / Math.max(1e-3, desired)));
    o.fov = P.fovSurface + (P.fovTunnel - P.fovSurface) * Math.max(tn, squeeze * 0.6);
    const clearance = F.sample(o.pos);
    o.near = Math.max(P.nearMin, Math.min(P.nearMax, 0.45 * clearance, this.dist * 0.4));
    o.far = P.far;
    const dAnt = Math.hypot(o.pos.x - antPos.x, o.pos.y - antPos.y, o.pos.z - antPos.z);
    const u = Math.max(0, Math.min(1, (dAnt - P.fadeEnd) / (P.fadeStart - P.fadeEnd)));
    o.antOpacity = 0.12 + 0.88 * u * u * (3 - 2 * u);
    o.dist = this.dist; o.tunnel = tn;
    this.initialised = true;
    return o;
  }
}
