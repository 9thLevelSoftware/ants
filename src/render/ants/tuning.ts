/**
 * Render-only tuning for ants, brood and items (presentation; nothing here feeds back into the simulation).
 * Values come from the ants spike (spike-ants.md sections 6-7) and GDD 08 §11.6 / §11.9.
 */
import type { QualityId } from '@/render/app/quality';

export interface AntLodSettings {
  /** Projected body length (px) needed for LOD0 / LOD1 / LOD2; below farPx -> LOD3 (minimal body). */
  nearPx: number; midPx: number; farPx: number;
  /** Max ants at LOD0 (the possessed ant always is LOD0 and counts toward it). */
  maxNear: number;
  /** Hard cap on drawn ants; farthest dropped first, never the possessed ant. */
  maxDrawn: number;
  /** LOD0 casts shadows (and near carried items). */
  shadows: boolean;
  /** LOD0 uses the physical material (clearcoat + sheen). */
  physicalLod0: boolean;
  /** Drop loose brood/items smaller than this many px. */
  itemMinPx: number;
  maxItems: number;
}

const BASE = { nearPx: 48, midPx: 22, farPx: 9 };

/**
 * Per-preset caps. GDD 08 §11.9 states LOD by distance (limb motion reduced beyond ~60 BU, impostors beyond ~250 BU,
 * Low halves the distances); projected size is the same rule independent of species size and camera lens. The
 * preset's density.crowdLod scales the px thresholds (crowdLod 0.5 = distances halved = thresholds doubled).
 */
export const LOD_CAPS: Record<QualityId, Omit<AntLodSettings, 'nearPx' | 'midPx' | 'farPx' | 'shadows'>> = {
  test: { maxNear: 24, maxDrawn: 2500, physicalLod0: false, itemMinPx: 2, maxItems: 3000 },
  low: { maxNear: 40, maxDrawn: 1500, physicalLod0: false, itemMinPx: 2, maxItems: 2000 },
  medium: { maxNear: 100, maxDrawn: 2500, physicalLod0: true, itemMinPx: 1.5, maxItems: 4000 },
  high: { maxNear: 160, maxDrawn: 3000, physicalLod0: true, itemMinPx: 1, maxItems: 6000 },
  ultra: { maxNear: 220, maxDrawn: 4000, physicalLod0: true, itemMinPx: 1, maxItems: 8000 },
};

export function lodSettingsFor(quality: QualityId, crowdLod: number, shadows: boolean): AntLodSettings {
  const k = 1 / Math.max(0.25, Math.min(2, crowdLod));
  return { nearPx: BASE.nearPx * k, midPx: BASE.midPx * k, farPx: BASE.farPx * k, shadows, ...LOD_CAPS[quality] };
}

/** Subtle selection highlight: a faint rim (no outlines, GDD 08 §11.8). Linear-colour gains. */
export const HIGHLIGHT = { warm: '#ffd9a0', warmGain: 0.35, cool: '#bcd8ff', coolGain: 0.4, possessed: 1, hovered: 1, inspected: 0.7 };

/**
 * Hyaline wing membrane (GDD 08 §11.6): clear chitin scatters little light, so its diffuse albedo is the species
 * membrane tint x membraneScatter; the glassy look comes from the specular and thin-film terms. At full albedo the
 * sunlit membrane, folded four times over the dark gaster, read as a milky veil (finding int-1A review 3).
 */
export const WING_LOOK = { membraneScatter: 0.12 };

/** GDD 01 6.5 rule 2: other ants inside the camera-to-possessed-ant capsule (radius in body lengths) are dithered. */
export const CAMERA_CAPSULE = { radiusL: 0.6, opacity: 0.4 };

/** Time constants (s) of render-side smoothing. Pose blend 80-150 ms per GDD 08 §11.9. */
export const SMOOTH = { pose: 0.11, up: 0.06, turn: 0.15 };

/** Gait bookkeeping: effective foot lever for turning on the spot (fraction of body length). */
export const GAIT = { turnLever: 0.45, cruiseBodyLengthsPerS: 6, teleportBodyLengths: 6 };

/**
 * Cuticle material (GDD 08 §11.6): glossy chitin, base roughness 0.35, clearcoat 0.6 with clearcoat roughness 0.2;
 * fine erect hairs as a soft rim (sheen) term on legs and scapes. Species presets start from these; Camponotus
 * (dull black) and Atta (matte) are rougher, as §11.6 describes them.
 */
export const CUTICLE = { roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2, hairRimSheen: 1.8 };

/** Callow adults darken over CALLOW_DARKEN_GAME_H = 6 game hours (GDD 08 §11.6): 6 x 25 s x 10 ticks. */
export const CALLOW_DARKEN_TICKS = 1500;

/** Individual colour variation of the cuticle (+/- fraction). */
export const TINT_VARIATION = 0.12;

/**
 * Form light on ants where the scene lights leave them black (look-pass 2): underground (the nest's sense light
 * reaches the walls, but a cuticle albedo of ~0.012 turns every ant into a silhouette) and at night. A soft key
 * from the viewer's upper left, a sky/ceiling term and a grazing rim, added as emission and scaled by 2^-EV so it
 * keeps the same brightness whatever the exposure (the highlight rim does the same). All values are what the
 * ant's surface sends to the eye in linear light BEFORE tone mapping, at the exposure the scene is metered for.
 *  - `body`: peak of the key + sky terms on the lifted cuticle (underground / at night);
 *  - `rim`: grazing-angle edge light added to every ant fragment;
 *  - `fromEV`..`toEV`: exposure range over which a dim surface scene (night) blends the fill in; underground is
 *    always full strength (the blend follows the underground factor instead).
 * Warm underground (the nest's lantern colour), cool under the moon.
 * gate-close-app: night body 2.2 -> 1.1 and rim 0.12 -> 0.3 (at 2.2 a black ant read as pale grey glass; the
 * stronger rim keeps her separable from the ground).
 * look-pass-3: night body 1.1 -> 0.7 and rim 0.3 -> 0.22, with the rim on legs and antennae cut to ANT_FILL_RIM_THIN: at 1.1 the
 * night ant was grey metal with white outlines (and wire-thin legs at quality test); at 0.7 it is a dark body with readable segments.
 */
export const ANT_FILL = {
  body: { underground: 0.9, night: 0.7 },
  rim: { underground: 0.025, night: 0.22 },
  fromEV: 1.6,
  toEV: 3.0,
  warm: [1.0, 0.62, 0.34] as [number, number, number],
  cool: [0.66, 0.78, 1.0] as [number, number, number],
  /** Time constant (s) of the underground blend. */
  easeS: 0.35,
};

/** Share of the form-light rim kept on legs and antennae (thin parts are all silhouette: at full rim they drew as pale wire). */
export const ANT_FILL_RIM_THIN = 0.3;

/**
 * The males' swarm at the lek during the possessed nuptial flight (swarm.ts): how many are drawn, their body length
 * (BU), the radius range of their loops around the lek centre (BU), loop and bob rates (rad/s), bob height and the
 * vertical spread of the swarm (BU).
 */
export const SWARM = {
  count: 24,
  lengthBu: 1.0,
  radiusBu: [2, 9] as [number, number],
  loopRadS: 0.8,
  bobRadS: 2.0,
  bobBu: 1.0,
  spreadYBu: 8,
};
