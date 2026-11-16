// Render-side ground snapping (look-pass 2): a solid primitive whose lowest point stays a little above the terrain
// under its footprint (a brick on a slope, a stem placed on the cell's centre height, a post on a mound's edge)
// hangs in the air with its shadow detached and an open underside showing. The COLLISION primitive is the
// simulation's and is not touched; only what is drawn is stretched downward so that it meets the ground.
//
// Rules (pure, tested):
//  - only boxes, cylinders and capsules standing upright (local +Y within UPRIGHT_COS of world up): their bottom
//    is a flat face or a round cap that a longer body can simply continue; ellipsoids (rocks, bushes) and tilted
//    parts (branches, leaning stakes, roof pitches) keep their shape;
//  - the footprint is sampled (centre + a ring at the radius): the LOWEST ground there is the target;
//  - flat plates (leaves, lids, mats: thinner than a third of their width) are left alone: stretching a 0.3 mm leaf
//    to a 5 mm slab would make a block of it (a leaf's lift is its curl, the collision shape the simulation walks on);
//  - the gap to close is limited to MAX_GAP_BU body units: a bigger gap means the thing is meant to stand on
//    something else (a tabletop on legs, a car body on wheels, a bench seat), which must stay as it is;
//  - the stretch goes SKIRT_MM below the ground so no daylight shows under a slope.
import type { Primitive } from '@/sim/types';

/** cos of the largest tilt of an "upright" primitive (about 14 degrees). */
export const UPRIGHT_COS = 0.97;
/** Largest gap between a primitive's bottom and the lowest ground under it that is closed, body units. */
export const SNAP_MAX_GAP_BU = 4;
/** The stretched body ends this far below the lowest ground sample, mm. */
export const SNAP_SKIRT_MM = 0.6;
/** Gaps smaller than this are left alone (float precision and the terrain's own bilinear shading), mm. */
export const SNAP_MIN_GAP_MM = 0.15;
/** Footprint samples around a cylinder or capsule (plus the centre). */
const RING_SAMPLES = 8;

export interface SnapStats {
  considered: number;
  snapped: number;
  /** Largest gap closed, mm. */
  maxGapMm: number;
}

/** A flat plate: a box much thinner than it is wide (a leaf, a lid, a mat). */
function isPlate(p: Primitive): boolean {
  return p.shape === 'box' && p.size.y < 0.3 * Math.min(p.size.x, p.size.z);
}

/** Local half height below the centre, mm (a capsule's round cap counts). */
function halfHeight(p: Primitive): number {
  return p.shape === 'capsule' ? p.size.y + p.size.x : p.size.y;
}

/** Lowest terrain height under the footprint of an upright box (corners, edge middles) or cylinder / capsule (ring). */
function lowestGround(p: Primitive, heightAt: (x: number, z: number) => number): number {
  let low = heightAt(p.pos.x, p.pos.z);
  if (p.shape === 'box') {
    const q = p.rot;
    // the box's local x and z axes in the ground plane (it is upright: only its yaw matters)
    const ax = 1 - 2 * (q.y * q.y + q.z * q.z), az = 2 * (q.x * q.z - q.w * q.y);
    const bx = 2 * (q.x * q.z + q.w * q.y), bz = 1 - 2 * (q.x * q.x + q.y * q.y);
    for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) {
      if (i === 0 && k === 0) continue;
      const h = heightAt(p.pos.x + i * ax * p.size.x + k * bx * p.size.z, p.pos.z + i * az * p.size.x + k * bz * p.size.z);
      if (h < low) low = h;
    }
    return low;
  }
  for (let k = 0; k < RING_SAMPLES; k++) {
    const a = (k / RING_SAMPLES) * Math.PI * 2;
    const h = heightAt(p.pos.x + Math.cos(a) * p.size.x, p.pos.z + Math.sin(a) * p.size.x);
    if (h < low) low = h;
  }
  return low;
}

/**
 * The same primitives with their bottoms stretched to the ground. Primitives that need nothing are returned as
 * the same objects (no allocation per primitive); the input is never modified.
 */
export function snapPrimitivesToGround(
  prims: readonly Primitive[], heightAt: (x: number, z: number) => number, bu: number, stats?: SnapStats,
): Primitive[] {
  const out: Primitive[] = new Array(prims.length);
  const maxGap = SNAP_MAX_GAP_BU * bu;
  for (let i = 0; i < prims.length; i++) {
    const p = prims[i];
    out[i] = p;
    if (p.shape === 'ellipsoid' || isPlate(p)) continue;
    const q = p.rot;
    const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
    if (upY < UPRIGHT_COS) continue;
    if (stats) stats.considered++;
    const half = halfHeight(p);
    const bottom = p.pos.y - half * upY;
    const low = lowestGround(p, heightAt);
    const gap = bottom - low;
    if (gap < SNAP_MIN_GAP_MM || gap > maxGap) continue;
    // stretch downward along the (upright) local Y axis: the top stays where it is
    const extend = gap + SNAP_SKIRT_MM;
    const sizeY = p.size.y + extend / 2 / upY;
    const shiftY = -(extend / 2);
    out[i] = { ...p, pos: { x: p.pos.x, y: p.pos.y + shiftY, z: p.pos.z }, size: { x: p.size.x, y: sizeY, z: p.size.z } };
    if (stats) { stats.snapped++; if (gap > stats.maxGapMm) stats.maxGapMm = gap; }
  }
  return out;
}
