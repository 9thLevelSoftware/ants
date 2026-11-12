import type { MarkerKind } from '@/sim/types';

// Colony and queen defaults used by createColony / createNewGame (GDD 02 §3, §5; GDD 06 §5). A founding queen
// starts with the single reserve pool `SpeciesDef.opening.R0` (GDD 06 model, E-19); her `reserve` / `reserveP` stay
// 0 until hand-over splits what is left (E-21). The laying log and the honeydew history are sized from the
// configured season length, so neither has a constant here.

/** Queen fecundity draw: normal(mean, sd) clamped. */
export const FECUNDITY_MEAN = 1.0;
export const FECUNDITY_SD = 0.15;
export const FECUNDITY_MIN = 0.6;
export const FECUNDITY_MAX = 1.4;
/** Default yield per forager trip before any data, loads (GDD 02). */
export const YIELD_PER_FORAGER_DEFAULT = 1.5;
/** Default protein share of foraging (GDD 02 sP). */
export const PROTEIN_SHARE_DEFAULT = 0.3;
/** Default alate investment and gyne share (GDD 06 §11). */
export const ALATE_INVESTMENT_DEFAULT = 0.5;
export const GYNE_SHARE_DEFAULT = 0.4;
/** The stayIn directive auto-clears after this many game days (GDD 02 §12). */
export const STAY_IN_DAYS = 1;
/** Ants spawned by cheat.spawnAnts are scattered within this radius of the spawn point, BU. */
export const CHEAT_SPAWN_SCATTER_BU = 4;
/** Default species directive extras (GDD 07 §3 `directiveExtras`): casteEmphasis -1..1 (0 = species mix). */
export const CASTE_EMPHASIS_DEFAULT = 0;
/** Messor granary-care priority multiplier 0..1 (GDD 07 granary care; no default given, mid value). */
export const GRANARY_HYGIENE_DEFAULT = 0.5;
/** Atta minimum leaf quality accepted, 0..1 (GDD 07 fungus module: "leafSelectivity, default 0.3"). */
export const LEAF_SELECTIVITY_DEFAULT = 0.3;
/** Most markers of each kind per colony (GDD 02 §12.2 MARKER_CAP; dig = PLAN_CAP_PLAYER). */
export const MARKER_CAP: Record<MarkerKind, number> = {
  dig: 8, forage: 4, avoid: 8, rally: 1, entrance: 2, 'move-brood': 1, 'move-queen': 1, satellite: 1,
};
/**
 * Default marker radius when `placeMarker` gives none, BU (GDD 02: forage / avoid 30 in 10-80, rally 15 in 8-32;
 * point markers - dig, entrance, moves, satellite - use a small pick radius, an F1c choice).
 */
export const MARKER_DEFAULT_RADIUS_BU: Record<MarkerKind, number> = {
  dig: 4, forage: 30, avoid: 30, rally: 15, entrance: 4, 'move-brood': 4, 'move-queen': 4, satellite: 4,
};
