// Adversarial checks of the render-side ground snap (look-pass 2, work item 3), written by the reviewer.
// The snap must only lengthen a primitive DOWNWARD: everything above its old bottom (the joint to the next stem
// segment, the flower head placed by FlowerDressing on the unsnapped stem, the top of a post) stays where it was.
import { describe, expect, it } from 'vitest';
import type { Primitive } from '@/sim/types';
import { SNAP_SKIRT_MM, snapPrimitivesToGround, type SnapStats } from './groundSnap';

const BU = 4;
const IDENT = { x: 0, y: 0, z: 0, w: 1 };
function prim(over: Partial<Primitive> & { shape: Primitive['shape'] }): Primitive {
  return { id: 1, pos: { x: 100, y: 10, z: 100 }, rot: IDENT, size: { x: 5, y: 5, z: 5 }, round: 0, material: 'stone', flags: 0, objectId: -1, ...over };
}
/** Rotation of `deg` degrees about the world x axis (a lean toward -z / +z). */
function tiltX(deg: number) {
  const h = (deg * Math.PI) / 360;
  return { x: Math.sin(h), y: 0, z: 0, w: Math.cos(h) };
}
/** Local +Y axis of a quaternion in world space. */
function axisY(q: { x: number; y: number; z: number; w: number }) {
  return { x: 2 * (q.x * q.y - q.w * q.z), y: 1 - 2 * (q.x * q.x + q.z * q.z), z: 2 * (q.y * q.z + q.w * q.x) };
}
/** Upper end of a capsule's (or cylinder's) axis segment plus its cap. */
function topOf(p: Primitive) {
  const a = axisY(p.rot), r = p.shape === 'capsule' ? p.size.y + p.size.x : p.size.y;
  return { x: p.pos.x + a.x * r, y: p.pos.y + a.y * r, z: p.pos.z + a.z * r };
}

describe('ground snap keeps the upper end of a primitive in place', () => {
  it('upright capsule: top unchanged, bottom below the ground (control case)', () => {
    const p = prim({ shape: 'capsule', pos: { x: 50, y: 30, z: 50 }, size: { x: 0.6, y: 18, z: 0 } }); // bottom 11.4
    const [q] = snapPrimitivesToGround([p], () => 0, BU);
    const t0 = topOf(p), t1 = topOf(q);
    expect(t1.x).toBeCloseTo(t0.x, 6);
    expect(t1.y).toBeCloseTo(t0.y, 6);
    expect(t1.z).toBeCloseTo(t0.z, 6);
  });

  // FAILS on the reviewed code: the centre is shifted straight down by extend/2 while the body grows along its own
  // (tilted) axis, so the top end slides sideways by about sin(tilt) * extend / 2. For a stem leaning 10 degrees
  // with a 14 mm gap that is ~1.3 mm - twice the 0.6 mm radius of a clover stem, i.e. a visible break at the joint
  // with the next (unsnapped) segment and between the stem and its flower head (FlowerDressing uses unsnapped prims).
  it('leaning capsule (10 degrees, the upright limit is ~14): the top end does not slide sideways', () => {
    const p = prim({ shape: 'capsule', pos: { x: 50, y: 32, z: 50 }, rot: tiltX(10), size: { x: 0.6, y: 18, z: 0 } });
    const st: SnapStats = { considered: 0, snapped: 0, maxGapMm: 0 };
    const [q] = snapPrimitivesToGround([p], () => 0, BU, st);
    expect(st.snapped).toBe(1);
    const t0 = topOf(p), t1 = topOf(q);
    expect(Math.hypot(t1.x - t0.x, t1.z - t0.z), 'horizontal slide of the top end, mm').toBeLessThan(0.05);
    expect(t1.y).toBeCloseTo(t0.y, 3);
  });

  it('every snapped primitive reaches below the lowest ground under its whole footprint (box corners on a slope)', () => {
    const slope = (x: number, z: number) => 0.2 * (x - 100) - 0.15 * (z - 100);
    const yaw = Math.PI / 7;
    const p = prim({ shape: 'box', pos: { x: 100, y: 14, z: 100 }, rot: { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, size: { x: 10, y: 4, z: 6 } });
    const [q] = snapPrimitivesToGround([p], slope, BU);
    let low = Infinity;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (const i of [-1, 1]) for (const k of [-1, 1]) {
      const lx = i * p.size.x, lz = k * p.size.z;
      low = Math.min(low, slope(p.pos.x + c * lx + s * lz, p.pos.z - s * lx + c * lz));
    }
    expect(q.pos.y - q.size.y).toBeLessThanOrEqual(low - SNAP_SKIRT_MM + 1e-6);
    expect(q.pos.y + q.size.y).toBeCloseTo(p.pos.y + p.size.y, 9);
  });

  it('is deterministic and leaves unsnapped primitives as the same objects', () => {
    const list = [
      prim({ id: 1, shape: 'box', pos: { x: 0, y: 9, z: 0 }, size: { x: 3, y: 3, z: 3 } }),
      prim({ id: 2, shape: 'ellipsoid', pos: { x: 9, y: 9, z: 0 }, size: { x: 3, y: 3, z: 3 } }),
    ];
    const a = snapPrimitivesToGround(list, () => 0, BU), b = snapPrimitivesToGround(list, () => 0, BU);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a[1]).toBe(list[1]);
    expect(a).toHaveLength(2);
    expect(snapPrimitivesToGround([], () => 0, BU)).toEqual([]);
  });
});
