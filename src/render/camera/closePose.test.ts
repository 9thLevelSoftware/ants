// Look pass 3 review (stage1a strict): a possession camera in a queen's cell. The cell is a low disc; the pivot base just above the queen has
// no room for the camera sphere, but the room has places that do. The rig must stand there (a valid pose or a close chase pose), keep the
// GDD radius and clearance, and keep the queen in view - not collapse onto the pivot (a frame of soil) or shrink the GDD radius to pass its own check.
import { describe, expect, it } from 'vitest';
import { v3Distance, v3Normalize, v3Sub, vec3 } from '@/core';
import { makeSphereTracer, type FieldFn } from './sphereTrace';
import { ThirdPersonRig } from './thirdPersonRig';
import { NO_ORBIT_INPUT, type CameraTarget } from './types';
import { DEG } from './frameMath';

const BU = 4, ROOM_R = 12;
/** A disc room of height h (floor at y = 0) and radius ROOM_R round the origin: f > 0 inside, the distance to the nearest wall. */
const disc = (h: number): FieldFn => (x, y, z) => Math.min(y, h - y, ROOM_R - Math.hypot(x, z));

function settle(h: number) {
  const field = disc(h), env = { trace: makeSphereTracer(field) };
  const r = new ThirdPersonRig({ bu: BU, bodyL: 2, autoFollow: 'off' });
  const t: CameraTarget = { pos: vec3(0, 0.3, 0), up: vec3(0, 1, 0), fwd: vec3(1, 0, 0) }; // the queen on the floor, her back 0.4 mm under the ceiling at h = 3
  let out = r.update(0, t, NO_ORBIT_INPUT, env);
  const frames: { pos: typeof out.pos; f: number }[] = [];
  for (let i = 0; i < 90; i++) { out = r.update(1 / 30, t, NO_ORBIT_INPUT, env); frames.push({ pos: { ...out.pos }, f: field(out.pos.x, out.pos.y, out.pos.z) }); }
  return { r, out, field, env, t, frames };
}

describe('possession camera in a queen\'s cell (a low disc room, BU 4, queen L 8 mm)', () => {
  for (const h of [2.2, 2.6, 3, 4, 6]) {
    it(`room ${h} mm high: the GDD radius and clearance hold, the camera is clear of the pivot and sees the queen`, () => {
      const { r, out, field, env, t, frames } = settle(h);
      expect(r.clearanceHonoured, 'a room of twice the clearance has a place for the camera').toBe(true);
      expect(out.clearanceHonoured).toBe(true);
      expect(r.radiusMm).toBeCloseTo(r.nominalRadiusMm, 9);
      expect(r.nominalRadiusMm).toBeCloseTo(2, 9); // 0.5 BU
      for (const fr of frames) expect(fr.f, 'f(camera) >= 0.5 x the GDD radius on every frame').toBeGreaterThanOrEqual(r.clearanceMm - 1e-9);
      // not collapsed onto the ant: at least half a body length away, with the queen in sight and in the middle of the picture
      const away = v3Distance(out.pos, t.pos);
      expect(away, `camera ${away.toFixed(2)} mm from the queen`).toBeGreaterThan(0.5 * r.lengthMm);
      const dir = v3Sub(vec3(), t.pos, out.pos); const d = v3Normalize(dir, dir);
      expect(env.trace(out.pos, dir, d, 0), 'a free line from the camera to the queen').toBeGreaterThanOrEqual(d * 0.97);
      const view = v3Sub(vec3(), out.look, out.pos); v3Normalize(view, view);
      const cos = view.x * dir.x + view.y * dir.y + view.z * dir.z;
      expect(Math.acos(Math.min(1, cos)) / DEG, 'the queen is near the centre of the view').toBeLessThan(25);
      expect(field(out.look.x, out.look.y, out.look.z)).toBeGreaterThan(0);
    });
  }

  it('the pose is stable: a settled camera does not wander from frame to frame', () => {
    const { frames } = settle(2.2);
    const last = frames.slice(-30);
    let worst = 0;
    for (let i = 1; i < last.length; i++) worst = Math.max(worst, v3Distance(last[i]!.pos, last[i - 1]!.pos));
    expect(worst).toBeLessThan(0.05);
  });

  it('a room lower than twice the clearance (no camera could stand in it) is reported, and the camera is still in free space', () => {
    const { r, out, field, frames } = settle(1.4);
    expect(r.clearanceHonoured).toBe(false);
    expect(out.clearanceHonoured).toBe(false);
    expect(r.radiusMm).toBeLessThan(r.nominalRadiusMm);
    for (const fr of frames) { expect(fr.f).toBeGreaterThan(0); expect(fr.f).toBeGreaterThanOrEqual(r.clearanceMm - 1e-9); }
    expect(field(out.pos.x, out.pos.y, out.pos.z)).toBeGreaterThan(0);
  });
});
