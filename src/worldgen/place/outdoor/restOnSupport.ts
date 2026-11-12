// Resting an object flat on paving (commit's atGround 'support'): the kit's fitted rest samples the support at the
// centre and four corners, and a sample that falls into a 3-10 mm slab joint sinks a leg or a mat into the slabs
// (refused as an overlap) or leaves the lowest primitive over the joint (dropped by v-rest). Here the support plane
// is fitted over a lattice of joint-free samples (each the highest top within a joint's width), the template is
// tilted to that plane, and the object is refused when a foot (a primitive within 1 mm of the lowest) would stand
// over a joint. Callers retry nearby.

import type { Quat } from '@/core/math/quat';
import { quatFromUnitVectors, quatMultiply, quatRotateVec3 } from '@/core/math/quat';
import type { Vec3 } from '@/core/math/vec3';
import type { GenContext } from '../../kit/context';
import type { PrimSpec } from '../../kit/template';
import { supportAt } from '../../kit/surface';
import { dcos, dsin } from '../../kit/dmath';
import type { Built } from '../../catalog/outdoor/types';
import { OUTDOOR } from './tuning';

const UP: Vec3 = { x: 0, y: 1, z: 0 };

/** Local axis-aligned bounding box of a template primitive (its rotation applied to the shape's local box). */
export function primBox(p: PrimSpec): { min: Vec3; max: Vec3 } {
  const r = p.size.x;
  const h = p.shape === 'box' || p.shape === 'ellipsoid' ? p.size : p.shape === 'capsule' ? { x: r, y: p.size.y + r, z: r } : { x: r, y: p.size.y, z: r };
  const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const c0 = { x: sx * h.x, y: sy * h.y, z: sz * h.z };
    const c = p.rot ? quatRotateVec3({ x: 0, y: 0, z: 0 }, p.rot, c0) : c0;
    min.x = Math.min(min.x, p.pos.x + c.x); min.y = Math.min(min.y, p.pos.y + c.y); min.z = Math.min(min.z, p.pos.z + c.z);
    max.x = Math.max(max.x, p.pos.x + c.x); max.y = Math.max(max.y, p.pos.y + c.y); max.z = Math.max(max.z, p.pos.z + c.z);
  }
  return { min, max };
}

/** Least-squares plane h = a + b x + c z through the samples. */
function fitPlane(pts: { x: number; z: number; h: number }[]): { a: number; b: number; c: number } {
  let n = 0, sx = 0, sz = 0, sh = 0;
  for (const p of pts) { n++; sx += p.x; sz += p.z; sh += p.h; }
  const mx = sx / n, mz = sz / n, mh = sh / n;
  let xx = 0, zz = 0, xz = 0, xh = 0, zh = 0;
  for (const p of pts) {
    const dx = p.x - mx, dz = p.z - mz, dh = p.h - mh;
    xx += dx * dx; zz += dz * dz; xz += dx * dz; xh += dx * dh; zh += dz * dh;
  }
  const det = xx * zz - xz * xz;
  if (!(Math.abs(det) > 1e-9)) return { a: mh, b: 0, c: 0 };
  const b = (xh * zz - zh * xz) / det, c = (zh * xx - xh * xz) / det;
  return { a: mh - b * mx - c * mz, b, c };
}

function tiltPoint(q: Quat, p: Vec3): Vec3 {
  return quatRotateVec3({ x: 0, y: 0, z: 0 }, q, p);
}

/** A copy of `b` rotated by q about the template origin (primitives, routes, POIs, water bodies). */
function tiltBuilt(b: Built, q: Quat): Built {
  const prims = b.tpl.prims.map((p) => {
    const rot = quatMultiply({ x: 0, y: 0, z: 0, w: 1 }, q, p.rot ?? { x: 0, y: 0, z: 0, w: 1 });
    return { ...p, pos: tiltPoint(q, p.pos), rot };
  });
  const routes = b.tpl.routes?.map((r) => ({ ...r, points: r.points.map((p) => tiltPoint(q, p)) }));
  const pois = b.tpl.pois?.map((p) => ({ ...p, pos: tiltPoint(q, p.pos) }));
  const water = b.water?.map((w) => ({ ...w, pos: tiltPoint(q, w.pos) }));
  return { ...b, tpl: { ...b.tpl, prims, ...(routes ? { routes } : {}), ...(pois ? { pois } : {}) }, ...(water ? { water } : {}) };
}

/**
 * The object `b` at (x, z, yaw) tilted onto the paving under it and its base height, or null when a foot would stand
 * over a joint (or the support is too steep). Objects with carved sockets or terrain holes are not tilted.
 */
export function restOnSupport(ctx: GenContext, b: Built, x: number, z: number, yaw: number, belowY: number): { b: Built; y: number } | null {
  const S = OUTDOOR.support;
  const c = dcos(yaw), s = dsin(yaw);
  const world = (lx: number, lz: number) => ({ x: x + lx * c + lz * s, z: z - lx * s + lz * c });
  const exact = (lx: number, lz: number) => { const w = world(lx, lz); return supportAt(ctx, w.x, w.z, belowY); };
  // the highest top within a joint's width: a sample over a joint reads the slab beside it
  const robust = (lx: number, lz: number) => {
    let h = -Infinity;
    for (const dx of [-S.jointMm, 0, S.jointMm]) for (const dz of [-S.jointMm, 0, S.jointMm]) h = Math.max(h, exact(lx + dx, lz + dz));
    return h;
  };
  const boxes = b.tpl.prims.map(primBox);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, low = Infinity;
  for (const q of boxes) {
    x0 = Math.min(x0, q.min.x); x1 = Math.max(x1, q.max.x); z0 = Math.min(z0, q.min.z); z1 = Math.max(z1, q.max.z);
    low = Math.min(low, q.min.y);
  }
  const N = S.lattice, pts: { x: number; z: number; h: number }[] = [];
  for (let i = 0; i < N; i++) for (let k = 0; k < N; k++) {
    const lx = x0 + ((x1 - x0) * i) / (N - 1), lz = z0 + ((z1 - z0) * k) / (N - 1);
    pts.push({ x: lx, z: lz, h: robust(lx, lz) });
  }
  const pl = fitPlane(pts);
  if (Math.sqrt(pl.b * pl.b + pl.c * pl.c) > S.maxSlope) return null;
  const sockets = (b.cavities?.length ?? 0) + (b.micro?.length ?? 0) + (b.holes?.length ?? 0) > 0 || !!b.mound;
  const n = { x: -pl.b, y: 1, z: -pl.c };
  const l = Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z);
  const q = sockets ? { x: 0, y: 0, z: 0, w: 1 } : quatFromUnitVectors({ x: 0, y: 0, z: 0, w: 1 }, UP, { x: n.x / l, y: n.y / l, z: n.z / l });
  const out = sockets ? b : tiltBuilt(b, q);
  // every foot's bottom centre must stand on a top: the base height each foot asks for must agree within 1 mm
  const need: number[] = [];
  b.tpl.prims.forEach((p, i) => {
    if (boxes[i].min.y > low + S.footTolMm) return;
    const f = tiltPoint(q, { x: p.pos.x, y: boxes[i].min.y, z: p.pos.z });
    need.push(exact(f.x, f.z) - f.y);
  });
  const y = Math.max(...need);
  if (need.some((h) => h < y - S.footTolMm)) return null;
  return { b: out, y };
}
