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

// ---- progression engine (task progression; GDD 06 §7-10, §5.13, GDD 08 §6, GDD 02 §13-14) ----

/** Milestone / codex / aim state checks run every this many ticks (1 game s). */
export const PROGRESSION_POLL_EVERY = 10;
export const PROGRESSION_POLL_OFFSET = 7;
/** Hourly statistics of the progression series (GDD 06 §9.2; one game hour), staggered from colony stats (105). */
export const PROGRESSION_STATS_OFFSET = 131; // 130 collided with environment-effects (every 50, offset 30); int-1B-sim

/** Stage thresholds of GDD 06 §7 that species data does not hold: Camponotus `matureAgeYears` per preset. */
export const STAGE_MATURE_AGE_BY_PRESET: Partial<Record<string, Partial<Record<string, number>>>> = {
  'camponotus-pennsylvanicus': { gentle: 3, harsh: 6 },
};
/** A mature colony falls back to `growing` below this fraction of matureThreshold (hysteresis, GDD 06 §7). */
export const STAGE_MATURE_HYSTERESIS = 0.7;
/** `declining`: N fell by at least this fraction over the last STAGE_DECLINE_DAYS daily evaluations, outside winter. */
export const STAGE_DECLINE_FRAC = 0.2;
export const STAGE_DECLINE_DAYS = 3;

/** Worker-count milestones (GDD 06 §8): `ms-workers-<n>` fires when N first reaches n. */
export const WORKER_MILESTONES = [25, 100, 500, 1000] as const;
/** `ms-first-possession`: a possession must last this long, game s. */
export const MS_POSSESSION_S = 30;
/** `ms-first-aphid-herd`: a herd tended for this long, GD. */
export const MS_HERD_TEND_GD = 0.5;
/** `ms-first-trail`: distinct followers of one worker-laid trail. */
export const MS_TRAIL_FOLLOWERS = 3;
/** `ms-first-footfall`: an ant of the colony within this distance of the footprint, BU. */
export const MS_FOOTFALL_NEAR_BU = 60;
/** `ms-trunk-trail` (Messor): trail in use at least this long and this long, GD / BU. */
export const MS_TRUNK_TRAIL_GD = 3;
export const MS_TRUNK_TRAIL_BU = 150;
/** Winters survived for `ms-winter-3` / `ms-winter-10`. */
export const MS_WINTERS = [3, 10] as const;
/** `ms-year-1` / `ms-year-5`: colony age in years of DAYS_PER_YEAR days. */
export const MS_YEARS = [1, 5] as const;

/** `cx-queen-reserves`: founding reserves below this share of R0. */
export const CX_QUEEN_RESERVE_FRAC = 0.5;
/** `cx-brood-warmth`: brood in a chamber colder than this, °C (development slowed well below the optimum). */
export const CX_BROOD_COLD_C = 15;
/** `cx-mound-structure`: nest open volume above this, BU^3. */
export const CX_MOUND_VOLUME_BU3 = 5000;
/** `cx-stone-nests`: the founding site's cover factor at sealing at least this. */
export const CX_STONE_COVER = 0.6;

/** Aims shown at once in "Current focus" (GDD 06 §5.13). */
export const AIMS_SHOWN_MAX = 3;
/** Aim worker thresholds (GDD 06 §5.13). */
export const AIM_MIDDEN_WORKERS = 12;
export const AIM_SATELLITE_WORKERS = 40;
export const AIM_SECOND_ENTRANCE_WORKERS = 25;

/** Loss journal entry: this many adult deaths within LOSS_WINDOW_GD (GDD 06 §9.1). */
export const LOSS_DEATHS = 5;
export const LOSS_WINDOW_GD = 0.25;
/** `last-ants` alert: living ants at or below this (GDD 06 §13.4). */
export const LAST_ANTS_N = 3;

/**
 * Alert cooldown after a key clears, game hours, per level (GDD 08 §6.3 ALERT_COOLDOWN_GAME_H): a raise inside it
 * goes to the event log only.
 */
export const ALERT_COOLDOWN_GAME_H: Record<string, number> = { info: 3, notice: 3, warning: 1, critical: 0 };
/** Active alerts kept at most (oldest acknowledged / lowest dropped first). */
export const ALERTS_ACTIVE_MAX = 64;

/** Cause chains: depth limit (GDD 08 §4.4). */
export const CAUSE_CHAIN_DEPTH = 3;
/** A diagnostic value that is not finite (e.g. a ratio over a zero capacity) is clamped to this magnitude. */
export const DIAG_VALUE_MAX = 1e6;
