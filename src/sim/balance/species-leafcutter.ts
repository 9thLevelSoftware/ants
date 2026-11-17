// Implementation tunables of the fungus-garden module (Atta texana, GDD 07 §5.4 and §6.4; task species-leafcutter).
// Species values (garden rates, climate curves, Escovopsis, cut times, pellet) live in the species data block
// `modules['fungus-garden']` (src/sim/species/data/atta-texana.ts); this file holds only how the module applies
// them. [EST] = design estimate. Units on every name.

// ---- cadence ----

/** Ticks between garden integrations (GDD 07 §6.4.2 "integrated every 25 ticks"). */
export const GARDEN_STEP_TICKS = 25;
/** Ticks between leaf-site refreshes (regrowth, rejection expiry). */
export const LEAF_SITE_STEP_TICKS = 250;
/** Ticks between diagnostics publications. */
export const FUNGUS_DIAG_TICKS = 250;
/** Ticks between labour-demand augmentations is the colony allocator's own cadence (ALLOC_EVERY). */

// ---- substrate ledger (rolling windows of GDD 07 §6.4.1) ----

/** Width of one substrate ledger bin, game days (the 1 GD and 1.5 GD windows are sums of bins). */
export const SUB_BIN_GD = 0.25;
/** Bins kept: 2 GD (the learned-rejection ledger window of §6.4.1 `subSources`). */
export const SUB_BINS = 8;
/** Plants remembered per bin (the largest suppliers; the rest are merged into plant -1). */
export const SUB_PLANTS_PER_BIN = 6;

// ---- leaf sites (GDD 05 `leaf` is owned by this module; GDD 07 §6.4.5) ----

/** Plant objects farther than this from the nest are not leaf sites, BU (inside the 150 BU footprint x 3) [EST]. */
export const LEAF_SITE_RANGE_BU = 450;
/** Herbage patches (grass and clover in lawns and beds: the bulk of a young colony's leaves) laid around the nest. */
export const HERB_PATCHES = 16;
/** Ring of herbage patches around the nest, BU [EST]. */
export const HERB_PATCH_RING_BU: readonly [number, number] = [15, 120];
/** Leaf stock of one plant site and one herbage patch, LU [EST]. */
export const PLANT_SITE_LU: readonly [number, number] = [20, 60];
export const HERB_PATCH_LU: readonly [number, number] = [8, 20];
/** Regrowth per game day, share of the site's capacity (GDD 05 regrowth; defoliated plants recover) [EST]. */
export const LEAF_REGROW_PER_GD = 0.25;
/** Leaf quality, protein and toxin by plant kind [EST] (leafQ 0..1, leafP protein fraction, leafT defence 0..1). */
export const LEAF_TRAITS: Readonly<Record<string, readonly [number, number, number]>> = {
  herbage: [0.55, 0.12, 0.05],
  dandelion: [0.7, 0.14, 0.1],
  daisy: [0.6, 0.12, 0.15],
  'clover-patch': [0.75, 0.22, 0.05],
  'perennial-plant': [0.65, 0.15, 0.2],
  shrub: [0.5, 0.12, 0.45], // a defended shrub: the poisoned-leaf story (GDD 07 §5.4.9 item 6)
  'herb-plant': [0.6, 0.14, 0.25],
  default: [0.5, 0.15, 0.2],
};
/** Spread of each plant's traits around its kind's values (hashed per object) [EST]. */
export const LEAF_TRAIT_JITTER = 0.1;

// ---- cutting and carrying (GDD 07 §6.4.6 stages 1-2) ----

/** A cutter arrives this close to the leaf site, BU. */
export const CUT_ARRIVE_BU = 2.5;
/** Cut time the AI chooses, game s at 25 °C: a full fragment (GDD 07: media 1 LU at 15 s) [EST]. */
export const CUT_AI_S = 15;
/** Cutters (media, majors) cut within this range of the nest, BU (inside the leaf-site range) [EST]. */
export const CUT_RANGE_BU = 300;
/** First-brood deviation: while the colony has no worker of a cutting caste, minims cut small fragments within this
 * range of the nest (else a colony of minims would plant no substrate at all), BU. */
export const MINIM_CUT_RANGE_BU = 160;
/** First-brood deviation: minims process leaf (while the colony has no media) at this multiple of the time. */
export const MINIM_PROCESS_MULT = 2;
/** Leaf fragment item length, BU per LU^(1/2) (render only) [EST]. */
export const FRAGMENT_LENGTH_BU = 0.9;
/** A cutter gives up a trip after this long outside, game s (the shared forage engine's TRIP_TURN_S spirit). */
export const CUT_TRIP_MAX_S = 420;
/** A cutter whose trip failed waits this long before the next one, game s. */
export const CUT_RETRY_S = 30;
/** Out of a blocked nav cell: wander this many nav cells toward the site, for at most CUT_CLEAR_S, CUT_CLEAR_TRIES times. */
export const CUT_CLEAR_CELLS = 1.2;
export const CUT_CLEAR_S = 20;
export const CUT_CLEAR_TRIES = 2;
/** Cutters leave only while surface activity (thermal gate x light x weather) is at least this. */
export const CUT_ACTIVITY_MIN = 0.15;
/** Rain: carriers drop fragments (GDD 07 §6.4.6 stage 2) when rain intensity exceeds this [EST]. */
export const RAIN_DROP_INTENSITY = 0.3;

// ---- in-nest work (GDD 07 §6.4.6 stages 3-8) ----

/** A gardener is "in the chamber" for tending within this many chamber radii of its centre. */
export const GARDEN_ARRIVE_FRAC = 0.6;
/** Pulp waits at most this long before it dries (GDD 07: lost after 0.5 GD) - read from the species block. */
/** LU a processor handles per process-leaf action (40 s per LU at work rate 1). */
export const PROCESS_BATCH_LU = 0.5;
/** Pulp a planter plants per tend-fungus "plant pulp" action, LU (5 s per pulp load). */
export const PLANT_BATCH_LU = 0.5;
/** Weeding removes infected patches: game s per weeding cycle (a tend-fungus cycle, GDD 07 §6.4.4). */
export const WEED_CYCLE_S = 6;
/** Waste trip: garden waste per carried item, loads (GDD 07: 1 load per trip, scaled by carry capacity). */
export const WASTE_ITEM_LOADS = 1;
/** Waste piles up in the garden while below this many loads before anyone is asked to haul (spare a trip) [EST]. */
export const WASTE_HAUL_MIN_LOADS = 0.25;
/** A garden-waste dump inside the nest is at least this far from every fungus chamber, BU (GDD 07 §5.4.6: 25). */
export const WASTE_DUMP_MIN_BU = 25;

// ---- staphylae and the pool ----

/** Staphylae harvested ahead of need: the colony keeps this many game days of its C and P need in the pool. */
export const STAPH_POOL_BUFFER_GD = 1.5;
/** Of one FL: protein share (the larva's 1.2 P + 0.4 C, GDD 07 §2.3). */
export const FL_P_SHARE = 0.75;
/** Unharvested yield is lost (GDD 07 §6.4.2); harvestable yield waiting on the garden is capped at this many game
 * days of yield (the staphylae standing on the hyphae). */
export const YIELD_STANDING_GD = 0.25;

// ---- labour demand (added to the colony's demand after each allocation pass) ----

/** Gardeners asked for per GU of garden (GDD 07 §6.4.2 GARDENERS_PER_GU 1.0), capped by this share of workers. */
export const GARDEN_MAX_FRAC = 0.55;
/** At least this many gardeners while any garden lives. */
export const GARDEN_MIN = 1;
/** Cut trips one cutter makes per game day (a trip of 80-200 s inside the night or cool-day window) [EST]. */
export const CUT_TRIPS_PER_ANT_GD = 3;
/** Cutters capped at this share of the workers. */
export const CUT_MAX_FRAC = 0.45;
/** At least this many cutters while a garden lives and the surface is workable. */
export const CUT_MIN = 1;

// ---- processing chain and bottleneck detection (GDD 07 §6.4.6, §5.4.10) ----

/** Throughput window, game days (GDD 07: 0.5 GD). */
export const CHAIN_WINDOW_GD = 0.5;
/** A stage running this far below the stage upstream for the window is a bottleneck (30 %). */
export const CHAIN_SHORT_FRAC = 0.3;

// ---- hitchhikers and phorids (GDD 07 §6.4.7) ----

/** Phorid pressure by default (no phorid-fly creature on the map yet) [EST]. */
export const PHORID_PRESSURE = 0.5;
/** Ticks between phorid exposure rolls for one laden carrier. */
export const PHORID_ROLL_TICKS = 50;

// ---- founding (GDD 06 §5.15, GDD 07 §5.4.3, §6.4.8) ----

/** Established when the founding garden reached this multiple of the planted pellet (GDD 06: "biomass >= 0.5 of the
 * planting size" read as half again the planted size; see the report: the literal reading is met at planting). */
export const FOUND_ESTABLISHED_MULT = 1.5;
/** A passive queen plants the pellet herself this long after reaching the cell, game days. */
export const FOUND_AUTO_PLANT_GD = 0.5;

// ---- garden-less colony (GDD 07 §6.4.9) ----

/**
 * After the founding the queen lays only while the fungus in view covers the brood already there and one more egg
 * (GDD 07 §5.4.2: laying is paid from the fungus ration): pool P + harvested staphylae + garden yield over
 * LAY_COVER_GD, less the queen's own upkeep over the same span. Without it the queen keeps laying from the founding
 * stores while a small garden feeds a tenth of the larvae, and the starved brood's corpses poison the cell. [EST]
 */
export const LAY_COVER_GD = 2.5;
/** The queen's upkeep in fungus (GDD 07 §5.4.1: 0.5 FL per GD). */
export const QUEEN_FL_PER_GD = 0.5;
