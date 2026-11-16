/**
 * Render-only tuning for creatures (presentation; nothing here feeds back into the simulation). Sizes of the
 * animals themselves come from the creature catalogue (src/sim/balance/creatures.ts, GDD 05 §2.2) so the drawn
 * animal is the simulated one at true scale.
 */
import type { QualityId } from '@/render/app/quality';
import { lodSettingsFor } from '@/render/ants/tuning';

export interface CreatureLodSettings {
  /** Projected body length (px) for near / mid detail; below midPx -> far detail; below minPx not drawn. */
  nearPx: number; midPx: number; minPx: number;
  /** Max creatures at near detail (only near detail casts shadows). */
  maxNear: number;
  /** Max aphids drawn per herd (GDD 05 §1.4: up to 200 instances). */
  aphidsPerHerd: number;
  shadows: boolean;
  /** The ants' LOD thresholds (px) for the same preset: LOD0 / LOD1 / LOD2 (src/render/ants/tuning.ts). */
  antPx: [number, number, number];
}

/**
 * Triangles of the reference ant (Lasius worker, LOD0..3; spike-ants.md §2, checked against the ant builder in
 * detail.test.ts). Acceptance 4: a creature may not cost more triangles than an ant of the same projected size, so
 * mid detail is used only where its triangle count fits under the ant's at that size (detail.ts).
 */
export const ANT_REFERENCE_TRIS = [5518, 804, 298, 104] as const;

const BASE = { nearPx: 110, midPx: 40, minPx: 0.8 };

/** Per-preset caps; density.crowdLod scales the px thresholds like the ants' (tuning.ts in src/render/ants). */
export const CREATURE_LOD_CAPS: Record<QualityId, { maxNear: number; aphidsPerHerd: number }> = {
  test: { maxNear: 8, aphidsPerHerd: 120 },
  low: { maxNear: 12, aphidsPerHerd: 120 },
  medium: { maxNear: 16, aphidsPerHerd: 200 },
  high: { maxNear: 24, aphidsPerHerd: 200 },
  ultra: { maxNear: 32, aphidsPerHerd: 200 },
};

export function creatureLodFor(quality: QualityId, crowdLod: number, shadows: boolean): CreatureLodSettings {
  const k = 1 / Math.max(0.25, Math.min(2, crowdLod));
  const a = lodSettingsFor(quality, crowdLod, shadows);
  return { nearPx: BASE.nearPx * k, midPx: BASE.midPx * k, minPx: BASE.minPx, shadows, antPx: [a.nearPx, a.midPx, a.farPx], ...CREATURE_LOD_CAPS[quality] };
}

/**
 * Hop / leap detection: a tick displacement above minWalkTicks x (walk speed per tick) + minBodyLengths x size is
 * drawn as an arc of height heightPerMm x distance (springtail jump, spider leap, antlion flick).
 */
export const HOP = { minWalkTicks: 3, minBodyLengths: 0.6, heightPerMm: 0.25 };

/** Planted feet (gait.ts): the largest stretch of a leg's hip-to-foot reach the stride may ask for. */
export const GAIT_LOOK = { maxStretch: 1.25 };

/** Flight: body raised this many body lengths above the surface it is drawn on (the sim flies as hops). */
export const HOVER = { bodyLengths: 1.4, bobMm: 0.25, bobHz: 1.7 };

/** Teleports (spawn, re-placement over the world) larger than this many body lengths snap instead of gliding. */
export const SNAP_BODY_LENGTHS = 12;

/** Aphid packing on a stem or leaf: spacing along and around, mm; heading jitter (rad); mummy share and tint. */
export const HERD_LOOK = { along: 1.25, around: 1.05, jitterMm: 0.25, headingJitter: 0.45, mummyShare: 0.04 };
/** Aphid colours (linear multipliers on the neutral aphid mesh): soft green and black bean aphid (GDD 08 §11.6). */
export const APHID_COLOURS = {
  green: [0.36, 0.52, 0.16], black: [0.07, 0.07, 0.06], mummy: [0.62, 0.48, 0.28],
  /** Root aphids (pale, underground herds) and scale insects (their mesh carries its own wax colour). */
  root: [0.78, 0.74, 0.6], scale: [1, 1, 1],
} as const;
/**
 * Density layer beyond the instanced herd cap (GDD 05 §1.4): spots are laid out up to maxSpots (HERD_K of a tree
 * branch, 400); each is a quad of spotLength x the member's length, aspect width / length, liftMm off the surface.
 */
export const HERD_DENSITY = { maxSpots: 400, spotLength: 1.05, spotAspect: 0.6, liftMm: 0.12 };

/** Antlion pit look: rim lip (fraction of radius) and sand colours (sRGB hex; GDD 08 §11.3 play / damp sand). */
export const PIT_LOOK = { lipFraction: 0.22, lipHeightPerR: 0.06, punchLiftMm: 0.35, sunkLiftMm: 0.15, sand: '#a88d62', sandDark: '#5e4a33', rings: 10, radial: 40 };

/**
 * Bird event visuals (GDD 05 §2.6, GDD 08 §11.7: never shown whole): a soft shadow that sweeps in during the approach,
 * then the beak and the front of the head striking from above. Strike timing in seconds.
 */
export const BIRD_LOOK = {
  shadowRadiusMm: 150, approachFromMm: 450, shadowDarkness: 0.6, restHeightMm: 70, strikeS: 0.12, recoverS: 0.35,
  cockTiltRad: 0.5, leaveRiseMm: 400,
};

/** Spider comfort (GDD 08 §12): ring around abstract and marker spiders, arc for the wind-up, label. */
export const COMFORT_LOOK = { ringRadiusBodyLengths: 0.7, ringWidthFraction: 0.18, ring: '#e7d9b8', arc: '#f0b45a', labelPx: 13 };

/**
 * Pit depth rule (shader/pitDepth.ts): the pit's fragments sit biasMm in front of the rim plane, with k of their
 * real depth behind it kept for their own ordering; the rim plane is liftMm above the pit's surface point.
 */
export const PIT_DEPTH = { biasMm: 0.6, k: 0.01, liftMm: 0 };

/** The antlion lies tilted head-up in the pit bottom, sunk so that only its head and open jaws show. */
export const ANTLION_LOOK = { tiltRad: 0.7, sinkMm: 2.0 };
