// The cut faces of the hidden region, where soil is shown in cross-section (pure maths, no three):
//  - horizontal slice: the disc on the plane and the cylinder wall of the hidden pit (from the plane up through the
//    ground), so the pit never shows the sky behind the terrain;
//  - vertical section: the back face on the plane and the two side faces of the hidden slab.
// A face maps (u, v) in mm to world space; the cap rasteriser samples the field there, the cap mesh draws it.
import type { CutPlane } from './cutPlane';

export interface V3 { x: number; y: number; z: number }

export interface CapFace {
  kind: 'plane' | 'cylinder';
  /** plane: point = o + a u + b v. cylinder: centre of the bottom circle, axis +Y. */
  o: V3;
  a: V3;
  b: V3;
  /** Cylinder radius, mm. */
  radius: number;
  /** Parameter ranges, mm (cylinder: u is arc length 0..2 pi R, v height above o.y). */
  u0: number; u1: number; v0: number; v1: number;
  /** Discard outside the cut radius (the disc of a horizontal slice). */
  radial: boolean;
}

/** Depth of the vertical section faces below their top, and the length of its side faces, in multiples of R. */
const SECTION_DEPTH_R = 2.5;
const SECTION_SIDE_R = 3;
/** Height of the pit wall above the highest ground on its rim, BU. */
const PIT_TOP_BU = 2;

const v3 = (x: number, y: number, z: number): V3 => ({ x, y, z });

/** `groundMax` = highest terrain on the cut's rim (mm). */
export function capFaces(cp: CutPlane, groundMax: number, bu: number): CapFace[] {
  const R = cp.radius, c = cp.c;
  if (!cp.vertical) {
    return [
      { kind: 'plane', o: v3(c.x, c.y, c.z), a: v3(1, 0, 0), b: v3(0, 0, 1), radius: R, u0: -R, u1: R, v0: -R, v1: R, radial: true },
      {
        kind: 'cylinder', o: v3(c.x, c.y, c.z), a: v3(1, 0, 0), b: v3(0, 1, 0), radius: R,
        u0: 0, u1: 2 * Math.PI * R, v0: 0, v1: Math.max(1, groundMax + PIT_TOP_BU * bu - c.y), radial: false,
      },
    ];
  }
  const v0 = -SECTION_DEPTH_R * R, L = SECTION_SIDE_R * R;
  const side = (s: number): CapFace => ({
    kind: 'plane', o: v3(c.x + cp.u.x * R * s, c.y, c.z + cp.u.z * R * s), a: v3(cp.n.x, 0, cp.n.z), b: v3(0, 1, 0), radius: R,
    u0: 0, u1: L, v0, v1: 0, radial: false,
  });
  return [
    { kind: 'plane', o: v3(c.x, c.y, c.z), a: v3(cp.u.x, cp.u.y, cp.u.z), b: v3(0, 1, 0), radius: R, u0: -R, u1: R, v0, v1: 0, radial: false },
    side(-1),
    side(1),
  ];
}

export function facePoint(f: CapFace, u: number, v: number, out: V3): V3 {
  if (f.kind === 'cylinder') {
    const t = u / f.radius;
    out.x = f.o.x + f.radius * Math.sin(t); out.y = f.o.y + v; out.z = f.o.z + f.radius * Math.cos(t);
    return out;
  }
  out.x = f.o.x + f.a.x * u + f.b.x * v; out.y = f.o.y + f.a.y * u + f.b.y * v; out.z = f.o.z + f.a.z * u + f.b.z * v;
  return out;
}
