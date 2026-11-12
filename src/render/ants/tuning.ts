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
export const HIGHLIGHT = { warm: '#ffd9a0', warmGain: 0.16, cool: '#bcd8ff', coolGain: 0.24, possessed: 1, hovered: 1, inspected: 0.7 };

/** Time constants (s) of render-side smoothing. Pose blend 80-150 ms per GDD 08 §11.9. */
export const SMOOTH = { pose: 0.11, up: 0.06, turn: 0.15 };

/** Gait bookkeeping: effective foot lever for turning on the spot (fraction of body length). */
export const GAIT = { turnLever: 0.45, cruiseBodyLengthsPerS: 6, teleportBodyLengths: 6 };

/** Callow adults darken over CALLOW_DARKEN_GAME_H = 6 game hours (GDD 08 §11.6): 6 x 25 s x 10 ticks. */
export const CALLOW_DARKEN_TICKS = 1500;

/** Individual colour variation of the cuticle (+/- fraction). */
export const TINT_VARIATION = 0.12;
