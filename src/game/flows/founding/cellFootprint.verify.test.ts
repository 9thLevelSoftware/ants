// Reviewer tests (app-seams-4 item 5): the outcome card's picture frames the whole cell between the top margin and the card,
// queen in the middle third. Synthetic cells, the real framing chain: cellFootprint -> (shotSubject pad) -> perspectiveGrow ->
// cardFraming -> foundingShotAt, then every open voxel of the cell under the slice plane projected with a perspective camera.
import { describe, expect, it } from 'vitest';
import { cardFraming, CARD_GAP_REM, CARD_TOP_FRACTION, CARD_TOP_MARGIN_REM, perspectiveGrow } from './cardFraming';
import { cellFootprint, cellFootprintFramed, FOOTPRINT_STEP_BU } from './cellFootprint';
import { FSHOT_FOV_DEG } from '@/render/camera';
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

/** The card chain of flow.ts / shotSubject.ts for a cell, at viewport w x h, rem 16, seen from `yawRad`. */
function frameCell(field: ReturnType<typeof fieldOf>, queen: V, planeY: number, w: number, h: number, yawRad: number) {
  const fp = cellFootprint(field, queen, planeY, BU);
  if (!fp) return null;
  const f = cardFraming(h, 16);
  const radius = (fp.radius + 0.5 * BU) * perspectiveGrow(f.fill); // shotSubject: + SPREAD_PAD_BU * bu * 0.5; flow: * perspectiveGrow
  const shot = makeFoundingShot();
  foundingShotAt(shot, { x: fp.x, y: fp.y, z: fp.z, radius, cutY: planeY, lift: f.lift, fill: f.fill, minRadiusBu: 1.5 }, yawRad, BU);
  return { fp, shot, f };
}

// seed 1's shape (app4 probe-s1 log): the queen stands in the throat at the plane, the cell lies under her and to one side
const PLANE = -15;
const QUEEN = { x: 0, y: -17, z: 0 };
const seed1Like = fieldOf(ellipsoid({ x: -8, y: -21, z: 2 }, { x: 9, y: 6, z: 8 }), shaft(0, 0, 2.5, -19, 20));

describe('outcome card framing, end to end (reviewer)', () => {
  const W = 1280, H = 720, rem = 16;
  const top = CARD_TOP_MARGIN_REM * rem, cardTop = H * CARD_TOP_FRACTION; // the card hangs from 62 % of the height (fix pass; it was centred)

  it('every open voxel of the cell under the plane lands between the top margin and the card, from every yaw of the slow orbit', () => {
    const pts = cellPoints(seed1Like, PLANE, 30, 30);
    expect(pts.length).toBeGreaterThan(200);
    for (let a = 0; a < 12; a++) {
      const yaw = (a / 12) * 2 * Math.PI;
      const r = frameCell(seed1Like, QUEEN, PLANE, W, H, yaw)!;
      expect(r, `yaw ${a}`).not.toBeNull();
      let minY = Infinity, maxY = -Infinity;
      for (const p of pts) {
        const s = project(r.shot.pose, p, W, H)!;
        minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y);
      }
      expect(minY, `yaw ${a}: cut by the top`).toBeGreaterThanOrEqual(top - 2);
      expect(maxY, `yaw ${a}: behind the card`).toBeLessThanOrEqual(cardTop - CARD_GAP_REM * rem * 0.5);
    }
  });

  it('the queen stands in the middle third of the free band (spec item 5)', () => {
    const band0 = top, band1 = cardTop - CARD_GAP_REM * rem, third = (band1 - band0) / 3;
    for (let a = 0; a < 12; a++) {
      const r = frameCell(seed1Like, QUEEN, PLANE, W, H, (a / 12) * 2 * Math.PI)!;
      const q = project(r.shot.pose, QUEEN, W, H)!;
      expect(q.y, `yaw ${a}`).toBeGreaterThanOrEqual(band0 + third - 4);
      expect(q.y, `yaw ${a}`).toBeLessThanOrEqual(band1 - third + 4);
      expect(Math.abs(q.x - W / 2), `yaw ${a}`).toBeLessThanOrEqual((band1 - band0) / 2);
    }
  });

  it('records how much of the band the cell uses: more than half of its height (fix pass: the card shot fits the cell on the screen, cellFootprintFramed; the sphere fit gave a third)', () => {
    const pts = cellPoints(seed1Like, PLANE, 30, 30);
    const f = cardFraming(H, rem, W);
    const fp = cellFootprintFramed(seed1Like, QUEEN, PLANE, BU, { kx: f.kx, kq: f.kq })!;
    const shot = makeFoundingShot();
    foundingShotAt(shot, { x: fp.x, y: fp.y, z: fp.z, radius: (fp.radius + 0.5 * BU) * perspectiveGrow(f.fill), cutY: PLANE, lift: f.lift, fill: f.fill, minRadiusBu: 1.5, yawRad: fp.yawRad }, fp.yawRad, BU);
    let minY = Infinity, maxY = -Infinity;
    for (const p of pts) { const s = project(shot.pose, p, W, H)!; minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y); }
    expect((maxY - minY) / (cardTop - top)).toBeGreaterThan(0.5);
  });
});
