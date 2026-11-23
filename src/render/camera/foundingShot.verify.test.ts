// Review of look pass 5 (adversarial): the founding shot's geometry, checked by projecting the subject through the pose.
import { describe, expect, it } from 'vitest';
import { FSHOT_CARD_FILL, FSHOT_CARD_LIFT, FSHOT_FILL, FSHOT_FOV_DEG, FSHOT_MIN_RADIUS_BU, FSHOT_PITCH_DEG } from './constants';
import { foundingShotAt, makeFoundingShot, type FoundingShotSubject } from './foundingShot';

const BU = 4;
type V = { x: number; y: number; z: number };
const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: V, b: V) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: V, b: V): V => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const norm = (a: V): V => { const l = Math.hypot(a.x, a.y, a.z); return { x: a.x / l, y: a.y / l, z: a.z / l }; };

/** Vertical screen position of `p` in the pose, -1 (bottom) .. 1 (top), as a perspective camera with that up vector draws it. */
function screenY(pose: { pos: V; look: V; up: V; fov: number }, p: V): number {
  const f = norm(sub(pose.look, pose.pos));
  const r = norm(cross(f, pose.up));
  const u = cross(r, f);
  const d = sub(p, pose.pos);
  return dot(d, u) / dot(d, f) / Math.tan((pose.fov * Math.PI / 180) / 2);
}

const subject = (o: Partial<FoundingShotSubject> = {}): FoundingShotSubject => ({ x: 1000, y: -16, z: 2000, radius: 30, cutY: -13, ...o });

describe('founding shot geometry (review)', () => {
  it('puts the subject in the middle of the frame during the lapse, and `lift` of the half height above it behind a card', () => {
    const s = makeFoundingShot();
    for (const yaw of [0, 1, 2.5, -2]) {
      foundingShotAt(s, subject(), yaw, BU);
      expect(screenY(s.pose, subject())).toBeCloseTo(0, 6);
      foundingShotAt(s, subject({ lift: FSHOT_CARD_LIFT, fill: FSHOT_CARD_FILL }), yaw, BU);
      expect(screenY(s.pose, subject())).toBeCloseTo(FSHOT_CARD_LIFT, 3);
    }
  });

  it('keeps the whole subject sphere in the frame behind a card (top of the sphere below the top edge)', () => {
    const s = makeFoundingShot();
    const c = subject({ lift: FSHOT_CARD_LIFT, fill: FSHOT_CARD_FILL });
    foundingShotAt(s, c, 0.6, BU);
    const half = Math.asin(FSHOT_CARD_FILL * Math.sin((FSHOT_FOV_DEG * Math.PI / 180) / 2));
    // angular radius of the sphere seen from the camera is the fill share of the half fov; lifted by `lift`: it must not leave the frame
    expect(FSHOT_CARD_LIFT + Math.tan(half) / Math.tan((FSHOT_FOV_DEG * Math.PI / 180) / 2)).toBeLessThan(1.2);
    expect(screenY(s.pose, { x: c.x, y: c.y + c.radius, z: c.z })).toBeLessThan(1);
  });

  it('looks down at the pitch, the near plane stays in front of the subject, the slice contains the line of sight', () => {
    const s = makeFoundingShot();
    const c = subject();
    foundingShotAt(s, c, 0.3, BU);
    const d = sub(c, s.pose.pos), dist = Math.hypot(d.x, d.y, d.z);
    expect(Math.asin(-d.y / dist) * 180 / Math.PI).toBeCloseTo(FSHOT_PITCH_DEG, 6);
    expect(s.pose.near).toBeLessThan(dist - c.radius);
    expect(s.cutaway.radius).toBeGreaterThan(Math.hypot(s.pose.pos.x - c.x, s.pose.pos.z - c.z));
    expect(s.cutaway.planeY).toBe(c.cutY);
    expect(dist).toBeCloseTo(c.radius / (FSHOT_FILL * Math.sin((FSHOT_FOV_DEG * Math.PI / 180) / 2)), 6);
  });

  it('a zero or negative radius gets the chamber-sized minimum frame, finite everywhere', () => {
    const s = makeFoundingShot();
    for (const r of [0, -5]) {
      foundingShotAt(s, subject({ radius: r }), 0, BU);
      for (const v of [s.pose.pos.x, s.pose.pos.y, s.pose.pos.z, s.pose.look.x, s.pose.look.y, s.pose.near, s.distance]) expect(Number.isFinite(v)).toBe(true);
      expect(s.distance).toBeCloseTo(FSHOT_MIN_RADIUS_BU * BU / (FSHOT_FILL * Math.sin((FSHOT_FOV_DEG * Math.PI / 180) / 2)), 6);
    }
  });

  it('is allocation-free in use: the same objects are filled every call', () => {
    const s = makeFoundingShot();
    const pose = s.pose, cut = s.cutaway, pos = s.pose.pos;
    foundingShotAt(s, subject({ lift: 0.3 }), 1, BU);
    expect(s.pose).toBe(pose); expect(s.cutaway).toBe(cut); expect(s.pose.pos).toBe(pos);
  });
});
