// Capacities of progression records (GDD 02 §13, GDD 06 §9, GDD 08 App. A) and rival grid sizes (GDD 05).

/** Hourly statistics samples kept per series (D1.11: a fixed 168-sample ring; the daily history is unbounded). */
export const HOURLY_HISTORY_CAP = 168;
export const EVENT_LOG_CAP = 200;
export const DEATH_RING_CAP = 200;
export const JOURNAL_CAP = 4000;
export const MILESTONE_THUMBS_MAX = 40;
/** Territory grid cell, BU, and colony slots per cell (slot 0 = player). */
export const TERR_CELL_BU = 16;
export const TERR_COLONY_SLOTS = 8;
/** Danger grid cell, BU. */
export const DANGER_CELL_BU = 16;
/** Carrion accumulator dimensions: variants x zones (GDD 05 §1.6). */
export const CARRION_VARIANTS = 4;
