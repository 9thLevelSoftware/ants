// Pose helpers shared by the debug renderers: tick interpolation of a walker and an orthonormal model matrix
// from (pos, up, fwd). Model frame: +X forward, +Y up, +Z right (forward x up), right-handed.
import type { Matrix4 } from 'three';
import type { Vec3 } from '@/core';

export interface PoseOut {
  pos: Vec3;
  up: Vec3;
  fwd: Vec3;
}

export interface WalkerLike {
  pos: Vec3; up: Vec3; fwd: Vec3;
  prevPos: Vec3; prevUp: Vec3; prevFwd: Vec3;
}

export function newPose(): PoseOut {
  return { pos: { x: 0, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, fwd: { x: 1, y: 0, z: 0 } };
}

/** Interpolates prev -> current by alpha; a jump longer than `snapMm` (teleport, placement) shows the current pose. */
export function interpolateWalker(out: PoseOut, w: WalkerLike, alpha: number, snapMm: number): PoseOut {
  const dx = w.pos.x - w.prevPos.x, dy = w.pos.y - w.prevPos.y, dz = w.pos.z - w.prevPos.z;
  const a = dx * dx + dy * dy + dz * dz > snapMm * snapMm ? 1 : Math.min(1, Math.max(0, alpha));
  const b = 1 - a;
  out.pos.x = w.prevPos.x * b + w.pos.x * a; out.pos.y = w.prevPos.y * b + w.pos.y * a; out.pos.z = w.prevPos.z * b + w.pos.z * a;
  out.up.x = w.prevUp.x * b + w.up.x * a; out.up.y = w.prevUp.y * b + w.up.y * a; out.up.z = w.prevUp.z * b + w.up.z * a;
  out.fwd.x = w.prevFwd.x * b + w.fwd.x * a; out.fwd.y = w.prevFwd.y * b + w.fwd.y * a; out.fwd.z = w.prevFwd.z * b + w.fwd.z * a;
  return out;
}

export function copyPose(out: PoseOut, p: PoseOut): PoseOut {
  out.pos.x = p.pos.x; out.pos.y = p.pos.y; out.pos.z = p.pos.z;
  out.up.x = p.up.x; out.up.y = p.up.y; out.up.z = p.up.z;
  out.fwd.x = p.fwd.x; out.fwd.y = p.fwd.y; out.fwd.z = p.fwd.z;
  return out;
}

/**
 * Writes a model matrix: origin at `pos` + `up` x `lift`, axes (fwd, up, right) orthonormalised, scaled uniformly by
 * `scale`. A degenerate frame falls back to world up / +X.
 */
export function poseMatrix(m: Matrix4, p: PoseOut, lift: number, scale: number): Matrix4 {
  let ux = p.up.x, uy = p.up.y, uz = p.up.z;
  let ul = Math.hypot(ux, uy, uz);
  if (ul < 1e-9) { ux = 0; uy = 1; uz = 0; ul = 1; }
  ux /= ul; uy /= ul; uz /= ul;
  const d = p.fwd.x * ux + p.fwd.y * uy + p.fwd.z * uz;
  let fx = p.fwd.x - d * ux, fy = p.fwd.y - d * uy, fz = p.fwd.z - d * uz;
  let fl = Math.hypot(fx, fy, fz);
  if (fl < 1e-9) {
    // forward parallel to up: pick any tangent
    const useX = Math.abs(ux) < 0.9;
    fx = useX ? 1 : 0; fy = 0; fz = useX ? 0 : 1;
    const e = fx * ux + fy * uy + fz * uz;
    fx -= e * ux; fy -= e * uy; fz -= e * uz;
    fl = Math.hypot(fx, fy, fz);
  }
  fx /= fl; fy /= fl; fz /= fl;
  const rx = fy * uz - fz * uy, ry = fz * ux - fx * uz, rz = fx * uy - fy * ux; // fwd x up = right
  const s = scale;
  m.set(
    fx * s, ux * s, rx * s, p.pos.x + ux * lift,
    fy * s, uy * s, ry * s, p.pos.y + uy * lift,
    fz * s, uz * s, rz * s, p.pos.z + uz * lift,
    0, 0, 0, 1,
  );
  return m;
}
