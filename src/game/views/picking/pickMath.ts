// Picking maths (GDD 01 §3.2): a ray through the cursor, ray-sphere / ray-ellipsoid tests, and the screen-size
// inflation that makes every pickable at least PICK_MIN_PX in radius. Pure (no three): the views layer fills a
// PickCamera from the rendered camera each frame.
import type { Vec3 } from '@/core';

/** GDD 01 §3.8: pick spheres are inflated to at least this screen radius. */
export const PICK_MIN_PX = 12;

/** The camera of the rendered frame, as picking needs it (unit basis vectors, world mm). */
export interface PickCamera {
  pos: Vec3;
  right: Vec3;
  up: Vec3;
  /** View direction (unit). */
  fwd: Vec3;
  /** tan(vertical FOV / 2). */
  tanHalfFov: number;
  /** Width / height. */
  aspect: number;
  /** Viewport height, CSS px (the cursor's units). */
  heightPx: number;
}

export interface Ray {
  o: Vec3;
  d: Vec3;
}

export function makeRay(): Ray {
  return { o: { x: 0, y: 0, z: 0 }, d: { x: 0, y: 0, z: 1 } };
}

/** Ray from the camera through normalised device coordinates (-1..1, y up). */
export function rayFromNdc(cam: PickCamera, ndcX: number, ndcY: number, out: Ray): Ray {
  const sx = ndcX * cam.tanHalfFov * cam.aspect, sy = ndcY * cam.tanHalfFov;
  const dx = cam.fwd.x + cam.right.x * sx + cam.up.x * sy;
  const dy = cam.fwd.y + cam.right.y * sx + cam.up.y * sy;
  const dz = cam.fwd.z + cam.right.z * sx + cam.up.z * sy;
  const l = Math.hypot(dx, dy, dz) || 1;
  out.o.x = cam.pos.x; out.o.y = cam.pos.y; out.o.z = cam.pos.z;
  out.d.x = dx / l; out.d.y = dy / l; out.d.z = dz / l;
  return out;
}

/** Cursor pixel (x right, y down, CSS px in a viewport of width x height) to NDC. */
export function pxToNdc(x: number, y: number, width: number, height: number): { x: number; y: number } {
  return { x: (x / Math.max(1, width)) * 2 - 1, y: 1 - (y / Math.max(1, height)) * 2 };
}

/** World size of one screen pixel at view depth `depth` (mm). */
export function mmPerPx(cam: PickCamera, depth: number): number {
  return (2 * Math.max(depth, 0) * cam.tanHalfFov) / Math.max(1, cam.heightPx);
}

/** Pick radius of a sphere of radius r at centre c: at least PICK_MIN_PX on screen. */
export function inflatedRadius(cam: PickCamera, c: Vec3, r: number, minPx = PICK_MIN_PX): number {
  const depth = (c.x - cam.pos.x) * cam.fwd.x + (c.y - cam.pos.y) * cam.fwd.y + (c.z - cam.pos.z) * cam.fwd.z;
  return Math.max(r, minPx * mmPerPx(cam, depth));
}

/** Distance along the ray to the first hit of a sphere (entering, or 0 when the origin is inside); -1 = miss. */
export function raySphere(ray: Ray, c: Vec3, r: number): number {
  const ox = ray.o.x - c.x, oy = ray.o.y - c.y, oz = ray.o.z - c.z;
  const b = ox * ray.d.x + oy * ray.d.y + oz * ray.d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  if (cc <= 0) return 0;
  const disc = b * b - cc;
  if (disc < 0 || b > 0) return -1;
  return -b - Math.sqrt(disc);
}

/** Axis-aligned ellipsoid (centre, radii mm): first hit distance, 0 inside, -1 miss. */
export function rayEllipsoid(ray: Ray, c: Vec3, radii: Vec3): number {
  const sx = 1 / Math.max(radii.x, 1e-9), sy = 1 / Math.max(radii.y, 1e-9), sz = 1 / Math.max(radii.z, 1e-9);
  const o = { x: (ray.o.x - c.x) * sx, y: (ray.o.y - c.y) * sy, z: (ray.o.z - c.z) * sz };
  const d = { x: ray.d.x * sx, y: ray.d.y * sy, z: ray.d.z * sz };
  const a = d.x * d.x + d.y * d.y + d.z * d.z;
  const b = o.x * d.x + o.y * d.y + o.z * d.z;
  const cc = o.x * o.x + o.y * o.y + o.z * o.z - 1;
  if (cc <= 0) return 0;
  const disc = b * b - a * cc;
  if (disc < 0 || b > 0) return -1;
  return (-b - Math.sqrt(disc)) / a;
}

/** Ray against the horizontal plane y = h: distance, -1 when parallel or behind. */
export function rayPlaneY(ray: Ray, h: number): number {
  if (Math.abs(ray.d.y) < 1e-9) return -1;
  const t = (h - ray.o.y) / ray.d.y;
  return t >= 0 ? t : -1;
}

/** Point at distance t along the ray. */
export function rayAt(ray: Ray, t: number, out: Vec3): Vec3 {
  out.x = ray.o.x + ray.d.x * t; out.y = ray.o.y + ray.d.y * t; out.z = ray.o.z + ray.d.z * t;
  return out;
}
