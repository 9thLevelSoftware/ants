// Calendar -> decor season state (pure). Uses the default-year day (GDD 06 §1.7: windows are written for the
// 28-day default year; yearFrac x 28 is d28 whatever the custom season length).
import { LEAF, LEAF_PALETTE, PETAL } from './tuning';

export interface DecorSeason {
  /** Default-year fractional day d28 (0-based) and 1-based doy. */
  d28: number;
  doy: number;
  /** 0 spring .. 3 winter. */
  season: number;
  /** Forest leaf density, per m² (GDD 04 §9, eased over half a day at season edges). */
  leafDensity: number;
  /** Share of fresh-coloured leaves 0..1. */
  freshShare: number;
  /** Petal fall 0..1 (spring doy 2-6). */
  petals: number;
  dryTint: [number, number, number];
  freshTint: [number, number, number];
  saturation: number;
}

const EASE_DAYS = 0.5;

/** Weight 0..1 of a doy window [a, b] (inclusive integer days) at fractional day d28, eased at the edges. */
export function windowWeight(d28: number, a: number, b: number): number {
  const lo = a - 1, hi = b; // doy a..b covers d28 in [a-1, b)
  const up = Math.min(1, Math.max(0, (d28 - (lo - EASE_DAYS)) / (2 * EASE_DAYS)));
  const down = Math.min(1, Math.max(0, ((hi + EASE_DAYS) - d28) / (2 * EASE_DAYS)));
  return Math.min(up, down);
}

const lerp3 = (a: readonly number[], b: readonly number[], t: number): [number, number, number] =>
  [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function decorSeason(yearFrac: number): DecorSeason {
  const yf = ((yearFrac % 1) + 1) % 1;
  const d28 = yf * 28, doy = Math.floor(d28) + 1;
  const season = Math.min(3, Math.floor(d28 / 7));
  // blend toward the next season over the last half day of a season (and from the previous over the first)
  const inSeason = d28 - season * 7;
  let next = season, t = 0;
  if (inSeason > 7 - EASE_DAYS) { next = (season + 1) % 4; t = (inSeason - (7 - EASE_DAYS)) / (2 * EASE_DAYS); }
  else if (inSeason < EASE_DAYS) { next = (season + 3) % 4; t = (EASE_DAYS - inSeason) / (2 * EASE_DAYS); }
  const mix = (arr: readonly number[]) => arr[season] + (arr[next] - arr[season]) * t;
  const autumn = windowWeight(d28, LEAF.autumnDoy[0], LEAF.autumnDoy[1]);
  const base = mix(LEAF.forestDensity);
  return {
    d28, doy, season,
    leafDensity: Math.max(base, LEAF.forestDensity[2] * autumn),
    freshShare: mix(LEAF_PALETTE.freshShare),
    petals: windowWeight(d28, PETAL.doy[0], PETAL.doy[1]),
    dryTint: lerp3(LEAF_PALETTE.dryTint[season], LEAF_PALETTE.dryTint[next], t),
    freshTint: lerp3(LEAF_PALETTE.freshTint[season], LEAF_PALETTE.freshTint[next], t),
    saturation: mix(LEAF_PALETTE.saturation),
  };
}

/** Largest leaf density of any season: instances are generated at this density and thinned by rank. */
export const LEAF_MAX_DENSITY = Math.max(...LEAF.forestDensity);
