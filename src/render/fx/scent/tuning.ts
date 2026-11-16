// Presentation constants of the scent view (GDD 08 §10.1, §11.5). Render-only numbers: they never affect the sim.
import type { QualityId } from '@/render/app/quality';
import type { PheroChannel } from '@/sim/types';

/** Glyph styles drawn by the scent shader. RIVAL is a flag added to a base style (same glyphs, hatched). */
export const STYLE = { trail: 0, home: 1, alarm: 2, food: 3 } as const;
export const RIVAL_FLAG = 4;
export type BaseStyle = (typeof STYLE)[keyof typeof STYLE];

/**
 * Concentration (ph) shown at full intensity per channel: trail ~ a well-used trail, home ~ the "explored" level
 * (GDD 02 HOME_EXPLORED 2.0, doubled), alarm ~ ALARM_STRONG. Intensity = sqrt(value / full), clamped to 1, so a
 * trail just above TRAIL_DETECT (0.3) still shows at about 0.17.
 */
export const FULL_PH: Readonly<Record<PheroChannel, number>> = { trail: 10, home: 4, alarm: 3 };

/** Glyph half sizes as a fraction of the pheromone cell edge (cells are 4 BU; neighbours overlap into a ribbon). */
export const DECAL = {
  /** Along the trail axis. */
  along: 0.9,
  /** Across it. */
  across: 0.55,
  /** Round glyphs (home, alarm): neighbours overlap into one soft field. */
  round: 0.85,
  /** Lift off the surface along the normal, mm (with polygon offset; avoids z-fighting). */
  liftMm: 0.35,
} as const;

/** Chevrons flow towards the food at this speed, BU per real second (GDD 08 §10.1). */
export const CHEVRON_SPEED_BU_S = 2;
/** Chevron spacing along the trail, BU. */
export const CHEVRON_PERIOD_BU = 2.2;
/** Home stipple dot spacing, BU. */
export const STIPPLE_SPACING_BU = 0.9;
/** Alarm zigzag rings: spacing, BU, and expansion speed, BU per real second. */
export const ALARM_RING_BU = 1.6;
export const ALARM_RING_SPEED_BU_S = 1.2;
/** Food odour rings spacing, BU; the plume radius is the source's smell range (odourRadiusMm), capped. */
export const FOOD_RING_BU = 2.5;
export const FOOD_PLUME_MAX_BU = 10;
/** Diagonal hatching over rival glyphs: line spacing, BU. */
export const HATCH_BU = 0.8;

/** Opacity of a glyph at intensity 0+ and 1 (overlays inform without hiding the world). */
export const ALPHA_MIN = 0.18;
export const ALPHA_MAX = 0.82;
/** Faint wash under the glyphs (fraction of the glyph alpha) so a ribbon reads as continuous. */
export const WASH = 0.32;

/** Display easing towards the sampled value, per real second (smooth fade as trails decay). */
export const FADE_RATE_S = 3;
/** A slot whose display intensity falls below this after its cell vanished is freed. */
export const FREE_EPS = 0.01;

/** A cell centre further than this from the surface it projects to (fraction of the cell edge) is not drawn. */
export const SNAP_MAX_CELLS = 1.2;
/**
 * Slot ranking when the cache is full (higher keeps its slot), by glyph style (base style + RIVAL_FLAG): the player's
 * trail first (the most important information), then food plumes, alarm, the player's home range, then rival
 * trails and home ranges. Within a rank the stronger cell wins (score = rank + RANK_STRENGTH x intensity).
 */
export const SLOT_RANK: Readonly<Record<number, number>> = {
  [STYLE.trail]: 6, [STYLE.food]: 5, [STYLE.alarm]: 4, [STYLE.home]: 3,
  [STYLE.trail + RIVAL_FLAG]: 2, [STYLE.alarm + RIVAL_FLAG]: 2, [STYLE.food + RIVAL_FLAG]: 2, [STYLE.home + RIVAL_FLAG]: 1,
};
export const RANK_STRENGTH = 0.9;
/** A new cell takes the slot of a held one only if it scores at least this much more (no thrashing). */
export const EVICT_MARGIN = 0.15;
/** Share of the per-frame victim scan for weaker cells of the same rank (cross-rank evictions use the rest). */
export const EVICT_SAME_RANK_SHARE = 0.25;
/** Victim search: the weakest of the first this many candidates below the threshold is evicted. */
export const EVICT_SAMPLE = 16;
/** Trail cells within this distance of a colony entrance (cells) seed the along-trail distance. */
export const GEO_SEED_CELLS = 3;

export interface ScentBudget {
  /** Maximum drawn cells (instance capacity). */
  maxCells: number;
  /** Persisted pheromone chunks (16^3 cells) scanned per frame, round-robin over the layers. */
  chunksPerFrame: number;
  /** Active-cell visits per frame where no chunk data is available (whole layers, at least one per frame). */
  visitsPerFrame: number;
  /** Surface projections of new cells per frame (field.project costs about 1.5-3 us each). */
  snapsPerFrame: number;
  /** Direction evaluations of new trail cells per frame. */
  axesPerFrame: number;
  /** Re-evaluations of existing trail cells per frame (slow sweep: trails grow and bend). */
  axesSweepPerFrame: number;
  /** Along-trail distance work per frame (cells visited; sets the chevron direction on bending trails). */
  geoPerFrame: number;
  /** Slots inspected per frame when looking for a weaker cell to evict (full cache). */
  evictScanPerFrame: number;
  /** A layer is refreshed at most this often, real s. */
  minRefreshS: number;
}

/**
 * Budgets per quality preset. `test` draws only when the scent view is explicitly switched on, and then converges
 * in a single frame (render on demand: no easing, everything refreshed and snapped).
 */
export const SCENT_BUDGET: Readonly<Record<QualityId, ScentBudget>> = {
  test: { maxCells: 120_000, chunksPerFrame: Infinity, visitsPerFrame: Infinity, snapsPerFrame: Infinity, axesPerFrame: Infinity, axesSweepPerFrame: 0, geoPerFrame: Infinity, evictScanPerFrame: Infinity, minRefreshS: 0 },
  low: { maxCells: 40_000, chunksPerFrame: 12, visitsPerFrame: 40_000, snapsPerFrame: 200, axesPerFrame: 200, axesSweepPerFrame: 40, geoPerFrame: 400, evictScanPerFrame: 8000, minRefreshS: 0.5 },
  medium: { maxCells: 80_000, chunksPerFrame: 16, visitsPerFrame: 60_000, snapsPerFrame: 300, axesPerFrame: 400, axesSweepPerFrame: 80, geoPerFrame: 600, evictScanPerFrame: 12000, minRefreshS: 0.35 },
  high: { maxCells: 120_000, chunksPerFrame: 24, visitsPerFrame: 70_000, snapsPerFrame: 400, axesPerFrame: 600, axesSweepPerFrame: 120, geoPerFrame: 800, evictScanPerFrame: 16000, minRefreshS: 0.25 },
  ultra: { maxCells: 160_000, chunksPerFrame: 32, visitsPerFrame: 100_000, snapsPerFrame: 600, axesPerFrame: 800, axesSweepPerFrame: 160, geoPerFrame: 1200, evictScanPerFrame: 24000, minRefreshS: 0.2 },
};

/** Render order: after the opaque world, nest and ants; with the other world-space overlays. */
export const SCENT_RENDER_ORDER = 900;
