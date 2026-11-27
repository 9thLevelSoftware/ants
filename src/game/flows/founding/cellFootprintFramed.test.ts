// app-seams-4 fix pass (review item 5): the card shot fits the cell on the SCREEN at a yaw of its own choice (cellFootprintFramed) instead of by a sphere: the cell
// fills most of the band between the top margin and the card, whatever its shape, and the view holds that yaw (no orbit while the card is up).
import { describe, expect, it } from 'vitest';
import { cardFraming, CARD_GAP_REM, CARD_TOP_FRACTION, CARD_TOP_MARGIN_REM, perspectiveGrow } from './cardFraming';
import { cellFootprint, cellFootprintFramed, FOOTPRINT_STEP_BU } from './cellFootprint';
import { foundingShotAt, makeFoundingShot } from '@/render/camera/foundingShot';

const BU = 4;
type V = { x: number; y: number; z: number };

/** Inside-positive pseudo distance (mm) of an ellipsoid. */
function ellipsoid(c: V, r: V) {
  return (p: V) => {
    const q = Math.hypot((p.x - c.x) / r.x, (p.y - c.y) / r.y, (p.z - c.z) / r.z);
    return (1 - q) * Math.min(r.x, r.y, r.z);
  };
}
/** Vertical cylinder from y0 up to y1. */
function shaft(x: number, z: number, rad: number, y0: number, y1: number) {
  return (p: V) => Math.min(rad - Math.hypot(p.x - x, p.z - z), p.y - y0, y1 - p.y);
}
function fieldOf(...parts: ((p: V) => number)[]) {
  return { sampleXYZ: (x: number, y: number, z: number) => Math.max(-50, ...parts.map((f) => f({ x, y, z }))) };
}

/** Perspective projection of world point q for a pose (pos, look, up world Y), viewport w x h. */
function project(pose: { pos: V; look: V; fov: number }, q: V, w: number, h: number): { x: number; y: number } | null {
  const f = norm(sub(pose.look, pose.pos)), r = norm(cross(f, { x: 0, y: 1, z: 0 })), u = cross(r, f);
  const v = sub(q, pose.pos), z = dot(v, f);
  if (z <= 0) return null;
  const t = Math.tan((pose.fov * Math.PI) / 360);
  return { x: (w / 2) * (1 + dot(v, r) / (z * t * (w / h))), y: (h / 2) * (1 - dot(v, u) / (z * t)) };
}
const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: V, b: V) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: V, b: V): V => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const norm = (a: V): V => { const l = Math.hypot(a.x, a.y, a.z) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; };

/** The cell's open points under the plane connected to the queen (brute force at the footprint's grid, for checking only). */
function cellPoints(field: { sampleXYZ(x: number, y: number, z: number): number }, planeY: number, box: number, depth: number): V[] {
  const out: V[] = [], s = FOOTPRINT_STEP_BU * BU;
  for (let y = planeY; y >= planeY - depth; y -= s) for (let x = -box; x <= box; x += s) for (let z = -box; z <= box; z += s) {
    if (field.sampleXYZ(x, y, z) > 0) out.push({ x, y, z });
  }
  return out;
}


const PLANE = -15;
const QUEEN = { x: 0, y: -17, z: 0 };
// seed 1's shape: the queen in the throat at the plane, the cell lies under her and to one side
const seed1Like = fieldOf(ellipsoid({ x: -8, y: -21, z: 2 }, { x: 9, y: 6, z: 8 }), shaft(0, 0, 2.5, -19, 20));
// a long thin cell with the queen at its end
const longCell = fieldOf(ellipsoid({ x: 0, y: -19, z: 0 }, { x: 8.5, y: 4, z: 2.5 }), shaft(-7, 0, 1.5, -19, 20));

const W = 1280, H = 720, rem = 16;
const band0 = CARD_TOP_MARGIN_REM * rem, band1 = H * CARD_TOP_FRACTION - CARD_GAP_REM * rem;

/** The card chain with the framed fit (flow.ts): returns the pose and the pixel box of every open voxel of the cell. */
function framed(field: ReturnType<typeof fieldOf>, queen: V) {
  const f = cardFraming(H, rem, W);
  const fp = cellFootprintFramed(field, queen, PLANE, BU, { kx: f.kx, kq: f.kq });
  if (!fp) return null;
  const shot = makeFoundingShot();
  foundingShotAt(shot, { x: fp.x, y: fp.y, z: fp.z, radius: (fp.radius + 0.5 * BU) * perspectiveGrow(f.fill), cutY: PLANE, lift: f.lift, fill: f.fill, minRadiusBu: 1.5, yawRad: fp.yawRad }, fp.yawRad, BU);
  const pts = cellPoints(field, PLANE, 40, 30);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { const s = project(shot.pose, p, W, H)!; x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); y0 = Math.min(y0, s.y); y1 = Math.max(y1, s.y); }
  return { fp, shot, box: { x0, x1, y0, y1 }, q: project(shot.pose, queen, W, H)!, n: pts.length };
}

describe('cellFootprintFramed (the card shot at a yaw of its own)', () => {
  for (const [name, field, queen] of [['seed-1-like', seed1Like, QUEEN], ['long thin cell, queen at the end', longCell, { x: -7, y: -17, z: 0 }]] as const) {
    it(`${name}: the whole cell lies between the top margin and the card, the queen in the middle third of the band and of the frame`, () => {
      const r = framed(field, queen)!;
      expect(r).not.toBeNull();
      expect(r.n).toBeGreaterThan(200);
      expect(r.box.y0).toBeGreaterThanOrEqual(band0 - 2);
      expect(r.box.y1).toBeLessThanOrEqual(band1 + 2);
      expect(r.box.x0).toBeGreaterThan(0.25 * W - 40); // clear of the HUD corners (their panels end at 25 % and start at 73 % of the width)
      expect(r.box.x1).toBeLessThan(0.73 * W + 40);
      const third = (band1 - band0) / 3;
      expect(r.q.y).toBeGreaterThanOrEqual(band0 + third - 6);
      expect(r.q.y).toBeLessThanOrEqual(band1 - third + 6);
      expect(Math.abs(r.q.x - W / 2)).toBeLessThanOrEqual(W / 6 + 6);
    });

    it(`${name}: fills more of the band than the sphere fit`, () => {
      const r = framed(field, queen)!;
      const f = cardFraming(H, rem, W), sph = cellFootprint(field, queen, PLANE, BU)!;
      const shot = makeFoundingShot();
      foundingShotAt(shot, { x: sph.x, y: sph.y, z: sph.z, radius: (sph.radius + 0.5 * BU) * perspectiveGrow(f.fill), cutY: PLANE, lift: f.lift, fill: f.fill, minRadiusBu: 1.5 }, 0.35, BU);
      let sx0 = Infinity, sx1 = -Infinity, sy0 = Infinity, sy1 = -Infinity;
      for (const p of cellPoints(field, PLANE, 40, 30)) { const s = project(shot.pose, p, W, H)!; sx0 = Math.min(sx0, s.x); sx1 = Math.max(sx1, s.x); sy0 = Math.min(sy0, s.y); sy1 = Math.max(sy1, s.y); }
      const area = (b: { x0: number; x1: number; y0: number; y1: number }) => (b.x1 - b.x0) * (b.y1 - b.y0);
      expect(area(r.box)).toBeGreaterThan(1.3 * area({ x0: sx0, x1: sx1, y0: sy0, y1: sy1 }));
      expect(r.box.y1 - r.box.y0).toBeGreaterThan(0.45 * (band1 - band0));
    });
  }

  it('is null for a start in solid, no field, or an open region that runs off the probe', () => {
    const f = { kx: 1.4, kq: 1 };
    expect(cellFootprintFramed(undefined, QUEEN, PLANE, BU, f)).toBeNull();
    expect(cellFootprintFramed(seed1Like, { x: 80, y: -17, z: 0 }, PLANE, BU, f)).toBeNull();
    expect(cellFootprintFramed({ sampleXYZ: () => 1 }, QUEEN, PLANE, BU, f)).toBeNull();
  });
});

describe('cardFraming room for the frame', () => {
  it('gives the horizontal room and the middle third of the frame in units of the band half height', () => {
    const f = cardFraming(H, rem, W);
    const bandHalf = (band1 - band0) / 2;
    expect(f.kq).toBeCloseTo((W / 6) / bandHalf, 6);
    expect(f.kx).toBeGreaterThan(f.kq); // the free column is wider than the middle third
    expect(cardFraming(H, rem).kx).toBeCloseTo(f.kx, 6); // no width given: 16:9
  });
});

describe('cellFootprint anyView (the sphere the cell camera\'s side view frames)', () => {
  // a deep cell: 12 BU across, 22 BU deep under a throat at the plane; the side view looks from 14 degrees, where depth counts almost in full
  const deep = fieldOf(ellipsoid({ x: 0, y: -26, z: 0 }, { x: 6, y: 11, z: 6 }), shaft(0, 0, 2.5, -22, 20));
  const queen = { x: 0, y: -17, z: 0 };

  it('holds every open voxel of a deep cell, which the top view\'s sphere (depth x cos 52) does not', () => {
    const pts = cellPoints(deep, PLANE, 40, 60);
    const any = cellFootprint(deep, queen, PLANE, BU, true)!, top = cellFootprint(deep, queen, PLANE, BU)!;
    expect(any).not.toBeNull();
    for (const p of pts) expect(Math.hypot(p.x - any.x, p.y - any.y, p.z - any.z)).toBeLessThanOrEqual(any.radius + 1e-6);
    expect(any.radius).toBeGreaterThanOrEqual(top.radius);
    const missed = pts.filter((p) => Math.hypot(p.x - top.x, p.y - top.y, p.z - top.z) > top.radius).length;
    expect(missed).toBeGreaterThan(0); // the screen-reach sphere of the top view is not a 3D sphere: the deep ends stand outside it
  });
});
