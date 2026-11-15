// Founding-site quality: the read-out's seven factors scored by THE site-quality function of the static
// suitability map (directions §K, last bullet: one scoring function and one table of word thresholds for the map
// and the live read-out). The factor rules, the weights, the combination and the words are imported from
// src/worldgen/maps/suitability.ts (pure functions of numbers); this file only maps the read-out's factor order
// (SITE_FACTORS, GDD 06 §5.7) onto the map's factors and words the bars.
//
// Precedence note: GDD 06 §5.7 scores with a weighted geometric mean and its own words (0.30 / 0.55 / 0.75);
// directions §K overrides it with the single function, which is the map's weighted sum calibrated on generated
// worlds (excellent / good / fair at SUIT.excellent / good / fair). The read-out's `exposure` bar is the map's
// fQuiet (human disturbance), `rivalScent` its fRival (distance to rival nest sites).

import type { SiteWord, SpeciesId } from '@/sim/types';
import { SITE_FACTORS } from '@/sim/types';
import { SITE_MOISTURE_WORD_THETA, SITE_WARMTH_WORD_C } from '@/sim/balance/founding';
import { siteClass, siteQualityOf, type SiteFactorValues } from '@/worldgen/maps/suitability';
import { SUITABILITY, type SuitabilityProfile } from '@/worldgen/tuning/maps';

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : Number.isFinite(v) ? v : 0);

/** The species' site profile of the static map (weights, moisture window). */
export function siteProfile(species: SpeciesId): SuitabilityProfile {
  return SUITABILITY[species] ?? SUITABILITY['lasius-niger'];
}

/** The read-out's factors (SITE_FACTORS order) as the map's factor values (fSpecial: T3 species modules, 0 here). */
export function mapFactorsOf(factors: readonly number[]): SiteFactorValues {
  const f = (i: number) => clamp01(factors[i] ?? 0);
  return { fDig: f(0), fMoist: f(1), fWarm: f(2), fCover: f(3), fFlood: f(4), fRival: f(5), fQuiet: f(6), fSpecial: 0 };
}

/** Site quality Q of the read-out's factors: the map's function (vetoed, i.e. 0, when not diggable). */
export function siteQuality(factors: readonly number[], species: SpeciesId): number {
  const f = mapFactorsOf(factors);
  return siteQualityOf(siteProfile(species).weights, f, !(f.fDig > 0));
}

/** The word of a Q value: the static map's threshold table. */
export function siteWordOf(q: number): SiteWord {
  return siteClass(Number.isFinite(q) ? q : 0);
}

/** Optimal chamber temperature band of the species (the warmth bar's words), C. */
const TOPT_C: Record<SpeciesId, readonly [number, number]> = {
  'lasius-niger': [20, 26], 'camponotus-pennsylvanicus': [22, 28], 'messor-barbarus': [22, 28], 'atta-texana': [21, 25],
};

export function toptOf(species: SpeciesId): readonly [number, number] {
  return TOPT_C[species] ?? TOPT_C['lasius-niger'];
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
  if (factor === 'moisture' && raw !== undefined && Number.isFinite(raw)) {
    const t = SITE_MOISTURE_WORD_THETA;
    return words[raw < t[0] ? 0 : raw < t[1] ? 1 : raw < t[2] ? 2 : raw < t[3] ? 3 : 4];
  }
  if (factor === 'warmth' && raw !== undefined && Number.isFinite(raw) && toptC) {
    const w = SITE_WARMTH_WORD_C;
    return words[raw < toptC[0] - w.cold ? 0 : raw < toptC[0] ? 1 : raw <= toptC[1] ? 2 : raw <= toptC[1] + w.hot ? 3 : 4];
  }
  if (factor === 'diggability' && !(score > 0)) return words[0];
  const n = words.length;
  const i = factor === 'diggability' ? 1 + Math.min(n - 2, Math.floor(clamp01(score) * (n - 1))) : Math.min(n - 1, Math.floor(clamp01(score) * n));
  return words[i];
}
