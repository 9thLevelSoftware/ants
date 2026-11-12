// Founding-site quality (GDD 06 §5.7): the seven factor rules and the weighted geometric mean with its words.
// Pure functions of numbers, so the live read-out, the forecast and the static suitability map can share them
// (directions §K: the overlay and the read-out must agree; see the founding report for the worldgen side).

import type { Material, SiteWord, SpeciesId } from '@/sim/types';
import { SITE_FACTORS } from '@/sim/types';
import {
  SITE_COVER, SITE_EXPOSURE, SITE_FACTOR_FLOOR, SITE_PROFILES, SITE_RIVAL_FULL_PH, SITE_SAND, SITE_WARMTH_FALLOFF_C,
  SITE_WORD_Q, type SiteProfile,
} from '@/sim/balance/founding';

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : Number.isFinite(v) ? v : 0);

export function siteProfile(species: SpeciesId): SiteProfile {
  return SITE_PROFILES[species] ?? SITE_PROFILES['lasius-niger'];
}

/**
 * Diggability of the substrate at the sample depth: the species' site table (SpeciesDef.opening.siteMaterials;
 * missing = not diggable), sand scaled down when dry (`0.8 x clamp(0.4 + theta / 0.5, 0.4, 1)`).
 */
export function diggabilityFactor(siteMaterials: Partial<Record<Material, number>>, material: Material, theta: number): number {
  const base = siteMaterials[material] ?? 0;
  if (material !== 'sand') return clamp01(base);
  const wet = Math.min(1, Math.max(SITE_SAND.min, SITE_SAND.base + theta / SITE_SAND.per));
  return clamp01((base > 0 ? base : SITE_SAND.mult) * wet);
}

/** Trapezoid: 0 at lo0, 1 from lo1 to hi1, 0 at hi0. */
export function moistureFactor(p: SiteProfile['moist'], theta: number): number {
  if (!(theta > p.lo0) || theta >= p.hi0) return 0;
  if (theta < p.lo1) return (theta - p.lo0) / (p.lo1 - p.lo0);
  if (theta <= p.hi1) return 1;
  return 1 - (theta - p.hi1) / (p.hi0 - p.hi1);
}

/** 1 inside the optimal band, linear to 0 at SITE_WARMTH_FALLOFF_C beyond it. */
export function warmthFactor(toptC: readonly [number, number], tempC: number): number {
  if (tempC < toptC[0]) return clamp01(1 - (toptC[0] - tempC) / SITE_WARMTH_FALLOFF_C);
  if (tempC > toptC[1]) return clamp01(1 - (tempC - toptC[1]) / SITE_WARMTH_FALLOFF_C);
  return 1;
}

export type CoverKind = keyof typeof SITE_COVER;

export function coverFactor(kind: CoverKind): number {
  return SITE_COVER[kind];
}

export function floodSafetyFactor(floodRisk: number): number {
  return clamp01(1 - floodRisk);
}

export function rivalScentFactor(rivalHomeScent: number): number {
  return clamp01(1 - clamp01(rivalHomeScent / SITE_RIVAL_FULL_PH));
}

export function exposureFactor(footTraffic: number, openSky: number): number {
  return clamp01(1 - clamp01(SITE_EXPOSURE.foot * footTraffic + SITE_EXPOSURE.sky * openSky));
}

/** Weighted geometric mean Q = exp(sum w_i ln(max(s_i, floor))) over the factors in SITE_FACTORS order. */
export function siteQuality(factors: readonly number[], species: SpeciesId): number {
  const w = siteProfile(species).weights;
  let sum = 0, wsum = 0;
  for (let i = 0; i < SITE_FACTORS.length; i++) {
    const s = Math.max(SITE_FACTOR_FLOOR, clamp01(factors[i] ?? 0));
    sum += w[i] * Math.log(s);
    wsum += w[i];
  }
  return wsum > 0 ? Math.exp(sum / wsum) : 0;
}

export function siteWordOf(q: number): SiteWord {
  if (q >= SITE_WORD_Q.excellent) return 'excellent';
  if (q >= SITE_WORD_Q.good) return 'good';
  if (q >= SITE_WORD_Q.fair) return 'fair';
  return 'poor';
}

/** One-word labels per factor value (GDD 06 §5.7 "Words" column), for the read-out. */
const FACTOR_WORDS: Record<(typeof SITE_FACTORS)[number], readonly string[]> = {
  diggability: ['Unbreakable', 'Hard', 'Firm', 'Loose'],
  moisture: ['Dry', 'Slightly damp', 'Damp', 'Wet', 'Waterlogged'],
  warmth: ['Cold', 'Cool', 'Mild', 'Warm', 'Hot'],
  cover: ['Open', 'Leaf-covered', 'Roofed'],
  floodSafety: ['Low-lying', 'Sloped', 'Raised'],
  rivalScent: ['Strong', 'Faint', 'None'],
  exposure: ['Busy', 'Open', 'Sheltered'],
};

/** Word for a factor: by its score, except moisture and warmth, which name the raw reading (dry ... wet, cold ... hot). */
export function factorWord(factor: (typeof SITE_FACTORS)[number], score: number, raw?: number, toptC?: readonly [number, number]): string {
  const words = FACTOR_WORDS[factor];
  if (factor === 'moisture' && raw !== undefined) {
    const i = raw < 0.15 ? 0 : raw < 0.3 ? 1 : raw < 0.65 ? 2 : raw < 0.9 ? 3 : 4;
    return words[i];
  }
  if (factor === 'warmth' && raw !== undefined && toptC) {
    const i = raw < toptC[0] - 6 ? 0 : raw < toptC[0] ? 1 : raw <= toptC[1] ? 2 : raw <= toptC[1] + 4 ? 3 : 4;
    return words[i];
  }
  if (factor === 'diggability' && score <= 0) return words[0];
  const n = words.length;
  const i = factor === 'diggability' ? 1 + Math.min(n - 2, Math.floor(clamp01(score) * (n - 1))) : Math.min(n - 1, Math.floor(clamp01(score) * n));
  return words[i];
}
