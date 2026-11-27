import { describe, expect, it } from 'vitest';
import { FSHOT_CARD_FILL, FSHOT_CARD_LIFT, FSHOT_FILL, FSHOT_FOV_DEG, FSHOT_MIN_RADIUS_BU, FSHOT_PITCH_DEG } from './constants';
import { copyShotSubject, easeShotSubject, foundingShotAt, foundingShotDistance, makeFoundingShot, shotAskChanged, type FoundingShotSubject } from './foundingShot';
import { FSHOT_EASE_RADIUS_BU_PER_S } from './constants';

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

describe('founding shot subject easing', () => {
  const BU = 4;
  const sub = (radius: number, lift = 0): FoundingShotSubject => ({ x: 0, y: 0, z: 0, radius, cutY: 1, lift, fill: FSHOT_FILL });

  it('copies the queen\'s frame with the subject (it is not eased: the view director reads it as it is)', () => {
    const ant = { pos: { x: 1, y: 2, z: 3 }, up: { x: 0, y: 1, z: 0 }, fwd: { x: 0, y: 0, z: 1 }, lengthMm: 8.5 };
    const held = copyShotSubject(sub(2 * BU), { ...sub(2 * BU), ant });
    expect(held.ant).toBe(ant);
    expect(copyShotSubject(held, sub(2 * BU)).ant).toBeUndefined();
  });

  it('limits how fast the radius grows, and lets it arrive', () => {
    const held = copyShotSubject(sub(2 * BU), sub(2 * BU)), target = sub(40 * BU);
    easeShotSubject(held, target, 1 / 60, BU);
    expect(held.radius - 2 * BU).toBeLessThanOrEqual(FSHOT_EASE_RADIUS_BU_PER_S * BU / 60 + 1e-9);
    for (let i = 0; i < 60 * 30; i++) easeShotSubject(held, target, 1 / 60, BU);
    expect(held.radius).toBeCloseTo(target.radius, 3);
  });

  it('eases the card lift and fill, and does nothing for dt 0', () => {
    const held = copyShotSubject(sub(5 * BU), sub(5 * BU)), target = { ...sub(5 * BU, FSHOT_CARD_LIFT), fill: FSHOT_CARD_FILL };
    easeShotSubject(held, target, 0, BU);
    expect(held.lift).toBe(0);
    easeShotSubject(held, target, 1 / 60, BU);
    expect(held.lift!).toBeGreaterThan(0);
    expect(held.lift!).toBeLessThan(0.05 * FSHOT_CARD_LIFT + 0.01);
    for (let i = 0; i < 60 * 20; i++) easeShotSubject(held, target, 1 / 60, BU);
    expect(held.lift).toBeCloseTo(FSHOT_CARD_LIFT, 3);
    expect(held.fill).toBeCloseTo(FSHOT_CARD_FILL, 3);
  });
});

describe('shotAskChanged (the card opens: the picture behind it is retaken at once)', () => {
  it('is false while the source asks for the same framing, true when lift or fill change, and reads absent fields as the time-lapse framing', () => {
    expect(shotAskChanged(0, FSHOT_FILL, subject())).toBe(false);
    expect(shotAskChanged(0, FSHOT_FILL, subject({ lift: 0, fill: FSHOT_FILL }))).toBe(false);
    expect(shotAskChanged(0, FSHOT_FILL, subject({ lift: 0.5, fill: 0.3 }))).toBe(true);
    expect(shotAskChanged(0.5, 0.3, subject({ lift: 0.5, fill: 0.3 }))).toBe(false);
    expect(shotAskChanged(0.5, 0.3, subject({ lift: 0.5, fill: 0.31 }))).toBe(true);
  });
});

describe('the fitted card subject (yaw, own sphere) survives copy and ease', () => {
  it('copyShotSubject and easeShotSubject carry yawRad and the sphere of the side view', () => {
    const target = subject({ yawRad: 1.25, sphereX: 5, sphereY: -3, sphereZ: 7, sphereRadius: 21 });
    const held = copyShotSubject(subject(), target);
    expect([held.yawRad, held.sphereX, held.sphereY, held.sphereZ, held.sphereRadius]).toEqual([1.25, 5, -3, 7, 21]);
    const other = subject();
    easeShotSubject(other, target, 1 / 60, BU);
    expect([other.yawRad, other.sphereRadius]).toEqual([1.25, 21]);
    easeShotSubject(other, subject(), 1 / 60, BU); // the source stops asking for it (the card closes): it goes at once
    expect([other.yawRad, other.sphereRadius]).toEqual([undefined, undefined]);
  });
});
