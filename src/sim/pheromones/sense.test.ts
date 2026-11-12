import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/core/math/vec3';
import { TRAIL_DAB_SPACING_BU, TRAIL_DETECT } from './balance';
import { newField, TEST_BU } from './testkit';
import type { PheromoneRuntime } from './field';

/** Plane embedding: 2D trail coordinates (u, v) -> world; `up` is the surface normal. */
interface Plane {
  origin: Vec3; u: Vec3; v: Vec3; up: Vec3;
}

const ground: Plane = { origin: { x: 0, y: 0.6, z: 0 }, u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: 1 }, up: { x: 0, y: 1, z: 0 } };
// A wall facing +X at x = 1000 mm: the trail runs in its y/z plane (climbs, bends, descends).
const wall: Plane = { origin: { x: 1000.6, y: 0, z: 0 }, u: { x: 0, y: 1, z: 0 }, v: { x: 0, y: 0, z: 1 }, up: { x: 1, y: 0, z: 0 } };

function at(pl: Plane, a: number, b: number): Vec3 {
  return {
    x: pl.origin.x + pl.u.x * a + pl.v.x * b,
    y: pl.origin.y + pl.u.y * a + pl.v.y * b,
    z: pl.origin.z + pl.u.z * a + pl.v.z * b,
  };
}

/** S-curve: straight, a left arc, a right arc, straight. 2D points every 0.25 BU, mm. */
function curvedTrail(): [number, number][] {
  const pts: [number, number][] = [];
  const bu = TEST_BU, step = 0.25 * bu;
  let x = 40 * bu, y = 40 * bu, h = 0;
  const seg = (len: number, turnRate: number) => {
    for (let s = 0; s < len; s += step) {
      pts.push([x, y]);
      h += turnRate * step;
      x += Math.cos(h) * step;
      y += Math.sin(h) * step;
    }
  };
  seg(20 * bu, 0);
  seg(60 * bu, (Math.PI / 2) / (60 * bu)); // 90 deg left over 60 BU (radius ~38 BU)
  seg(70 * bu, -(Math.PI * 0.75) / (70 * bu)); // 135 deg right over 70 BU
  seg(20 * bu, 0);
  pts.push([x, y]);
  return pts;
}

function layTrail(f: PheromoneRuntime, pl: Plane, pts: [number, number][]): void {
  // Ten foragers' worth of dabs every 1.5 BU.
  let acc = Infinity;
  for (let i = 1; i < pts.length; i++) {
    acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (acc >= TRAIL_DAB_SPACING_BU * TEST_BU) {
      acc = 0;
      f.deposit(1, 'trail', at(pl, pts[i][0], pts[i][1]), 2.5);
    }
  }
}

function distToTrail(pl: Plane, pts: [number, number][], p: Vec3): number {
  let best = Infinity;
  for (const [a, b] of pts) {
    const q = at(pl, a, b);
    best = Math.min(best, Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z));
  }
  return best;
}

/**
 * Walks an ant by repeatedly stepping along senseDirection (6 BU/s, 0.1 s steps: the new heading IS the sensed
 * one). Returns the worst deviation from the trail line and whether it reached the end.
 */
function follow(f: PheromoneRuntime, pl: Plane, pts: [number, number][]) {
  const pos = at(pl, pts[0][0], pts[0][1]);
  const p1 = at(pl, pts[8][0], pts[8][1]);
  const fwd = { x: p1.x - pos.x, y: p1.y - pos.y, z: p1.z - pos.z };
  const l = Math.hypot(fwd.x, fwd.y, fwd.z);
  fwd.x /= l; fwd.y /= l; fwd.z /= l;
  const end = at(pl, pts[pts.length - 1][0], pts[pts.length - 1][1]);
  const out = { x: 0, y: 0, z: 0 };
  const stepLen = 0.6 * TEST_BU;
  let worst = 0, minStrength = Infinity, reached = false;
  for (let i = 0; i < 2000; i++) {
    const s = f.sense(1, 'trail', pos, fwd, pl.up, out);
    minStrength = Math.min(minStrength, s);
    fwd.x = out.x; fwd.y = out.y; fwd.z = out.z;
    pos.x += fwd.x * stepLen; pos.y += fwd.y * stepLen; pos.z += fwd.z * stepLen;
    worst = Math.max(worst, distToTrail(pl, pts, pos));
    if (i % 20 === 0 && process.env.DBG) console.log(i, s.toFixed(3), f.lastSense.left.toFixed(3), f.lastSense.centre.toFixed(3), f.lastSense.right.toFixed(3), f.lastSense.angle.toFixed(3), distToTrail(pl, pts, pos).toFixed(1));
    if (Math.hypot(pos.x - end.x, pos.y - end.y, pos.z - end.z) < 2 * TEST_BU) { reached = true; break; }
  }
  return { worst, reached, minStrength };
}

describe('senseDirection follows a curved trail end to end', () => {
  for (const [name, pl] of [['flat ground', ground], ['vertical wall', wall]] as const) {
    it(`on ${name}`, () => {
      const f = newField();
      const pts = curvedTrail();
      layTrail(f, pl, pts);
      const r = follow(f, pl, pts);
      if (process.env.DBG2) expect(name + JSON.stringify(r)).toBe('');
      expect(r.reached).toBe(true);
      expect(r.worst).toBeLessThan(4 * TEST_BU); // stays within one cell of the trail line
      expect(r.minStrength).toBeGreaterThan(TRAIL_DETECT); // never loses the trail
    });
  }

  it('returns the heading in the tangent plane, unit length; fwd when nothing is sensed', () => {
    const f = newField();
    const out = { x: 0, y: 0, z: 0 };
    const s = f.sense(1, 'trail', { x: 0, y: 0, z: 0 }, { x: 0.6, y: 0.8, z: 0 }, { x: 0, y: 1, z: 0 }, out);
    expect(s).toBe(0);
    expect(out.x).toBeCloseTo(1, 9);
    expect(out.y).toBeCloseTo(0, 9);
    // Trail to the right of a +Z heading on the ground (right = -X): turn right, heading has -X and +Z.
    for (let k = 0; k < 20; k++) f.deposit(1, 'trail', { x: -20, y: 0.6, z: k * 16 }, 3);
    f.sense(1, 'trail', { x: -12, y: 0.6, z: 40 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 1, z: 0 }, out);
    expect(f.lastSense.angle).toBeGreaterThan(0);
    expect(out.x).toBeLessThan(0);
    expect(out.z).toBeGreaterThan(0);
    expect(Math.hypot(out.x, out.y, out.z)).toBeCloseTo(1, 9);
    expect(out.y).toBeCloseTo(0, 9);
  });
});
