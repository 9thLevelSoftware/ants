/**
 * Where the bird's beak may strike, so that it never goes through a prop (render-side pose clamp; the sim's peck aim
 * is untouched). The visible head is a column: a beak, then a head about 9-14 mm round, so a strike is clear when a
 * few spheres up the column are clear of every hard primitive. When the sim's aim is not clear (it lies beside a pot,
 * a stone or a toy) the nearest clear spot on a widening ring round it is used instead; with none, the beak keeps to
 * its resting height above the aim (no strike).
 */
import { BIRD_AIM } from './tuning';

export interface AimXZ { x: number; z: number }

/** Free distance to hard primitives at a point (positive in free space), mm. */
export type HardDistance = (x: number, y: number, z: number) => number;

/** Spheres up the beak and head column: [height above the tip, radius], mm. `beakLen` is the beak's length. */
export function columnSpheres(beakLen: number): readonly (readonly [number, number])[] {
  return [
    [BIRD_AIM.tipLiftMm, BIRD_AIM.tipRadiusMm],
    [beakLen * 0.5, BIRD_AIM.beakRadiusMm],
    [beakLen + BIRD_AIM.headLiftMm, BIRD_AIM.headRadiusMm],
    [beakLen + BIRD_AIM.headLiftMm * 2.5, BIRD_AIM.headRadiusMm * 1.25],
  ];
}

/** Is a strike at (x, z), tip on the ground at groundY, clear of every primitive? */
export function strikeClear(x: number, z: number, groundY: number, beakLen: number, hard: HardDistance): boolean {
  for (const [h, r] of columnSpheres(beakLen)) if (hard(x, groundY + h, z) < r) return false;
  return true;
}

/**
 * The aim to strike: `aim` itself when clear, else the nearest clear point on rings of BIRD_AIM.ringsMm round it
 * (BIRD_AIM.steps points per ring, starting at `turn` radians so the pick does not favour one side), else null.
 */
export function clearAim(aim: AimXZ, turn: number, beakLen: number, groundAt: (x: number, z: number) => number, hard: HardDistance): AimXZ | null {
  if (strikeClear(aim.x, aim.z, groundAt(aim.x, aim.z), beakLen, hard)) return aim;
  for (const ring of BIRD_AIM.ringsMm) {
    for (let k = 0; k < BIRD_AIM.steps; k++) {
      const a = turn + (k * 2 * Math.PI) / BIRD_AIM.steps;
      const x = aim.x + Math.cos(a) * ring, z = aim.z + Math.sin(a) * ring;
      if (strikeClear(x, z, groundAt(x, z), beakLen, hard)) return { x, z };
    }
  }
  return null;
}
