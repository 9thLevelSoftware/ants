// app-seams-4 item 5: the cell whole between the top of the screen and the outcome card.
import { describe, expect, it } from 'vitest';
import { cardFraming } from './cardFraming';
import { cellFootprint } from './cellFootprint';
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

  it('falls back to the 720 px numbers on unusable input', () => {
    expect(cardFraming(NaN, NaN)).toEqual(cardFraming(720, 16));
  });
});

describe('cellFootprint', () => {
  const bu = 4;
  /** A round open room of radius r BU at the origin, solid elsewhere. */
  const room = (r: number) => ({ sampleXYZ: (x: number, _y: number, z: number) => r * bu - Math.hypot(x, z) });

  it('finds the bounding circle of the connected open cells (an off-centre start, the queen on the wall)', () => {
    const f = cellFootprint(room(9), 8.8 * bu, 0, 0, bu)!;
    expect(f).not.toBeNull();
    expect(f.radius / bu).toBeGreaterThan(8.7);
    expect(f.radius / bu).toBeLessThan(9.8);
    expect(Math.hypot(f.x, f.z) / bu).toBeLessThan(0.8);
  });

  it('is null for a start in solid, no field, or an open region that runs off the probe (a tunnel is no cell)', () => {
    expect(cellFootprint(room(9), 30 * bu, 0, 0, bu)).toBeNull();
    expect(cellFootprint(undefined, 0, 0, 0, bu)).toBeNull();
    expect(cellFootprint({ sampleXYZ: () => 1 }, 0, 0, 0, bu)).toBeNull();
    expect(cellFootprint({ sampleXYZ: (_x: number, _y: number, z: number) => 1.5 * bu - Math.abs(z) }, 0, 0, 0, bu)).toBeNull(); // a corridor along x
  });
});
