// The colony view's closest zoom follows the nest's span (nestSpanBu -> ColonyRig.setNestSpan). On the real founding
// nest (geometry measured in the browser after the hand-over, see nestSpan.verify.test.ts) the closest view must come
// in well past the large-nest 30 BU, and the chamber must stay inside the picture at that distance even though the
// camera aims at the ground surface above it.
import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { ColonyRig } from '@/render/camera/colonyRig';
import { CV_DIST_BU, CV_FOV_DEG, CV_PITCH_DEG } from '@/render/camera/constants';
import { nestSpanBu } from './viewsLayer';

const BU = 4;
type Ch = { center: { x: number; y: number; z: number }; radii: { x: number; y: number; z: number } };

function simWith(chambers: Ch[], entrances: { x: number; y: number; z: number }[]): Sim {
  const nest = { colony: 1, chambers: chambers.map((c) => ({ type: 'royal', ...c })), entrances: entrances.map((pos) => ({ pos })) };
  return { state: { colonies: [{ id: 1 }], nests: [nest] }, world: { bu: BU } } as unknown as Sim;
}

const ROYAL: Ch = { center: { x: 1000, y: -25.1, z: 1000 }, radii: { x: 9, y: 5, z: 9 } };
const MOUND_ENTRANCE = { x: 1003, y: 16.7, z: 1003 };
/** The entrance as the founding cheat placed it in the browser check (32 mm to the side of the chamber centre). */
const SIDE_ENTRANCE = { x: 1000 - 32.3, y: 16.3, z: 1000.6 };

describe('nestSpanBu', () => {
  it('a founding nest spans its chamber, wherever its entrance is (on the mound above, or off to the side)', () => {
    expect(nestSpanBu(simWith([ROYAL], [MOUND_ENTRANCE]))).toBeCloseTo(18 / BU, 6);
    expect(nestSpanBu(simWith([ROYAL], [SIDE_ENTRANCE]))).toBeCloseTo(18 / BU, 6);
  });

  it('chambers spread apart or in depth widen the span', () => {
    const far: Ch = { center: { x: 1000 + 60, y: -25.1, z: 1000 }, radii: { x: 9, y: 5, z: 9 } };
    expect(nestSpanBu(simWith([ROYAL, far], [MOUND_ENTRANCE]))).toBeCloseTo((60 + 18) / BU, 6);
    const deep: Ch = { center: { x: 1000, y: -125, z: 1000 }, radii: { x: 9, y: 5, z: 9 } };
    expect(nestSpanBu(simWith([ROYAL, deep], [MOUND_ENTRANCE]))).toBeCloseTo((130 - 20.1) / BU, 6);
  });

  it('no chamber: 0 (the rig keeps the large-nest minimum)', () => {
    expect(nestSpanBu(simWith([], [MOUND_ENTRANCE]))).toBe(0);
  });
});

describe('closest colony view on the founding nest', () => {
  it('comes in to about a third of the large-nest minimum and keeps the chamber in the picture at every pitch', () => {
    const rig = new ColonyRig({ bu: BU, worldSize: 4000 });
    rig.setNestSpan(nestSpanBu(simWith([ROYAL], [MOUND_ENTRANCE])));
    expect(rig.minDistanceBu).toBeLessThanOrEqual(0.4 * CV_DIST_BU[0]);
    const ground = () => 0;
    rig.enter({ x: ROYAL.center.x, y: ROYAL.center.y, z: ROYAL.center.z }, true, ground);
    for (const pitchDeg of CV_PITCH_DEG) {
      rig.pitch = (pitchDeg * Math.PI) / 180;
      const pose = rig.update(0.016, { yawDeg: 0, pitchDeg: 0, zoomLog: -20, pan: { x: 0, y: 0 } }, { groundHeight: ground });
      expect(rig.distance / BU).toBeCloseTo(rig.minDistanceBu, 6);
      // angle between the view axis and the chamber floor (its lowest point, the farthest from the aim)
      const ax = pose.look.x - pose.pos.x, ay = pose.look.y - pose.pos.y, az = pose.look.z - pose.pos.z;
      const floorY = ROYAL.center.y - ROYAL.radii.y;
      const cx = ROYAL.center.x - pose.pos.x, cy = floorY - pose.pos.y, cz = ROYAL.center.z - pose.pos.z;
      const cos = (ax * cx + ay * cy + az * cz) / (Math.hypot(ax, ay, az) * Math.hypot(cx, cy, cz));
      expect((Math.acos(cos) * 180) / Math.PI, `pitch ${pitchDeg}`).toBeLessThan(CV_FOV_DEG / 2);
    }
  });
});
