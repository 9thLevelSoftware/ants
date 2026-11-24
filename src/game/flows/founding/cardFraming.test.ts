// app-seams-4 item 5: the cell whole between the top of the screen and the outcome card.
import { describe, expect, it } from 'vitest';
import { cardFraming, perspectiveGrow } from './cardFraming';
import { cellFootprint, QUEEN_CENTRAL_SHARE } from './cellFootprint';
import { FSHOT_FOV_DEG } from '@/render/camera';
import { foundingShotAt, makeFoundingShot } from '@/render/camera/foundingShot';

describe('cardFraming', () => {
  it('puts the subject circle in the free band over the card: 720 px, 16 px rem', () => {
    const f = cardFraming(720, 16);
    expect(f.lift).toBeCloseTo(0.6, 6); // the band centre is 144 px from the top: 216 px above the middle = 0.6 of the half height
    expect(f.fill).toBeCloseTo(0.3333 / Math.cos((FSHOT_FOV_DEG * Math.PI) / 360), 3);
  });

  it('keeps the circle clear of the card and of the top edge, whatever the screen', () => {
    for (const [h, rem] of [[720, 16], [1080, 16], [600, 14], [900, 20]] as const) {
      const f = cardFraming(h, rem);
      // project the subject: its centre sits lift * half above the middle, its radius (r / (d tan(fov/2))) is fill * cos(fov/2) of the half height
      const half = h / 2, centre = half - f.lift * half, radius = f.fill * Math.cos((FSHOT_FOV_DEG * Math.PI) / 360) * half;
      expect(centre - radius).toBeGreaterThanOrEqual(1.4 * rem); // not cut by the top
      expect(centre + radius).toBeLessThanOrEqual(half - 5.9 * rem + 0.5); // above the card (half 5 rem) with a gap
    }
  });

  it('the camera built from it shows the sphere inside that band (end to end through foundingShotAt)', () => {
    const h = 720, f = cardFraming(h, 16);
    const shot = makeFoundingShot();
    foundingShotAt(shot, { x: 0, y: 0, z: 0, radius: 20, cutY: 0, lift: f.lift, fill: f.fill }, 0, 4);
    const half = h / 2, d = shot.distance;
    const radiusPx = (20 / (d * Math.tan((FSHOT_FOV_DEG * Math.PI) / 360))) * half;
    expect(radiusPx).toBeCloseTo(120, 0); // 240 px band
  });

  it('grows the subject by the perspective of the nearest part of the cell (about 11 % at the card shot\'s fill)', () => {
    const f = cardFraming(720, 16);
    expect(perspectiveGrow(f.fill)).toBeGreaterThan(1.08);
    expect(perspectiveGrow(f.fill)).toBeLessThan(1.15);
    expect(perspectiveGrow(0)).toBe(1);
  });

  it('falls back to the 720 px numbers on unusable input', () => {
    expect(cardFraming(NaN, NaN)).toEqual(cardFraming(720, 16));
  });
});

describe('cellFootprint', () => {
  const bu = 4;
  /** A round cavity of radius r BU centred (cx, cy, cz) BU, solid elsewhere. */
  const ball = (r: number, cx: number, cy: number, cz: number) => ({
    sampleXYZ: (x: number, y: number, z: number) => r * bu - Math.hypot(x - cx * bu, y - cy * bu, z - cz * bu),
  });

  it('bounds the connected open voxels at or under the plane, the queen (on the wall) in the middle third of the sphere', () => {
    // a cavity of 5 BU radius whose top is cut off by the plane at y = 0; the queen stands at its rim, near the plane
    const field = ball(5, 0, -4, 0), anchor = { x: 4.8 * bu, y: -0.5 * bu, z: 0 };
    const f = cellFootprint(field, anchor, 0, bu)!;
    expect(f).not.toBeNull();
    expect(f.cells).toBeGreaterThan(1000);
    // every open voxel under the plane is inside the sphere: the lowest point of the cavity and the far rim
    for (const p of [{ x: 0, y: -9 * bu + 1, z: 0 }, { x: -4.9 * bu, y: -4 * bu, z: 0 }, { x: 0, y: -4 * bu, z: 4.9 * bu }]) {
      expect(Math.hypot(p.x - f.x, p.y - f.y, p.z - f.z)).toBeLessThanOrEqual(f.radius + 1e-6);
    }
    expect(Math.hypot(anchor.x - f.x, anchor.y - f.y, anchor.z - f.z)).toBeLessThanOrEqual(f.radius * QUEEN_CENTRAL_SHARE + 1e-6);
    expect(f.radius / bu).toBeLessThan(12);
  });

  it('a cell under the queen is found, not only the throat at the plane (the footprint on the plane is a small part of it)', () => {
    // a thin shaft up to the plane from a wide chamber 6 BU below: the circle on the plane would be 1 BU, the cell is 9 BU across
    const chamber = ball(4.5, 0, -6.5, 0);
    const field = { sampleXYZ: (x: number, y: number, z: number) => Math.max(chamber.sampleXYZ(x, y, z), y > -6.5 * bu ? bu - Math.hypot(x, z) : -1) };
    const f = cellFootprint(field, { x: 0, y: -0.5 * bu, z: 0 }, 0, bu)!;
    expect(f.y).toBeLessThan(-1.5 * bu); // well under the plane (pulled toward the queen at its top by the middle-third rule)
    expect(f.radius / bu).toBeGreaterThan(5);
  });

  it('is null for a start in solid, no field, or an open region that runs off the probe (a tunnel is no cell)', () => {
    const field = ball(4, 0, -3, 0);
    expect(cellFootprint(field, { x: 30 * bu, y: -3 * bu, z: 0 }, 0, bu)).toBeNull();
    expect(cellFootprint(undefined, { x: 0, y: 0, z: 0 }, 0, bu)).toBeNull();
    expect(cellFootprint({ sampleXYZ: () => 1 }, { x: 0, y: -bu, z: 0 }, 0, bu)).toBeNull();
    expect(cellFootprint({ sampleXYZ: (_x: number, _y: number, z: number) => 1.5 * bu - Math.abs(z) }, { x: 0, y: -bu, z: 0 }, 0, bu)).toBeNull(); // a corridor along x
  });
});
