// Pick rays into nest space for marker and dig-plan placement (spike-nest.md 6: two complementary picks).
//  - slice cutaway: the cut face gives an exact point in solid soil on the plane ("dig a chamber here"); through a
//    hole in the face the ray continues to the cavity wall below ("extend this tunnel");
//  - x-ray: the first nest wall along the ray, ignoring the ground;
//  - no cutaway: the nearer of the nest walls and the field (terrain, objects).
// `snapToWall` moves any point to the nearest wall with its outward-from-solid normal (marker snapping), and
// `projectOnCut` gives the marker's projection on the cut plane (for drawing its shadow on the cap).
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector2, Vector3, type Camera, type Intersection } from 'three';
import type { Vec3 } from '@/core/math/vec3';
import type { ChunkMeshManager } from './mesh/chunkMeshManager';
import type { CapRaster } from './cutaway/capRaster';
import { isHiddenByCut, toPlane, type CutPlane } from './cutaway/cutPlane';
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
  cap: CapRaster;
  skinMm: number;
  maxDist: number;
}

export function pickNest(ndcX: number, ndcY: number, camera: Camera, ctx: PickContext): NestPick | null {
  const ray = new Raycaster();
  ndc.set(ndcX, ndcY);
  ray.setFromCamera(ndc, camera);
  const o = ray.ray.origin, d = ray.ray.direction;
  const cp = ctx.plane;
  let best: NestPick | null = null;
  let tMin = 0;

  // 1. the cut face
  if (cp.mode === 'slice' && ctx.cap.current) {
    const denom = d.x * cp.n.x + d.y * cp.n.y + d.z * cp.n.z;
    if (Math.abs(denom) > 1e-6) {
      const t = ((cp.c.x - o.x) * cp.n.x + (cp.c.y - o.y) * cp.n.y + (cp.c.z - o.z) * cp.n.z) / denom;
      if (t > 0) {
        const px = o.x + d.x * t, py = o.y + d.y * t, pz = o.z + d.z * t;
        const uv = toPlane(cp, px, py, pz, { u: 0, v: 0 }); // the main cap face uses plane coordinates
        const inside = cp.vertical || Math.hypot(px - cp.c.x, pz - cp.c.z) < cp.radius;
        const s = inside ? ctx.cap.solidAt(uv.u, uv.v) : -1;
        if (s >= 0.5) {
          const side = denom < 0 ? 1 : -1;
          best = { kind: 'cap', point: { x: px, y: py, z: pz }, normal: { x: cp.n.x * side, y: cp.n.y * side, z: cp.n.z * side }, distance: t, underground: true };
        } else if (s >= 0) {
          tMin = t; // through a hole: only walls beyond the plane count
        }
      }
    }
  }

  // 2. nest walls (double-sided, skipping discarded fragments: open air and the hidden half of the cut)
  if (!best) {
    const hits: Intersection[] = [];
    for (const r of ctx.manager.regions.values()) {
      if (!r.mesh) continue;
      const m = new Mesh(r.mesh.geometry, rayMat);
      m.matrixWorld.copy(r.mesh.matrixWorld);
      m.raycast(ray, hits);
    }
    hits.sort((a, b) => a.distance - b.distance);
    for (const h of hits) {
      if (h.distance < tMin || h.distance > ctx.maxDist) continue;
      const p = h.point;
      if (ctx.src.soil(p.x, p.y, p.z) > -ctx.skinMm) continue;
      if (isHiddenByCut(cp, p.x, p.y, p.z)) continue;
      tmpN.set(0, 1, 0);
      if (h.face) tmpN.copy(h.face.normal); // geometry normals point into the cavity (free space)
      best = { kind: 'wall', point: { x: p.x, y: p.y, z: p.z }, normal: { x: tmpN.x, y: tmpN.y, z: tmpN.z }, distance: h.distance, underground: true };
      break;
    }
  }

  // 3. the surface (not in x-ray; in slice only outside the hidden region)
  if (cp.mode !== 'xray') {
    const t = ctx.src.trace(o, d, ctx.maxDist, 0);
    if (t < ctx.maxDist && (!best || t < best.distance - 1e-3)) {
      const p = { x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t };
      if (!isHiddenByCut(cp, p.x, p.y, p.z) && (!best || best.kind !== 'cap')) {
        const n = { x: 0, y: 1, z: 0 };
        ctx.src.project(p, { x: 0, y: 0, z: 0 }, n);
        best = { kind: 'surface', point: p, normal: n, distance: t, underground: ctx.src.substrate(p.x, p.y, p.z) < 0 };
      }
    }
  }
  return best;
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
