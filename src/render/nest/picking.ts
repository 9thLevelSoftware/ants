// Pick rays into nest space for marker and dig-plan placement (spike-nest.md 6: two complementary picks). The pick is
// always the nearest thing drawn at the pixel:
//  - slice cutaway: a cut face gives an exact point in solid soil ("dig a chamber here"); through a hole in the face
//    the ray continues to the cavity wall behind it ("extend this tunnel"); intact ground in front of the cut wins;
//  - x-ray: the first nest wall along the ray, ignoring the ground;
//  - no cutaway: the nearer of the nest walls and the field (terrain, objects).
// `snapToWall` moves any point to the nearest wall with its outward-from-solid normal (marker snapping), and
// `projectOnCut` gives the marker's projection on the cut plane (for drawing its shadow on the cap).
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector2, Vector3, type Camera, type Intersection } from 'three';
import type { Vec3 } from '@/core/math/vec3';
import type { ChunkMeshManager } from './mesh/chunkMeshManager';
import type { CapRaster } from './cutaway/capRaster';
import { isHiddenByCut, type CutPlane } from './cutaway/cutPlane';
import type { NestSource } from './simAdapter';

export type NestPickKind = 'cap' | 'wall' | 'surface';

export interface NestPick {
  kind: NestPickKind;
  point: Vec3;
  /** Unit normal pointing into free space (for the cap: towards the camera side of the plane). */
  normal: Vec3;
  /** Distance from the camera, mm. */
  distance: number;
  /** The point is underground (inside the substrate). */
  underground: boolean;
}

const rayMat = new MeshBasicMaterial({ side: DoubleSide });
const ndc = new Vector2();
const tmpN = new Vector3();

export interface PickContext {
  src: NestSource;
  manager: ChunkMeshManager;
  plane: CutPlane;
  /** The main cut face (the plane itself). */
  cap: CapRaster;
  /** Every cut face on screen (main face, pit wall, section sides); default: the main face only. */
  faces?: readonly CapRaster[];
  skinMm: number;
  maxDist: number;
}

/**
 * The nearest thing drawn at the pixel: every cut face where it shows soil, the first nest wall that is drawn (not
 * in open air, not hidden by the cut), and the field surface unless the cut hides it. A ray through a hole in a cut
 * face simply finds the wall behind it.
 */
export function pickNest(ndcX: number, ndcY: number, camera: Camera, ctx: PickContext): NestPick | null {
  const ray = new Raycaster();
  ndc.set(ndcX, ndcY);
  ray.setFromCamera(ndc, camera);
  const o = ray.ray.origin, d = ray.ray.direction;
  const cp = ctx.plane;
  let best: NestPick | null = null;
  let bestD = Infinity;
  const offer = (p: NestPick | null) => { if (p && p.distance <= ctx.maxDist && p.distance < bestD) { best = p; bestD = p.distance; } };

  // 1. the cut faces (soil in cross-section)
  if (cp.mode === 'slice') {
    const faces = ctx.faces ?? (ctx.cap.current ? [ctx.cap] : []);
    for (const r of faces) offer(pickFace(r, o, d));
  }

  // 2. nest walls (double-sided, skipping discarded fragments: open air and the hidden half of the cut)
  const hits: Intersection[] = [];
  for (const src of ctx.manager.meshes()) {
    const m = new Mesh(src.geometry, rayMat);
    m.matrixWorld.copy(src.matrixWorld);
    m.raycast(ray, hits);
  }
  hits.sort((a, b) => a.distance - b.distance);
  for (const h of hits) {
    if (h.distance > ctx.maxDist || h.distance >= bestD) break;
    const p = h.point;
    if (ctx.src.soil(p.x, p.y, p.z) > -ctx.skinMm) continue;
    if (isHiddenByCut(cp, p.x, p.y, p.z)) continue;
    tmpN.set(0, 1, 0);
    if (h.face) tmpN.copy(h.face.normal); // geometry normals point into the cavity (free space)
    offer({ kind: 'wall', point: { x: p.x, y: p.y, z: p.z }, normal: { x: tmpN.x, y: tmpN.y, z: tmpN.z }, distance: h.distance, underground: true });
    break;
  }

  // 3. the surface (not in x-ray; in slice only where the cut does not hide it)
  if (cp.mode !== 'xray') {
    const t = ctx.src.trace(o, d, ctx.maxDist, 0);
    if (t < ctx.maxDist && t < bestD - 1e-3) {
      const p = { x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t };
      if (!isHiddenByCut(cp, p.x, p.y, p.z)) {
        const n = { x: 0, y: 1, z: 0 };
        ctx.src.project(p, { x: 0, y: 0, z: 0 }, n);
        offer({ kind: 'surface', point: p, normal: n, distance: t, underground: ctx.src.substrate(p.x, p.y, p.z) < 0 });
      }
    }
  }
  return best;
}

/** Ray against one shown cut face: a hit where its image shows soil (solidness >= 0.5), else null. */
function pickFace(r: CapRaster, o: Vector3, d: Vector3): NestPick | null {
  const img = r.current;
  if (!img) return null;
  const f = img.face;
  if (f.kind === 'cylinder') {
    // the pit wall seen from inside the pit: the far (exit) crossing of the vertical cylinder
    const ox = o.x - f.o.x, oz = o.z - f.o.z;
    const a = d.x * d.x + d.z * d.z, b = ox * d.x + oz * d.z, c = ox * ox + oz * oz - f.radius * f.radius;
    const disc = b * b - a * c;
    if (a < 1e-12 || disc < 0) return null;
    const t = (-b + Math.sqrt(disc)) / a;
    if (t <= 0) return null;
    const px = o.x + d.x * t, py = o.y + d.y * t, pz = o.z + d.z * t;
    const v = py - f.o.y;
    if (v < f.v0 || v > f.v1) return null;
    let u = Math.atan2(px - f.o.x, pz - f.o.z) * f.radius;
    if (u < 0) u += 2 * Math.PI * f.radius;
    if (r.solidAt(u, v) < 0.5) return null;
    const nl = Math.hypot(px - f.o.x, pz - f.o.z) || 1;
    return { kind: 'cap', point: { x: px, y: py, z: pz }, normal: { x: -(px - f.o.x) / nl, y: 0, z: -(pz - f.o.z) / nl }, distance: t, underground: true };
  }
  const nx = f.a.y * f.b.z - f.a.z * f.b.y, ny = f.a.z * f.b.x - f.a.x * f.b.z, nz = f.a.x * f.b.y - f.a.y * f.b.x;
  const denom = d.x * nx + d.y * ny + d.z * nz;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((f.o.x - o.x) * nx + (f.o.y - o.y) * ny + (f.o.z - o.z) * nz) / denom;
  if (t <= 0) return null;
  const px = o.x + d.x * t, py = o.y + d.y * t, pz = o.z + d.z * t;
  const qx = px - f.o.x, qy = py - f.o.y, qz = pz - f.o.z;
  const u = qx * f.a.x + qy * f.a.y + qz * f.a.z, v = qx * f.b.x + qy * f.b.y + qz * f.b.z;
  if (f.radial && u * u + v * v >= f.radius * f.radius) return null;
  if (r.solidAt(u, v) < 0.5) return null;
  const side = denom < 0 ? 1 : -1; // normal towards the camera
  return { kind: 'cap', point: { x: px, y: py, z: pz }, normal: { x: nx * side, y: ny * side, z: nz * side }, distance: t, underground: true };
}

/** Nearest wall point within maxDist of p (normal into free space); false if none. */
export function snapToWall(src: NestSource, p: Vec3, maxDist: number, out: Vec3, normal: Vec3): boolean {
  if (!src.project(p, out, normal)) return false;
  return Math.hypot(out.x - p.x, out.y - p.y, out.z - p.z) <= maxDist;
}

/** Orthogonal projection of a point onto the cut plane. */
export function projectOnCut(cp: CutPlane, p: Vec3, out: Vec3): Vec3 {
  const h = (p.x - cp.c.x) * cp.n.x + (p.y - cp.c.y) * cp.n.y + (p.z - cp.c.z) * cp.n.z;
  out.x = p.x - cp.n.x * h; out.y = p.y - cp.n.y * h; out.z = p.z - cp.n.z * h;
  return out;
}
