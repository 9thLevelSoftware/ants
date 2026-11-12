/** Small allocation-free vector helpers for the demo (render side; the kernel has its own). */
import type { Vec3 } from '@/core/math/vec3';
export { rotateMinimal } from '@/sim/locomotion/walkerMath';

export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export function set(o: Vec3, x: number, y: number, z: number): Vec3 { o.x = x; o.y = y; o.z = z; return o; }
export function copy(o: Vec3, a: Vec3): Vec3 { o.x = a.x; o.y = a.y; o.z = a.z; return o; }
export function addScaled(o: Vec3, a: Vec3, b: Vec3, s: number): Vec3 { o.x = a.x + b.x * s; o.y = a.y + b.y * s; o.z = a.z + b.z * s; return o; }
export function scale(o: Vec3, a: Vec3, s: number): Vec3 { o.x = a.x * s; o.y = a.y * s; o.z = a.z * s; return o; }
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export function cross(o: Vec3, a: Vec3, b: Vec3): Vec3 {
  const x = a.y * b.z - a.z * b.y, y = a.z * b.x - a.x * b.z, z = a.x * b.y - a.y * b.x;
  o.x = x; o.y = y; o.z = z; return o;
}
export function normalize(o: Vec3, a: Vec3): Vec3 {
  const l = Math.sqrt(dot(a, a));
  if (l < 1e-12) return set(o, 0, 1, 0);
  return scale(o, a, 1 / l);
}
export function projectOnPlane(o: Vec3, a: Vec3, n: Vec3): Vec3 { return addScaled(o, a, n, -dot(a, n)); }
/** Rotate v about unit axis k by angle a (Rodrigues). */
export function rotateAxis(o: Vec3, v: Vec3, k: Vec3, a: number): Vec3 {
  const c = Math.cos(a), s = Math.sin(a), kv = dot(k, v);
  const cx = k.y * v.z - k.z * v.y, cy = k.z * v.x - k.x * v.z, cz = k.x * v.y - k.y * v.x;
  const x = v.x * c + cx * s + k.x * kv * (1 - c), y = v.y * c + cy * s + k.y * kv * (1 - c), z = v.z * c + cz * s + k.z * kv * (1 - c);
  o.x = x; o.y = y; o.z = z;
  return o;
}
