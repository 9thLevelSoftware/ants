import { describe, expect, it } from 'vitest';
import { PhotoRig, makePose, makeSphereTracer } from '@/render/camera';
import { orbitAround } from './orbit';
import { viewDirection } from './lens';

const BU = 4;
// ground plane y = 0: f = y (positive above)
const trace = makeSphereTracer((_x, y) => y);

function rigAt(pos: { x: number; y: number; z: number }, look: { x: number; y: number; z: number }) {
  const r = new PhotoRig(BU);
  const p = makePose();
  p.pos = pos; p.look = look;
  r.enter(p);
  return r;
}
const dist = (r: PhotoRig, c: { x: number; y: number; z: number }) => Math.hypot(r.pos.x - c.x, r.pos.y - c.y, r.pos.z - c.z);

describe('orbit about a subject', () => {
  const c = { x: 0, y: 100, z: 0 };
  it('keeps the distance and keeps the subject at the centre of the view', () => {
    const r = rigAt({ x: 0, y: 100, z: 40 }, c);
    const d0 = dist(r, c);
    for (let i = 0; i < 20; i++) orbitAround(r, c, 17, 3, trace);
    expect(dist(r, c)).toBeCloseTo(d0, 6);
    const v = viewDirection(r, { x: 0, y: 0, z: 0 });
    const to = { x: c.x - r.pos.x, y: c.y - r.pos.y, z: c.z - r.pos.z }, l = Math.hypot(to.x, to.y, to.z);
    expect(v.x * to.x / l + v.y * to.y / l + v.z * to.z / l).toBeGreaterThan(0.9999);
  });
  it('a full turn comes back to where it began', () => {
    const r = rigAt({ x: 0, y: 100, z: 40 }, c);
    const start = { ...r.pos };
    for (let i = 0; i < 12; i++) orbitAround(r, c, 30, 0, trace);
    expect(Math.hypot(r.pos.x - start.x, r.pos.y - start.y, r.pos.z - start.z)).toBeLessThan(1e-6);
  });
  it('never goes into the ground, however far the view is told to pitch up (the camera swings under the subject)', () => {
    const low = { x: 0, y: 12, z: 0 };
    const r = rigAt({ x: 0, y: 14, z: 30 }, low);
    for (let i = 0; i < 30; i++) {
      orbitAround(r, low, 0, 40, trace);
      expect(r.pos.y).toBeGreaterThan(0);
    }
    expect(r.pos.y).toBeGreaterThan(0.3 * BU * 0.5); // clear of the surface by about the collision radius
  });
  it('ignores NaN and zero input', () => {
    const r = rigAt({ x: 0, y: 100, z: 40 }, c);
    const p = { ...r.pos };
    expect(orbitAround(r, c, NaN, 0, trace)).toBe(0);
    expect(orbitAround(r, c, 0, 0, trace)).toBe(0);
    expect(r.pos).toEqual(p);
  });

  it('a subject off the view axis keeps its place in the picture while the camera turns about it', () => {
    // subject framed on the right: 30 degrees off the view axis, as after a rule-of-thirds composition
    const target = { x: 0, y: 100, z: 0 };
    const r = rigAt({ x: 0, y: 100, z: 40 }, { x: -22, y: 100, z: 0 });
    const angleTo = () => {
      const v = viewDirection(r, { x: 0, y: 0, z: 0 });
      const to = { x: target.x - r.pos.x, y: target.y - r.pos.y, z: target.z - r.pos.z }, l = Math.hypot(to.x, to.y, to.z);
      return Math.acos((v.x * to.x + v.y * to.y + v.z * to.z) / l);
    };
    const d0 = dist(r, target), a0 = angleTo();
    expect(a0).toBeGreaterThan(0.3);
    for (let i = 0; i < 8; i++) orbitAround(r, target, 23, i % 2 ? -6 : 9, trace);
    expect(dist(r, target)).toBeCloseTo(d0, 6);
    expect(angleTo()).toBeCloseTo(a0, 6);
  });
  it('the first small turn moves the camera by about the arc length, whichever way the subject lies', () => {
    for (const camera of [{ x: 0, y: 100, z: 40 }, { x: 40, y: 100, z: 0 }, { x: -28, y: 128, z: -28 }]) {
      const r = rigAt(camera, { x: 40, y: 100, z: -90 }); // looking away from the subject altogether
      const p0 = { ...r.pos }, radius = dist(r, c);
      orbitAround(r, c, 1, 1, trace);
      expect(Math.hypot(r.pos.x - p0.x, r.pos.y - p0.y, r.pos.z - p0.z)).toBeLessThan(2.1 * radius * (Math.PI / 180));
    }
  });
  it('when the ground stops the turn the subject still keeps its place in the picture', () => {
    const low = { x: 0, y: 12, z: 0 };
    const r = rigAt({ x: 0, y: 14, z: 30 }, { x: -9, y: 12, z: 0 });
    const angle = () => {
      const v = viewDirection(r, { x: 0, y: 0, z: 0 });
      const to = { x: low.x - r.pos.x, y: low.y - r.pos.y, z: low.z - r.pos.z }, l = Math.hypot(to.x, to.y, to.z);
      return Math.acos((v.x * to.x + v.y * to.y + v.z * to.z) / l);
    };
    const a0 = angle();
    for (let i = 0; i < 20; i++) orbitAround(r, low, 15, 40, trace);
    expect(r.pos.y).toBeGreaterThan(0);
    expect(angle()).toBeCloseTo(a0, 2);
  });
});
