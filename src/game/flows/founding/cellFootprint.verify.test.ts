// Reviewer tests (app-seams-4 item 5): the outcome card's picture frames the whole cell between the top margin and the card,
// queen in the middle third. Synthetic cells, the real framing chain: cellFootprint -> (shotSubject pad) -> perspectiveGrow ->
// cardFraming -> foundingShotAt, then every open voxel of the cell under the slice plane projected with a perspective camera.
import { describe, expect, it } from 'vitest';
import { cardFraming, CARD_GAP_REM, CARD_HALF_REM, CARD_TOP_MARGIN_REM, perspectiveGrow } from './cardFraming';
import { cellFootprint, FOOTPRINT_STEP_BU } from './cellFootprint';
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
  const top = CARD_TOP_MARGIN_REM * rem, cardTop = H / 2 - CARD_HALF_REM * rem;

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

  it('records how much of the band the cell uses (the report says about half): at least a third of its height', () => {
    const pts = cellPoints(seed1Like, PLANE, 30, 30);
    const r = frameCell(seed1Like, QUEEN, PLANE, W, H, 0)!;
    let minY = Infinity, maxY = -Infinity;
    for (const p of pts) { const s = project(r.shot.pose, p, W, H)!; minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y); }
    expect((maxY - minY) / (cardTop - top)).toBeGreaterThan(1 / 3);
  });
});

describe('cellFootprint edge cases (reviewer)', () => {
  it('the screen-reach sphere holds every voxel of the cell (upper bound for every yaw at the shot pitch)', () => {
    const fp = cellFootprint(seed1Like, QUEEN, PLANE, BU)!;
    expect(fp).not.toBeNull();
    // brute force: the radius on the screen of each point for 36 yaws, orthographic at the shot pitch
    const p = (52 * Math.PI) / 180;
    for (const q of cellPoints(seed1Like, PLANE, 30, 30)) {
      for (let a = 0; a < 36; a++) {
        const yaw = (a / 36) * 2 * Math.PI, dx = q.x - fp.x, dy = q.y - fp.y, dz = q.z - fp.z;
        const along = dx * Math.sin(yaw) + dz * Math.cos(yaw), across = dx * Math.cos(yaw) - dz * Math.sin(yaw);
        const sy = along * Math.sin(p) - dy * Math.cos(p);
        expect(Math.hypot(across, sy)).toBeLessThanOrEqual(fp.radius + 1e-6);
      }
    }
  });

  it('null for solid everywhere, open everywhere (a cut through air), and a tunnel running out of the probe', () => {
    expect(cellFootprint({ sampleXYZ: () => -1 }, QUEEN, PLANE, BU)).toBeNull();
    expect(cellFootprint({ sampleXYZ: () => 1 }, QUEEN, PLANE, BU)).toBeNull();
    const tunnel = fieldOf(ellipsoid({ x: 0, y: -20, z: 0 }, { x: 6, y: 4, z: 6 }), (p) => Math.min(2 - Math.hypot(p.y + 20, p.z), p.x));
    expect(cellFootprint(tunnel, { x: 0, y: -18, z: 0 }, PLANE, BU)).toBeNull();
    expect(cellFootprint(undefined, QUEEN, PLANE, BU)).toBeNull();
  });

  it('a second cavity not connected to the queen is not framed; the shared grid does not leak between calls', () => {
    const small = fieldOf(ellipsoid({ x: 0, y: -20, z: 0 }, { x: 4, y: 3, z: 4 }));
    const both = fieldOf(ellipsoid({ x: 0, y: -20, z: 0 }, { x: 4, y: 3, z: 4 }), ellipsoid({ x: 25, y: -20, z: 0 }, { x: 8, y: 4, z: 8 }));
    const big = fieldOf(ellipsoid({ x: 0, y: -25, z: 0 }, { x: 20, y: 9, z: 20 }));
    const a = cellFootprint(small, { x: 0, y: -19, z: 0 }, PLANE, BU)!;
    const b = cellFootprint(both, { x: 0, y: -19, z: 0 }, PLANE, BU)!;
    expect(b.radius).toBeCloseTo(a.radius, 6);
    expect(b.cells).toBe(a.cells);
    cellFootprint(big, { x: 0, y: -19, z: 0 }, PLANE, BU);
    const again = cellFootprint(small, { x: 0, y: -19, z: 0 }, PLANE, BU)!;
    expect(again.cells).toBe(a.cells);
  });
});

describe('cardFraming input guards (reviewer)', () => {
  it('finite lift and fill for zero, negative, NaN and huge screens', () => {
    for (const [h, rem] of [[0, 16], [-5, 16], [NaN, NaN], [720, 0], [100000, 16], [400, 40]] as const) {
      const f = cardFraming(h, rem);
      expect(Number.isFinite(f.lift) && Number.isFinite(f.fill), `${h} ${rem}`).toBe(true);
      expect(f.lift).toBeGreaterThanOrEqual(0); expect(f.lift).toBeLessThanOrEqual(0.9);
      expect(f.fill).toBeGreaterThan(0); expect(f.fill).toBeLessThanOrEqual(0.92);
    }
  });

  it('perspectiveGrow is 1 at no fill and grows with the fill', () => {
    expect(perspectiveGrow(0)).toBe(1);
    expect(perspectiveGrow(0.5)).toBeGreaterThan(perspectiveGrow(0.2));
    expect(Number.isFinite(perspectiveGrow(10))).toBe(true);
    expect(FSHOT_FOV_DEG).toBeGreaterThan(0);
  });
});
