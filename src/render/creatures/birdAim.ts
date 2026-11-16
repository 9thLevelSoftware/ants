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

/**
 * The field reports free distance only up to its hash margin (4 BU) away from primitives, so a sphere wider than
 * that margin could never test clear. A point this high is free of everything, so the field's value there is the
 * margin (or more); each sphere's radius is capped by it.
 */
export function freeCeiling(hard: HardDistance, x: number, z: number): number {
  const c = hard(x, BIRD_AIM.skyProbeMm, z);
  return Number.isFinite(c) && c > 0 ? c : Infinity;
}

/**
 * Is a strike at (x, z), tip on the surface at groundY, clear of every primitive? `ceiling` caps the sphere radii
 * (see freeCeiling); `slackMm` lets a sphere rest tangent to a surface without float noise deciding the answer.
 */
export function strikeClear(x: number, z: number, groundY: number, beakLen: number, hard: HardDistance, ceiling = Infinity): boolean {
  for (const [h, r] of columnSpheres(beakLen)) if (hard(x, groundY + h, z) + BIRD_AIM.slackMm < Math.min(r, ceiling)) return false;
  return true;
}

/**
 * Height of the surface a bird can stand on at (x, z): the terrain, or the top of a primitive reached by sphere
 * tracing down from `fromY`. null when `fromY` is already inside a primitive (the spot is a wall or a pot's body).
 */
export function standHeight(x: number, z: number, fromY: number, groundAt: (x: number, z: number) => number, hard: HardDistance): number | null {
  const floor = groundAt(x, z);
  let y = Math.max(fromY, floor);
  for (let i = 0; i < BIRD_AIM.traceSteps; i++) {
    if (y <= floor) return floor;
    const d = hard(x, y, z);
    if (d < 0) return i === 0 ? null : y;
    if (d < BIRD_AIM.slackMm) return y;
    y -= d;
  }
  return Math.max(y, floor);
}

/**
 * The aim to strike: `aim` itself when clear (its column starts at the sim's aim height `aim.y`, or the terrain when
 * higher), else the nearest clear point on rings of BIRD_AIM.ringsMm round it (BIRD_AIM.steps points per ring,
 * starting at `turn` radians so the pick does not favour one side), else null. A ring point stands on the terrain
 * or on a primitive's top within BIRD_AIM.stepUpMm of the aim (see standHeight).
 */
export function clearAim(aim: AimXZ & { y?: number }, turn: number, beakLen: number, groundAt: (x: number, z: number) => number, hard: HardDistance): AimXZ | null {
  const ceiling = freeCeiling(hard, aim.x, aim.z);
  const base = Math.max(groundAt(aim.x, aim.z), aim.y ?? -Infinity);
  if (strikeClear(aim.x, aim.z, base, beakLen, hard, ceiling)) return { x: aim.x, z: aim.z };
  for (const ring of BIRD_AIM.ringsMm) {
    for (let k = 0; k < BIRD_AIM.steps; k++) {
      const a = turn + (k * 2 * Math.PI) / BIRD_AIM.steps;
      const x = aim.x + Math.cos(a) * ring, z = aim.z + Math.sin(a) * ring;
      const y = standHeight(x, z, base + BIRD_AIM.stepUpMm, groundAt, hard);
      if (y !== null && strikeClear(x, z, y, beakLen, hard, ceiling)) return { x, z };
    }
  }
  return null;
}
