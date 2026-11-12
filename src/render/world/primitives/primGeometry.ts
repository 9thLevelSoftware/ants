// Parametric unit geometries for the solid primitives (pure arrays + three BufferGeometry; tested). One geometry
// draws every size of its family: the vertex shader computes
//   rounded family: pos = aCorner * max(size - round, 0) + normal * round
//   ellipsoid:      pos = normal * size,   normal' = normalize(normal / size)
// so rounding radii stay exact under any per-instance size (surfacePatch.ts primVertexPatch), and collision
// (src/core/math/sdf.ts) equals visuals. `position` holds the shape at size 1, round 0.25 (for bounds only).
import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';

export interface PrimGeometryData {
  /** Unit direction = normal. */
  dir: Float32Array;
  /** Point on the normalised inner shape (-1..1 per axis). */
  corner: Float32Array;
  index: Uint16Array | Uint32Array;
}

/** Detail of the parametric shapes per level of detail. */
export interface PrimDetail {
  /** Angle steps of a quarter rounding arc. */
  arc: number;
  /** Segments around a cylinder / ellipsoid. */
  around: number;
}

export const PRIM_DETAIL = {
  near: { arc: 3, around: 20 } as PrimDetail,
  far: { arc: 1, around: 12 } as PrimDetail,
  /** A few pixels big: box = 12 triangles (rounding folded into the corners), cylinder 60, ellipsoid 48. */
  tiny: { arc: 0, around: 6 } as PrimDetail,
} as const;

/** Face parameter positions of a rounded box: flat middle, `arc` steps per half rounding band (angle-uniform). */
function boxParams(arc: number): number[] {
  // arc 0: one quad per face; its corners all take the cube-corner direction, so the faces still meet exactly
  if (arc <= 0) return [-1, 1];
  const half: number[] = [];
  for (let k = 0; k <= arc; k++) {
    const th = (k / arc) * (Math.PI / 4);
    half.push((1 + Math.tan(th)) / 2); // 0.5 .. 1
  }
  return [...half.map((v) => -v).reverse(), ...half];
}

function toIndex(list: number[], verts: number): Uint16Array | Uint32Array {
  return verts > 65535 ? new Uint32Array(list) : new Uint16Array(list);
}

/**
 * Rounded box: a cube whose face grids put `arc` vertices into each rounding band. With stretch s = 2:
 * corner = clamp(2p, -1, 1), dir = normalize(2p - corner) (the face normal on the flat part, 45 degrees at the
 * cube edge, so each face carries half of every rounding arc and neighbouring faces meet exactly).
 */
export function roundedBoxData(arc: number): PrimGeometryData {
  const P = boxParams(arc);
  const m = P.length;
  const dir: number[] = [], corner: number[] = [], idx: number[] = [];
  const faces: [number, number, number][] = [[0, 1, 2], [1, 2, 0], [2, 0, 1]]; // normal axis, u axis, v axis
  for (const [na, ua, va] of faces) {
    for (const sgn of [1, -1]) {
      const base = dir.length / 3;
      for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) {
        const p = [0, 0, 0];
        p[na] = sgn; p[ua] = P[i]; p[va] = P[j];
        const c = p.map((x) => Math.max(-1, Math.min(1, 2 * x)));
        const d = p.map((x, k) => 2 * x - c[k]);
        const l = Math.hypot(d[0], d[1], d[2]);
        corner.push(c[0], c[1], c[2]);
        dir.push(d[0] / l, d[1] / l, d[2] / l);
      }
      // winding: outward normal = sgn * axis na; u x v = na for the cyclic (na, ua, va) order
      for (let j = 0; j < m - 1; j++) for (let i = 0; i < m - 1; i++) {
        const a = base + j * m + i, b = a + 1, c = a + m, d = c + 1;
        if (sgn > 0) idx.push(a, b, c, b, d, c);
        else idx.push(a, c, b, b, c, d);
      }
    }
  }
  return { dir: new Float32Array(dir), corner: new Float32Array(corner), index: toIndex(idx, dir.length / 3) };
}

/**
 * Rounded cylinder (axis +Y), also the capsule (round = radius): meridian profile cap centre -> rim -> rounding
 * arc -> side -> rounding arc -> rim -> cap centre, revolved `around` times.
 */
export function roundedCylinderData(arc: number, around: number): PrimGeometryData {
  // profile entries: [radial corner (0..1), y corner (-1..1), dir angle phi from the horizontal (radians)]
  const prof: [number, number, number][] = [[0, 1, Math.PI / 2], [1, 1, Math.PI / 2]];
  for (let k = 1; k <= arc; k++) prof.push([1, 1, Math.PI / 2 - (k / arc) * (Math.PI / 2)]);
  for (let k = 0; k < arc; k++) prof.push([1, -1, -(k / arc) * (Math.PI / 2)]);
  prof.push([1, -1, -Math.PI / 2], [0, -1, -Math.PI / 2]);
  const ring = around + 1;
  const dir: number[] = [], corner: number[] = [], idx: number[] = [];
  for (const [rho, y, phi] of prof) {
    for (let s = 0; s <= around; s++) {
      const th = (s / around) * Math.PI * 2;
      const cx = Math.cos(th), cz = Math.sin(th);
      corner.push(rho * cx, y, rho * cz);
      dir.push(Math.cos(phi) * cx, Math.sin(phi), Math.cos(phi) * cz);
    }
  }
  for (let r = 0; r < prof.length - 1; r++) for (let s = 0; s < around; s++) {
    const a = r * ring + s, b = a + 1, c = a + ring, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  return { dir: new Float32Array(dir), corner: new Float32Array(corner), index: toIndex(idx, dir.length / 3) };
}

/** Unit sphere for ellipsoids (corner unused, zero). */
export function sphereData(around: number): PrimGeometryData {
  const rings = Math.max(4, Math.round(around / 2));
  const dir: number[] = [], idx: number[] = [];
  for (let r = 0; r <= rings; r++) {
    const phi = Math.PI / 2 - (r / rings) * Math.PI;
    for (let s = 0; s <= around; s++) {
      const th = (s / around) * Math.PI * 2;
      dir.push(Math.cos(phi) * Math.cos(th), Math.sin(phi), Math.cos(phi) * Math.sin(th));
    }
  }
  const ring = around + 1;
  for (let r = 0; r < rings; r++) for (let s = 0; s < around; s++) {
    const a = r * ring + s, b = a + 1, c = a + ring, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  return { dir: new Float32Array(dir), corner: new Float32Array(dir.length), index: toIndex(idx, dir.length / 3) };
}

/** Evaluates the vertex shader formula on the CPU (tests, bounds). */
export function expandVertex(d: PrimGeometryData, i: number, size: { x: number; y: number; z: number }, round: number, ellipsoid: boolean, out: Vector3): Vector3 {
  const dx = d.dir[i * 3], dy = d.dir[i * 3 + 1], dz = d.dir[i * 3 + 2];
  if (ellipsoid) return out.set(dx * size.x, dy * size.y, dz * size.z);
  const cx = d.corner[i * 3], cy = d.corner[i * 3 + 1], cz = d.corner[i * 3 + 2];
  return out.set(
    cx * Math.max(size.x - round, 0) + dx * round,
    cy * Math.max(size.y - round, 0) + dy * round,
    cz * Math.max(size.z - round, 0) + dz * round,
  );
}

export function toBufferGeometry(d: PrimGeometryData, ellipsoid: boolean): BufferGeometry {
  const n = d.dir.length / 3;
  const pos = new Float32Array(n * 3);
  const v = new Vector3();
  for (let i = 0; i < n; i++) {
    expandVertex(d, i, { x: 1, y: 1, z: 1 }, 0.25, ellipsoid, v);
    pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(d.dir, 3));
  g.setAttribute('aCorner', new BufferAttribute(d.corner, 3));
  g.setIndex(new BufferAttribute(d.index, 1));
  g.boundingSphere = new Sphere(new Vector3(), 2);
  return g;
}
