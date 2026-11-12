// Cutaway geometry (GDD 01 6.7, GDD 08 4.3): turns the colony view's cutaway parameters into a plane and the region
// it hides (capFaces.ts derives the cut faces). Pure maths (no three).
//
// `slice` (GDD default): horizontal plane at planeY; everything above it within `radius` (horizontally) of
// `center` is hidden. `section: 'vertical'` (spike-nest.md 6 improvement): a vertical plane through `center` that
// follows the camera yaw, hiding the slab between the camera and the plane, so the whole nest reads side-on and is
// never mirrored. `xray` uses the plane only for the fill light.

export type CutMode = 'off' | 'slice' | 'xray';

/** Structurally compatible with the colony rig's CutawayParams (src/render/camera), plus optional extras. */
export interface NestCutawayParams {
  mode: CutMode;
  /** Slice plane height, mm. */
  planeY: number;
  /** R_cut, mm. */
  radius: number;
  center: { x: number; z: number };
  /** Outside R_cut the surface renders darkened by this factor (GDD 30 %). */
  outsideDarken?: number;
  /** Plane orientation (default horizontal). */
  section?: 'horizontal' | 'vertical';
  /** Horizontal view direction (camera -> target) for the vertical section. */
  viewDir?: { x: number; z: number };
  /** Vertical section: plane moved this far towards the camera from the centre, mm. */
  offset?: number;
}

export interface CutPlane {
  mode: CutMode;
  vertical: boolean;
  /** Plane point (cap rectangle origin), unit normal towards the hidden side, in-plane axes. */
  c: { x: number; y: number; z: number };
  n: { x: number; y: number; z: number };
  u: { x: number; y: number; z: number };
  v: { x: number; y: number; z: number };
  radius: number;
  darken: number;
}

export function createCutPlane(): CutPlane {
  return {
    mode: 'off', vertical: false, c: { x: 0, y: 0, z: 0 }, n: { x: 0, y: 1, z: 0 }, u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: 1 },
    radius: 0, darken: 0,
  };
}

/** Section height above the ground at the centre, BU (the cap must reach the surface). */
const SECTION_TOP_BU = 4;

export function computeCutPlane(p: NestCutawayParams, groundAt: (x: number, z: number) => number, bu: number, out: CutPlane): CutPlane {
  out.mode = p.mode;
  out.radius = p.radius;
  out.darken = p.outsideDarken ?? 0.3;
  out.vertical = p.section === 'vertical';
  if (!out.vertical) {
    out.c.x = p.center.x; out.c.y = p.planeY; out.c.z = p.center.z;
    set(out.n, 0, 1, 0); set(out.u, 1, 0, 0); set(out.v, 0, 0, 1);
    return out;
  }
  let dx = p.viewDir?.x ?? 0, dz = p.viewDir?.z ?? 1;
  const l = Math.hypot(dx, dz) || 1;
  dx /= l; dz /= l;
  set(out.n, -dx, 0, -dz); // towards the camera: the camera side is hidden
  set(out.u, -dz, 0, dx); // camera right (view x up): the section is never mirrored
  set(out.v, 0, 1, 0);
  const off = p.offset ?? 0;
  const cx = p.center.x + out.n.x * off, cz = p.center.z + out.n.z * off;
  const top = groundAt(cx, cz) + SECTION_TOP_BU * bu;
  out.c.x = cx; out.c.y = top; out.c.z = cz;
  return out;
}

/** Is a world point hidden by the cut (the same test as the shaders)? */
export function isHiddenByCut(cp: CutPlane, x: number, y: number, z: number): boolean {
  if (cp.mode !== 'slice') return false;
  const dx = x - cp.c.x, dy = y - cp.c.y, dz = z - cp.c.z;
  const h = dx * cp.n.x + dy * cp.n.y + dz * cp.n.z;
  if (h <= 0) return false;
  const rx = dx - cp.n.x * h, rz = dz - cp.n.z * h;
  return rx * rx + rz * rz < cp.radius * cp.radius;
}

/** Plane coordinates of a point on the plane. */
export function toPlane(cp: CutPlane, x: number, y: number, z: number, out: { u: number; v: number }): { u: number; v: number } {
  const dx = x - cp.c.x, dy = y - cp.c.y, dz = z - cp.c.z;
  out.u = dx * cp.u.x + dy * cp.u.y + dz * cp.u.z;
  out.v = dx * cp.v.x + dy * cp.v.y + dz * cp.v.z;
  return out;
}

/** Change key: the cap must be rebuilt when this changes (rounded to 0.1 mm). */
export function cutKey(cp: CutPlane): string {
  const r = (v: number) => Math.round(v * 10);
  return [cp.mode, cp.vertical ? 'v' : 'h', r(cp.c.x), r(cp.c.y), r(cp.c.z), r(cp.n.x * 1000), r(cp.n.z * 1000), r(cp.radius)].join('|');
}

function set(o: { x: number; y: number; z: number }, x: number, y: number, z: number): void {
  o.x = x; o.y = y; o.z = z;
}
