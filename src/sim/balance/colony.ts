// Colony and queen defaults used by createColony / createNewGame (GDD 02 §3, §5; GDD 06 §5).

/** Founding queen reserves at the start (GDD 02 QUEEN_RESERVE_P_START / C_START), loads. */
export const QUEEN_RESERVE_P_START = 17;
export const QUEEN_RESERVE_C_START = 7;
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
/** Length of the queen's laying log (days of the default year). */
export const LAYING_LOG_DAYS = 28;
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
/** Honeydew yield history length, game days (`yield7`, GDD 07 honeydew module). */
export const HONEYDEW_HISTORY_DAYS = 7;
