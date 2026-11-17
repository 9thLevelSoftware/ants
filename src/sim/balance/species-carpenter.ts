// Camponotus wood-nesting balance (GDD 07 §5.2, §6.2) that is not in the species data's `wood-nesting` block:
// per-placement starting moisture, the moisture-equilibrium terms, cadences and module thresholds. Units in names
// (`_PCT` moisture content % of dry mass, `_GD` game days, `_TICKS`, `_BU`). Species values (bite factors, brood
// rule, satellites) stay in src/sim/species/data/camponotus-pennsylvanicus.ts and are read from there.

import type { WoodPlacement } from '@/sim/types';

/** GDD 07 §6.2.2 `MC_PLACE`: moisture content each placement relaxes to before weather, %. */
export const MC_PLACE_PCT: Readonly<Record<WoodPlacement, number>> = {
  'buried-log': 32, 'log-on-soil': 28, stump: 28, 'standing-dead': 20, 'living-tree-wound': 25, firewood: 16,
  'fence-post': 24, 'structural-dry': 10, 'structural-leak': 30, 'window-sill': 20, 'door-frame-ext': 14,
};
/** log-on-soil: upper segments are this much drier than the bottom one, % (§6.2.2 "upper -6"). */
export const MC_LOG_UPPER_DROP_PCT = 6;
/** fence-post: the top segment's placement value, % (§6.2.2 "24 base / 14 top"). */
export const MC_FENCE_TOP_PCT = 14;
/** Moisture content clamp, % (§6.2.1 "6-60"). */
export const MC_MIN_PCT = 6;
export const MC_MAX_PCT = 60;

/** mcEq rain terms (§6.2.2): exposed outdoor wood +8, sheltered +3, while raining or within RAIN_MEMORY_GD after. */
export const MC_RAIN_EXPOSED_PCT = 8;
export const MC_RAIN_SHELTERED_PCT = 3;
export const MC_RAIN_MEMORY_GD = 0.5;
/** Precipitation (weather.precip 0..1) that counts as raining for the wood (light showers included). */
export const MC_RAIN_MIN_PRECIP = 0.05;
/** mcEq sun term: − sunExposure × this on summer days, % (§6.2.2). */
export const MC_SUN_DRYING_PCT = 4;
/** mcEq window term: − this × max(0, windows − MC_WINDOWS_FREE), capped at MC_WINDOWS_MAX_PCT, % (§6.2.2). */
export const MC_PER_WINDOW_PCT = 2;
export const MC_WINDOWS_FREE = 2;
export const MC_WINDOWS_MAX_PCT = 10;
/** mcEq winter term for outdoor wood, % (§6.2.2 "+3 winter, outdoor"). */
export const MC_WINTER_OUTDOOR_PCT = 3;
/** Sun exposure of open outdoor wood with no shelter above, 0..1; sheltered and interior wood 0 [EST]. */
export const SUN_EXPOSURE_OPEN = 1;
export const SUN_EXPOSURE_SHELTERED = 0.3;

/** Wood dynamics cadence: moisture and decay are integrated every this many ticks (25 game s). */
export const WOOD_UPDATE_TICKS = 250;
/** Brood moisture hazard and the late-brood dry bonus are applied every this many ticks (10 game s). */
export const WOOD_BROOD_TICKS = 100;
/** Caste destiny pass over the colony's brood, ticks. */
export const WOOD_CASTE_TICKS = 50;
/** Diagnostics and frass visibility, ticks (one game hour). */
export const WOOD_DIAG_TICKS = 250;

/** Up to this many segments along a primitive's main axis (§6.2.1). */
export const WOOD_SEGMENTS_MAX = 4;
/** A segment is at least this long along the grain, BU (shorter primitives get fewer segments) [EST]. */
export const WOOD_SEGMENT_MIN_BU = 20;
/**
 * Thinnest wood a gallery may be carved in, BU: a 2 BU gallery plus `MIN_WALL_BU` on both sides (§6.2.3) [EST
 * rounding up to whole BU]. Thinner wood (twigs, branches) is never nest substrate.
 */
export const WOOD_NEST_MIN_THICK_BU = 3;

/** Founding site (§5.2.3): at least this thick, BU, and sound wood only when damp (mc >= this, %). */
export const FOUND_WOOD_MIN_THICK_BU = 10;
export const FOUND_SOUND_MIN_MC_PCT = 18;
/** Moisture words of the antennation read-out (§5.2.3 "dry / damp / wet"): dry below, wet at or above, %. */
export const MC_WORD_DAMP_PCT = 15;
export const MC_WORD_WET_PCT = 30;
/** The automatic founding looks for wood this far from the queen, BU, and walks her there. */
export const FOUND_WOOD_SEARCH_BU = 3000;
/** The automatic founding cell sits this deep into the wood from its top surface, BU (GDD 03 §13.1 D_MIN 3 + 1). */
export const FOUND_CELL_DEPTH_BU = 4.5;
/** The automatic founding cell keeps this much solid wood between it and any open space it did not carve, BU. */
export const FOUND_CELL_CLEAR_BU = 2;

/** Diagnostics thresholds of the parent moisture (§6.2.10): warn 11-15 or 30-35, bad < 11 or > 35, %. */
export const DIAG_MC_BAD_LOW_PCT = 11;
export const DIAG_MC_BAD_HIGH_PCT = 35;
/** `diag-cp-frass`: warn at or above this many interior pile units (§5.2.10). */
export const DIAG_FRASS_WARN_UNITS = 5;
/** `diag-cp-satellites`: late brood waiting longer than this for transport is a warning, GD (§5.2.10). */
export const DIAG_SHUTTLE_WAIT_GD = 0.5;

/** Caste destiny (GDD 07 §2.6): a larva is destined `major` only if the P store covers this many GD of larval demand. */
export const MAJOR_GATE_GD = 2;
/** Shares the directive `casteEmphasis` (−1..1) moves the major target by: ±50 % of itself (§2.6). */
export const CASTE_EMPHASIS_SPAN = 0.5;
/**
 * Share of the caste-mix ramp present the moment the large castes unlock (GDD 07 App. E 14 wants media and majors
 * among new larvae at age 2.0 exactly, while §5.2.2 ramps the target in over a year from that age) [EST].
 */
export const CASTE_RAMP_START = 0.1;

/** Satellite starter cell (GDD 07 §5.2.6 satellite nursery 10 BU long): tunnel 2 BU x 4 BU, cell 6 x 2.5 x 10 BU. */
export const SATELLITE_CELL = { tunnelD: 2, tunnelLen: 4, w: 6, h: 2.5, l: 10 } as const;
/** Satellite wood must be at least this thick, BU (a 6 BU cell with walls) [EST]. */
export const SATELLITE_MIN_THICK_BU = 9;
/** Shuttle jobs are handed to free parent nurses every this many ticks (the 0.25 GD evaluation is per item). */
export const WOOD_SHUTTLE_TICKS = 50;
/** A shuttle nurse arrives within this distance of the target chamber's centre, BU. */
export const SHUTTLE_ARRIVE_BU = 2;
/** A shuttle trip is given up after this long, game days (a cut trail, an unreachable satellite). */
export const SHUTTLE_TIMEOUT_GD = 0.5;
