import { describe, expect, it } from 'vitest';
import { FSHOT_CARD_FILL, FSHOT_CARD_LIFT, FSHOT_FILL, FSHOT_FOV_DEG, FSHOT_MIN_RADIUS_BU, FSHOT_PITCH_DEG } from './constants';
import { foundingShotAt, foundingShotDistance, makeFoundingShot, type FoundingShotSubject } from './foundingShot';

const BU = 4;
const subject = (o: Partial<FoundingShotSubject> = {}): FoundingShotSubject => ({ x: 8153, y: -14, z: 10871, radius: 13, cutY: -12, ...o });

/** Normalised device y (-1..1, up positive) of a world point seen by the pose. */
function ndcY(p: { pos: { x: number; y: number; z: number }; look: { x: number; y: number; z: number }; fov: number }, q: { x: number; y: number; z: number }): number {
  const sub = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
  const dot = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => a.x * b.x + a.y * b.y + a.z * b.z;
  const norm = (a: { x: number; y: number; z: number }) => { const l = Math.hypot(a.x, a.y, a.z); return { x: a.x / l, y: a.y / l, z: a.z / l }; };
  const f = norm(sub(p.look, p.pos));
  const r = norm({ x: -f.z, y: 0, z: f.x });
  const u = { x: r.y * f.z - r.z * f.y, y: r.z * f.x - r.x * f.z, z: r.x * f.y - r.y * f.x };
  const d = sub(q, p.pos);
  return (dot(d, u) / dot(d, f)) / Math.tan((p.fov * Math.PI) / 360);
}

describe('founding chamber shot', () => {
  it('stands above the cell at the shot pitch and looks at its centre', () => {
    const s = subject(), out = foundingShotAt(makeFoundingShot(), s, 0.6, BU);
    const d = out.pose.pos;
    expect(d.y).toBeGreaterThan(s.y);
    const horiz = Math.hypot(d.x - s.x, d.z - s.z), rise = d.y - s.y;
    expect(Math.atan2(rise, horiz) * 180 / Math.PI).toBeCloseTo(FSHOT_PITCH_DEG, 3);
    expect(Math.hypot(horiz, rise)).toBeCloseTo(out.distance, 6);
    expect(out.pose.look).toEqual({ x: s.x, y: s.y, z: s.z });
    expect(out.pose.fov).toBe(FSHOT_FOV_DEG);
  });

  it('frames the subject sphere inside the frame, and never smaller than a chamber', () => {
    const tiny = foundingShotAt(makeFoundingShot(), subject({ radius: 1 }), 0, BU);
    expect(tiny.distance).toBeCloseTo(foundingShotDistance(FSHOT_MIN_RADIUS_BU * BU), 6);
    const big = foundingShotAt(makeFoundingShot(), subject({ radius: 60 }), 0, BU);
    expect(big.distance).toBeGreaterThan(tiny.distance * 2);
    // the sphere's top and bottom as seen from the camera stay in the frame
    const edge = 13 / (FSHOT_FILL * Math.sin((FSHOT_FOV_DEG * Math.PI) / 360));
    expect(edge).toBeGreaterThan(0);
    const s = subject(), o = foundingShotAt(makeFoundingShot(), s, 0, BU).pose;
    expect(Math.abs(ndcY(o, { x: s.x, y: s.y + 13, z: s.z }))).toBeLessThan(1);
  });

  it('the slice plane is the subject cut height, centred on the cell, wide enough to hold the line of sight', () => {
    const s = subject(), o = foundingShotAt(makeFoundingShot(), s, 1.2, BU);
    expect(o.cutaway.mode).toBe('slice');
    expect(o.cutaway.planeY).toBe(s.cutY);
    expect(o.cutaway.center).toEqual({ x: s.x, z: s.z });
    const reach = Math.hypot(o.pose.pos.x - s.x, o.pose.pos.z - s.z);
    expect(o.cutaway.radius).toBeGreaterThan(reach);
  });

  it('lift puts the cell in the upper part of the frame (behind a card in the middle), without changing the distance for equal fill', () => {
    const s = subject(), flat = foundingShotAt(makeFoundingShot(), s, 0.3, BU);
    expect(ndcY(flat.pose, { x: s.x, y: s.y, z: s.z })).toBeCloseTo(0, 6);
    const c = foundingShotAt(makeFoundingShot(), subject({ lift: FSHOT_CARD_LIFT, fill: FSHOT_CARD_FILL }), 0.3, BU);
    expect(ndcY(c.pose, { x: s.x, y: s.y, z: s.z })).toBeCloseTo(FSHOT_CARD_LIFT, 6);
  });

  it('the orbit keeps the distance and the height', () => {
    const a = foundingShotAt(makeFoundingShot(), subject(), 0, BU), pa = { ...a.pose.pos };
    const b = foundingShotAt(makeFoundingShot(), subject(), 2.1, BU);
    expect(b.pose.pos.y).toBeCloseTo(pa.y, 9);
    expect(b.distance).toBeCloseTo(a.distance, 9);
  });
});
