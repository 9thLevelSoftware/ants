// Nest balance (GDD 03). Lengths in BU unless the name says MM, durations in game seconds (`_S`) or ticks
// (`_TICKS`), volumes in BU^3. Species nest templates are in nestTemplates.ts (re-exported below).

import type { ChamberSize, ChamberType, FoundingDigState, MaterialId, PlanPriority, SpeciesId } from '@/sim/types';

/** Slot-seeking weight per plan priority (GDD 03 §7). */
export const PLAN_PRIORITY_WEIGHT: Record<PlanPriority, number> = { low: 1, normal: 2, high: 4, urgent: 8 };

// ---- substrates (GDD 03 §2.1 material table) ----

/** Base dig speed per diggable material, relative to loam at medium moisture (bite 1.0 s). Missing = 0. */
export const DIG_SPEED: Partial<Record<MaterialId, number>> = {
  loam: 1.0, humus: 1.3, sand: 1.6, clay: 0.45, gravel: 0.35, 'wood-decayed': 1.0, 'wood-sound': 0.4, insulation: 1.5,
};

/**
 * Species multiplier per material ("diggable by" column of GDD 03 §2.1). A material missing for a species is
 * not diggable by it. Camponotus and wood are T3 (species-carpenter refines wood moisture rules).
 */
export const DIG_SPECIES_MULT: Record<SpeciesId, Partial<Record<MaterialId, number>>> = {
  'lasius-niger': { loam: 1, humus: 1, sand: 1, clay: 1, gravel: 1, 'wood-decayed': 0.5, insulation: 0.5 },
  'messor-barbarus': { loam: 1, humus: 0.8, sand: 1, clay: 1, gravel: 1 },
  'atta-texana': { loam: 1, humus: 1, sand: 1, clay: 1, gravel: 1 },
  'camponotus-pennsylvanicus': {
    loam: 0.6, humus: 0.8, sand: 0.6, clay: 0.3, 'wood-decayed': 1, 'wood-sound': 1, insulation: 1,
  },
};

/** Dig-speed factor of a material for a species (DIG_SPEED x species multiplier); 0 = not diggable. */
export function digFactor(species: SpeciesId, m: MaterialId): number {
  const mult = DIG_SPECIES_MULT[species]?.[m];
  return mult === undefined ? 0 : (DIG_SPEED[m] ?? 0) * mult;
}

/** Moisture multiplier of the dig speed (GDD 03 §2.1): [dry at m <= 0.05, wet at m >= 0.95]; 1 in 0.2..0.8. */
export const DIG_MOISTURE_MULT: Partial<Record<MaterialId, [number, number]>> = {
  loam: [0.6, 0.8], humus: [0.8, 0.8], sand: [1.0, 0.9], clay: [0.55, 0.9], gravel: [1.0, 1.0],
};

/** Moisture breakpoints of the dry / mid / wet interpolation (GDD 03 §2.1), 0..1. */
export const MOISTURE_DRY = 0.05;
export const MOISTURE_MID_LO = 0.2;
export const MOISTURE_MID_HI = 0.8;
export const MOISTURE_WET = 0.95;
/** Soil moisture used where the environment has no grid, 0..1. */
export const MOISTURE_DEFAULT = 0.4;
/** Depth scale of the surface-to-deep moisture blend, mm (GDD 03 §9.2). */
export const MOISTURE_DEPTH_MM = 80;

/** Largest unsupported ceiling span S_max, BU: [mid, dry, saturated] (GDD 03 §2.1). Missing = never collapses. */
export const S_MAX: Partial<Record<MaterialId, [number, number, number]>> = {
  loam: [16, 12, 10], humus: [10, 8, 6], sand: [8, 2.5, 4], clay: [24, 24, 14], gravel: [12, 10, 10],
  insulation: [12, 12, 12],
};

/** Minimum soil between two cavities, BU (GDD 03 §2.1, §8.5). */
export const WALL_MIN: Partial<Record<MaterialId, number>> = {
  loam: 2.0, humus: 2.5, sand: 3.0, clay: 1.5, gravel: 2.0, 'wood-decayed': 1.0, 'wood-sound': 1.0, insulation: 1.5,
};
/** WALL_MIN for a material without an entry, BU. */
export const WALL_MIN_DEFAULT = 2.0;

/** Angle of repose of piles, degrees (GDD 03 §2.1). */
export const REPOSE_DEG: Partial<Record<MaterialId, number>> = {
  loam: 38, humus: 40, sand: 33, clay: 40, gravel: 36, 'wood-decayed': 40, 'wood-sound': 40, insulation: 45,
};
export const REPOSE_DEFAULT_DEG = 38;

/** Wood below this moisture digs at half speed (wood-decayed) or 0.25 (wood-sound), GDD 03 §2.1. */
export const WOOD_DRY_MOISTURE = 0.15;
export const WOOD_DECAYED_DRY_MULT = 0.5;
export const WOOD_SOUND_DRY_SPEED = 0.25;

/** LOOSE voxels: base dig speed (at least LOOSE_MIN_BASE) x LOOSE_DIG_SPEED (GDD 03 §2.1). */
export const LOOSE_DIG_SPEED = 2.0;
export const LOOSE_MIN_BASE = 1.0;
/** Hard surface crusts (GDD 03 §2.2): dig speed x CRUST_DIG_DRY, or x CRUST_DIG_WET at moisture >= CRUST_WET_M. */
export const CRUST_DIG_DRY = 0.3;
export const CRUST_DIG_WET = 0.7;
export const CRUST_WET_M = 0.5;

// ---- the bite (GDD 03 §1.2) with the ramp brush (docs/research/spike-nest.md §5 item 5) ----

/** Nominal volume of one bite at a fresh face, BU^3 (x headScale^3). */
export const V_BITE_NOMINAL = 0.85;
/** Below this, a bite yields no pellet and fails `no-target`, BU^3. */
export const BITE_MIN_REMOVED = 0.1;
/** Ramp brush radius, BU (x headScale): a 2 BU tunnel. */
export const DIG_RAMP_RADIUS_BU = 1.0;
/** Longest ramp capsule per bite (axis length from the start cap), BU. */
export const DIG_RAMP_MAX_LEN_BU = 2.5;
/** Bisection steps fitting the ramp length to the nominal bite volume. */
export const DIG_RAMP_FIT_STEPS = 14;
/**
 * Plan diggers: samples must satisfy plan g > -PLAN_CLIP_BU. GDD 03 §1.2 says 0.25 BU; with samples 0.5 BU apart that
 * opens a half-voxel shell around every planned room (+30 % for a 2.5 BU high chamber, against the GDD's own size
 * checks 11, 17), so the clip is 0: only target samples (g > 0) open. Recorded deviation.
 */
export const PLAN_CLIP_BU = 0;
/** Walkers within brush reach + this are re-projected after a carve or fill, BU. */
export const SURFACE_REFRESH_PAD_BU = 2;
/** Steepest ramp slope a plan digger is aimed at, degrees from the horizontal (up or down). */
export const PLAN_AIM_MAX_DEG = 85;
/** Dominant material: the face probe looks this far ahead of the ramp start, BU. */
export const DIG_FACE_PROBE_BU = 3;

// ---- pellets (GDD 03 §1.3) ----

/** Bulking factor of soil dumped on a mound. */
export const BULKING = 1.25;
/** A surface pellet merges into a mound once this old, game s. */
export const PELLET_SETTLE_S = 300;
/** A clutter or spoil-pile pellet untouched this long is tamped into the floor, game s. */
export const PELLET_TAMP_S = 1200;
/**
 * An item whose centre lies deeper than this inside solid soil is buried (a fill or plug closed over it): no ant
 * can reach it, and a buried pellet is part of the soil at its tamping time, BU (int-1B-sim: pellets left in a
 * founding throat were sealed in by the plug, and haulers walked at them for days).
 */
export const ITEM_BURIED_BU = 0.3;
/** How far up a pellet buried under tamping fill (LOOSE, not a plug) is searched for the risen floor, BU (tamp.ts). */
export const BURIED_LIFT_BU = 2;
/** Tamping spreads the volume over floor voxels within this radius, BU (then the fallback radius). */
export const TAMP_RADIUS_BU = 1.0;
export const TAMP_RADIUS_FALLBACK_BU = 1.5;
/** Radius of the fill sphere placed under each floor sample when tamping (one round raises the floor <= ~0.75 BU), BU. */
export const TAMP_SPHERE_BU = 0.25;
/** Tamping rounds (each finds the risen floor and tops up the volume still to close). */
export const TAMP_ROUNDS = 4;
/** Loose pellets per nest above which the oldest clutter pellet tamps at once. */
export const MAX_LOOSE_PELLETS_PER_NEST = 400;
/** A pellet dropped within this distance of a plan's spoil point joins its spoil pile, BU. */
export const SPOIL_JOIN_BU = 1;
/** Spoil pile size above which diggers carry out themselves (GDD 03 §7.7). */
export const SPOIL_PILE_MAX = 6;
/** Weight of a clutter pellet in the haul stimulus (spoil-pile pellets weigh 1; GDD 03 §7.7). */
export const HAUL_CLUTTER_WEIGHT = 0.5;
/** Most plug voxels used as D_seal seeds per nest (strided beyond). */
export const MAX_PLUG_SEEDS = 64;
/** Clutter slow-down (GDD 03 §1.3): multiplier max(MIN, 1 - PER x n), n pellets within RADIUS. */
export const CLUTTER_SLOW_MIN = 0.6;
export const CLUTTER_SLOW_PER = 0.08;
export const CLUTTER_RADIUS_BU = 1.5;
/** Choked tunnel: at least CHOKE_COUNT pellets within CHOKE_LEN_BU. */
export const CHOKE_COUNT = 6;
export const CHOKE_LEN_BU = 1;
/** Pellet item bulk per BU^3 (GDD 03 §1.3: bulk = 0.6 x volume). */
export const PELLET_BULK_PER_BU3 = 0.6;

// ---- spoil inside the nest: haul urgency, passages kept open, internal dump (sim-fix-colony) ----

/**
 * Haul urgency of a lying pellet in the nest: 1 when dropped, rising linearly to 1 + HAUL_URGENCY_GAIN at tamping
 * age (PELLET_TAMP_S). Multiplies its weight in the haul demand and divides its haul cost (pelletHaulUrgency).
 */
export const HAUL_URGENCY_GAIN = 2;
/**
 * Passage rule of tamping: the narrowest passage the species' workers can walk, in body lengths of its largest
 * worker caste (GDD 03 §5.1: under 1.5 BU is a crack). A tamp's fill must not split the open space around it as
 * passages this wide (tamp.ts tampPassageSamples, passage.ts); it spreads to the wider radii of TAMP_RADII_BU
 * instead, and a pellet that finds no room stays lying (its haul urgency stays at its maximum) until the next try
 * TAMP_RETRY_S later. (The name is kept from an earlier per-column headroom rule; see tamp.ts.)
 */
export const TAMP_MIN_HEADROOM_BU = 1.5;
/** Radii tried in turn for a tamp (GDD 03 §1.3: TAMP_RADIUS, then the fallback; then wider before giving up), BU. */
export const TAMP_RADII_BU = [TAMP_RADIUS_BU, TAMP_RADIUS_FALLBACK_BU, 2.5, 4];
/** A pellet that could not be tamped (no headroom left) is tried again this often after its tamping age, game s. */
export const TAMP_RETRY_S = 300;
/**
 * A pellet's first tamp comes up to this many ticks before PELLET_TAMP_S, phase-shifted by its id, so pellets
 * dropped together do not all tamp on one tick (nest-fix3 item 6: a rival nest's 150 founding pellets cost 5.2 s in
 * one nest tick; one tamp is 10-50 ms). One game hour [WX].
 */
export const TAMP_FIRST_SPREAD_TICKS = 250;
/** Over MAX_LOOSE_PELLETS_PER_NEST, at most this many of the oldest clutter pellets are tried per drop (pellets.ts). */
export const TAMP_CAP_TRIES = 4;
/**
 * The passage check of a tamp (passage.ts) looks at the open space within this distance of the fill, BU: a fill
 * that would split it (plainly, or as passages at least 1.5 BU across) is refused.
 */
export const TAMP_PASSAGE_MARGIN_BU = 3;
/** When a round's whole floor fails the passage check, at most this many floor samples are tried one by one. */
export const TAMP_PASSAGE_GREEDY_MAX = 24;
/** Internal dump (GDD 03 §7.7): dead-end tunnel tips at least this far (path) from every chamber, BU. */
export const INTERNAL_DUMP_MIN_CHAMBER_BU = 6;
/** A tip's branch must run at least this long on one side of it (rejects loop ridges and dimples), BU. */
export const INTERNAL_DUMP_BRANCH_BU = 2;
/** Tips within this distance of an entrance opening are not used (the throat stays clear), BU. */
export const INTERNAL_DUMP_ENTRANCE_BU = 6;
/** Tips inside a live plan's volume grown by this are not used (digging fronts stay clear), BU. */
export const INTERNAL_DUMP_PLAN_CLEAR_BU = 2;
/** Most samples the tip search visits (a bound on its cost). */
export const INTERNAL_DUMP_SEARCH_MAX = 400_000;

// ---- mounds and heaps (GDD 03 §1.4) ----

export const MOUND_CELL_BU = 0.5;
export const MOUND_GRID_N = 128;
/** A mound cell without support within this distance below its base is unusable, BU. */
export const MOUND_SUPPORT_BU = 4;
/** Relaxation stops when no transfer exceeds this, BU; at most MOUND_MAX_SWEEPS sweeps per batch. */
export const MOUND_TRANSFER_EPS_BU = 0.001;
export const MOUND_MAX_SWEEPS = 64;
/** Relaxation sweeps the deposit box expanded by this many cells. */
export const MOUND_SWEEP_PAD = 16;
/**
 * Kept-clear hole around the entrance: r_ent + this, BU. The mound mask adds one cell diagonal so the bilinear
 * height overlay is exactly 0 inside r_ent + this (moundRelax.ts).
 */
export const MOUND_CLEAR_PAD_BU = 0.25;
/**
 * Pile cells within this distance of an entrance's kept-clear disc are also kept clear where the nest cavity
 * reaches the ground surface below them (a ramp shaft's open trench, a widened throat), BU.
 */
export const MOUND_HOLE_PROBE_BU = 8;
/** The crater's inner-wall cap (moundRelax.ts) is evaluated this far from the pit's edge, BU. */
export const MOUND_CAP_REACH_BU = 16;
/** Hole columns are also probed within a breach record's radius + this, BU (pits without an entrance record). */
export const MOUND_BREACH_PROBE_BU = 2;
/** That test probes the field this far below the cell's base (the kernel's hole probe depth), BU. */
export const MOUND_HOLE_PROBE_DEPTH_BU = 0.1;
/** A new entrance takes over an entrance-less pile of its nest centred within its radius + this, BU. */
export const MOUND_LINK_BU = 2;
/**
 * Founding expulsion (GDD 03 §13.2) goes to the mound of the nest's entrance nearest the bite when that entrance
 * is within its radius + this horizontally or connected to the bite's cavity; otherwise to a pile around the pit
 * being dug (no entrance record yet). Equal to the §13.4 distance at which a queen's bite is a new site, BU.
 */
export const EXPEL_ENTRANCE_REACH_BU = 6;
/** The pile is solid where h > this, BU (field and volume). */
export const MOUND_MIN_H_BU = 0.05;
/** Mound batches run every this many ticks per mound (staggered by id). */
export const MOUND_BATCH_TICKS = 250;
/**
 * Relaxation work per tick over all mounds (box cells visited + 8 x cells evaluated, moundRelax.ts relaxSweeps): a
 * batch's relaxation continues over the following ticks within this budget; a sweep may stop between rows, so a
 * tick does at most this plus one row of the sweep box (<= 9 x MOUND_GRID_N units), about 0.5 ms of the nest
 * system's share on the reference machine.
 */
export const MOUND_RELAX_WORK_PER_TICK = 30_000;
/**
 * Each relaxing pile also gets at least the work rate that would finish MOUND_MAX_SWEEPS full sweeps of its box
 * within this share of MOUND_BATCH_TICKS (moundBatch.ts), so many big piles at once still settle and are published
 * before their next batch (a mature 6000-pellet heap: about 35,000 units per tick).
 */
export const MOUND_RELAX_FINISH_SHARE = 0.8;
/** A carve this close below a mound grid's lowest base (or higher) can change its kept-clear mask, BU. */
export const MOUND_MASK_CARVE_REACH_BU = 2;
/** Spoil heaps (no entrance): merge distance and cap per nest. */
export const HEAP_MERGE_DIST_BU = 30;
export const HEAP_CAP = 16;
/** Dump ring around an entrance, BU beyond r_ent: normal [lo, hi], rim building [lo, hi] (GDD 03 §7.7). */
export const DUMP_RING_BU: [number, number] = [1.5, 5];
export const DUMP_RING_RIM_BU: [number, number] = [0.5, 1.5];
/** Rim height is measured on the ring r_ent .. r_ent + RIM_RING_BU. */
export const RIM_RING_BU = 3;
export const RIM_FULL_BU = 3;
export const RIM_MIN_FACTOR = 0.1;

// ---- entrances (GDD 03 §4) ----

/** Breach columns within this of an entrance opening belong to it, BU. */
export const ENTRANCE_MERGE_DIST_BU = 1.5;
/** Entrance radius from the hole area: clamp(sqrt(n x cell area / pi), MIN, MAX), BU. */
export const ENTRANCE_RADIUS_MIN_BU = 0.75;
export const ENTRANCE_RADIUS_MAX_BU = 3;
/** A hole patch registers as an entrance only from this many open sample columns (pinholes do not). */
export const ENTRANCE_MIN_HOLE_COLUMNS = 3;
/** The hole patch around a breach is searched within this radius, BU (a ramp shaft's trench is a few BU long). */
export const ENTRANCE_SCAN_BU = 8;
/** Throat: open voxels within this path distance of the opening, BU. */
export const THROAT_BU = 3;
/** Extra seed radius of the exit / seal nav fields around an entrance opening, BU (opening samples sit just below the surface). */
export const ENTRANCE_SEED_PAD_BU = 1;
/** Plug sphere (`seal-entrance`): radius and offset ahead of the head toward the opening, BU. */
export const PLUG_RADIUS_BU = 1.2;
export const PLUG_AHEAD_BU = 1.0;
/** Plug voxels keep this clearance from any ant, BU. */
export const PLUG_ANT_CLEAR_BU = 0.3;
/** One unseal bite opens plug voxels within this radius, BU. */
export const UNSEAL_RADIUS_BU = 0.6;
/** Entrance status is re-evaluated every this many ticks. */
export const ENTRANCE_CHECK_TICKS = 10;
/** Entrance cap of Lasius from this many adult workers (GDD 03 §4.3: 3, 4 from 800). */
export const LN_EXTRA_ENTRANCE_WORKERS = 800;

// ---- chambers (GDD 03 §6) ----

/** Detection runs every this many ticks per nest (5 game s), staggered. */
export const CHAMBER_DETECT_TICKS = 50;
/** Core voxels: in-layer support >= CORE_HALF and vertical open run >= CORE_RUN, BU. */
export const CHAMBER_CORE_HALF_BU = 2.0;
export const CHAMBER_CORE_RUN_BU = 1.5;
/**
 * Region = core opened by the CORE_HALF disk (the core's in-layer support), then dilated by CHAMBER_DILATE
 * inside open voxels (GDD 03 §6.2; the opening step is a recorded decision: without it the region misses the
 * outer CORE_HALF - DILATE of every chamber and check 17's volume cannot hold).
 */
export const CHAMBER_DILATE_BU = 1.0;
export const CHAMBER_MIN_VOLUME = 12;
/** A region keeps a chamber's id when it holds at least this share of the chamber's voxels. */
export const CHAMBER_KEEP_OVERLAP = 0.5;
/** Chambers below this share of their type minimum are removed (shrunk). */
export const CHAMBER_SHRINK_FRACTION = 0.5;
/** findChamberAt: a point within the chamber ellipsoid grown by this, BU. */
export const CHAMBER_POINT_PAD_BU = 0.5;
/** Roof / depth scans stop after this, BU. */
export const DEPTH_SCAN_MAX_BU = 400;
/** Microclimate refresh per chamber, ticks (GDD 03 §9.2 MICRO_UPDATE_S 25 s). */
export const MICRO_UPDATE_TICKS = 250;
/** Occupancy and capacity refresh, ticks. */
export const OCCUPANCY_TICKS = 50;

/** Minimum volume per chamber type, BU^3 (GDD 03 §6.4). */
export const CHAMBER_MIN_VOL: Record<ChamberType, number> = {
  founding: 8, royal: 10, nursery: 12, food: 8, granary: 30, fungus: 40, midden: 12, rest: 12, general: 12,
};

/** Capacity per BU^3 (GDD 03 §6.4): resting adults (space units), brood items, food loads, other. */
export const CHAMBER_CAPACITY: Record<ChamberType, { adults: number; brood: number; food: number; other: number }> = {
  founding: { adults: 0.5, brood: 3.0, food: 0, other: 0 },
  royal: { adults: 0.3, brood: 2.0, food: 0, other: 0 },
  nursery: { adults: 0.3, brood: 1.5, food: 0, other: 0 },
  food: { adults: 0.2, brood: 0, food: 2.0, other: 0 },
  granary: { adults: 0.2, brood: 0, food: 2.0, other: 0 },
  fungus: { adults: 0.3, brood: 0.5, food: 0, other: 0 },
  midden: { adults: 0, brood: 0, food: 0, other: 3 },
  rest: { adults: 1.0, brood: 0, food: 0, other: 0 },
  general: { adults: 0.6, brood: 0.5, food: 1.0, other: 0 },
};
/** Tunnel space (open volume outside chambers): resting adults per BU^3. */
export const TUNNEL_ADULT_CAPACITY = 0.15;
/** Brood space units per stage (GDD 03 §6.4). */
export const BROOD_SPACE = { egg: 0.25, larva: 1.0, pupa: 1.0 } as const;

// ---- dig plans (GDD 03 §7) ----

export const NECK_LEN_BU = 3;
export const CHAMBER_SILL_BU = 0.5;
/** Entrance plans reach a surface point at most this far from the nest cavity, BU. */
export const ENTRANCE_PLAN_MAX_BU = 12;
/** Entrance plans flare to tunnelD + this over their last ENTRANCE_FLARE_LEN_BU. */
export const ENTRANCE_FLARE_BU = 0.5;
export const ENTRANCE_FLARE_LEN_BU = 2;
/** Shaft plans: within this angle of vertical, degrees. */
export const SHAFT_MAX_TILT_DEG = 15;
/** Length ranges, BU. */
export const TUNNEL_LEN_BU: [number, number] = [2, 40];
/** Length of a tunnel or shaft plan given without a length or end point, BU. */
export const PLAN_DEFAULT_LEN_BU = 10;
/** Substrate materials whose excavated spoil is frass (wood and insulation), not soil pellets. */
export const FRASS_MATERIALS: readonly string[] = ['wood-sound', 'wood-decayed', 'insulation'];
export const SHAFT_LEN_BU: [number, number] = [4, 60];
/** Expansion (GDD 03 §7.4): axis sphere spacing and radius pad; chamber lattice step, shrink and radius, BU. */
export const SPHERE_STEP_TUNNEL_BU = 0.75;
export const SPHERE_PAD_BU = 0.1;
export const LATTICE_STEP_BU = 1.0;
export const LATTICE_SHRINK_BU = 0.5;
export const LATTICE_SPHERE_R_BU = 0.8;
/** A sphere is done at this share of its target voxels open; a plan completes at PLAN_SNAP of its volume. */
export const SPHERE_DONE = 0.9;
export const PLAN_SNAP = 0.97;
/** Snapping opens remaining target voxels whose openness is at least this byte. */
export const PLAN_SNAP_MIN_OPEN = 64;
/** Active window size and slot cap per kind (GDD 03 §7.1). */
export const PLAN_WINDOW: Record<string, number> = {
  tunnel: 1, shaft: 1, chamber: 4, entrance: 1, seal: 1, reopen: 1, widen: 3, backfill: 1,
};
export const PLAN_SLOT_CAP: Record<string, number> = {
  tunnel: 2, shaft: 2, chamber: 8, entrance: 2, seal: 1, reopen: 2, widen: 4, backfill: 4,
};
export const SLOTS_PER_SPHERE = 2;
/** Slots keep this distance apart, BU. */
export const SLOT_SPACING_BU = 0.75;
/** A digger within this distance of its slot is "in reach", BU. */
export const SLOT_REACH_BU = 1.5;
export const SLOT_TIMEOUT_S = 60;
export const SLOT_HOLD_S = 90;
/** D_plan distance scale in slot scoring, BU; ants outside the nest pay this factor on straight distance. */
export const SLOT_SCORE_DIST_BU = 40;
export const SLOT_OUTSIDE_PENALTY = 2;
/** Spoil point: this far from the frontier along D_exit, BU; recomputed when the window moves farther. */
export const SPOIL_POINT_BU = 2;
export const SPOIL_RECOMPUTE_BU = 3;
/** Plans are updated every this many ticks (staggered by id). */
export const PLAN_UPDATE_TICKS = 10;
/** plan-progress events at most once per this many ticks per plan. */
export const PLAN_PROGRESS_EVENT_TICKS = 10;
/** Block conditions must hold this long before a plan stalls, game s. */
export const STALL_DEBOUNCE_S = 10;
/** Spoil pile full this long: `no-haulers` (diagnostic only), game s. */
export const NO_HAULERS_S = 30;
/** Architect proposals become queued after this in auto mode, game s. */
export const ARCH_PROPOSAL_S = 30;
/** A site whose architect plan the player cancelled is not proposed again for this long, game s. */
export const ARCH_BLACKLIST_S = 1200;
/** Terminal plans are dropped after this, game s (1 game day). */
export const PLAN_DROP_S = 600;
export const PLAN_CAP_PLAYER = 8;
/** Validation (GDD 03 §7.3). */
export const PLAN_NON_DIGGABLE_MAX = 0.1;
export const ROOF_MIN_BU = 3;
export const FLOOR_MIN_BU = 2.5;
export const ENTRANCE_KEEPOUT_BU = 4;
export const ENTRANCE_KEEPOUT_DEPTH_BU = 8;
export const BOUNDS_MARGIN_BU = 2;
/** Anchor: an open nest voxel within this distance, BU. */
export const ANCHOR_SNAP_BU = 1.5;
/** Spacing checks ignore cavities within this of the anchor (the anchor connection), BU. */
export const ANCHOR_CONNECTION_BU = 4;
/** Pillars (unstable spans): diameter and spacing pad, BU; at most PILLAR_MAX. */
export const PILLAR_D_BU = 1.5;
export const PILLAR_MAX = 4;
/** Validation looks this far up for a non-diggable cover above the roof, BU. */
export const COVER_SCAN_BU = 15;

/**
 * Brood placement preference curves (GDD 03 §9.3, Lasius [EST]): piecewise-linear [x, value] points for chamber
 * temperature (°C) and relative humidity (0..1); values beyond the end points hold.
 */
export const BROOD_PREF: Record<'egg' | 'larva' | 'pupa', { temp: [number, number][]; rh: [number, number][] }> = {
  egg: { temp: [[16, 0], [24, 1], [29, 1], [34, 0]], rh: [[0.5, 0], [0.85, 1]] },
  larva: { temp: [[16, 0], [24, 1], [29, 1], [34, 0]], rh: [[0.5, 0], [0.85, 1]] },
  pupa: { temp: [[18, 0], [26, 1], [31, 1], [36, 0]], rh: [[0.4, 0], [0.6, 1], [0.9, 1], [1.0, 0.8]] },
};
/** Chamber types that accept brood (GDD 03 §9.4). */
export const BROOD_CHAMBER_TYPES: readonly ChamberType[] = ['nursery', 'royal', 'founding', 'general'];

/** A chamber split keeps its id in the largest part when that part holds at least this share of it. */
export const CHAMBER_SPLIT_KEEP = 0.2;
/** chamber-changed is emitted when the volume changes by at least this fraction. */
export const CHAMBER_CHANGE_FRACTION = 0.05;

// ---- lifecycle ----

/** Royal chamber designation of the founding cell from this many adult workers (GDD 03 §6.5; template). */
export const ROYAL_CHECK_TICKS = 50;

export * from './nestTemplates';

// ---- founding readiness (GDD 03 §13.1; species values in SpeciesDef.opening) ----

/** Soil roof the founding cell needs unless its column is covered, BU ("roof ok"). */
export const FOUNDING_ROOF_MIN_BU = 2;
/** V_deep counts open volume at depth >= D_MIN - this, BU. */
export const FOUNDING_DEEP_MARGIN_BU = 2;
/** At most this many openings of the founding cavity ("openings <= 2"). */
export const FOUNDING_MAX_OPENINGS = 2;
/** Founding states in which the founding cell rule may register the cell (GDD 03 §13.2). `site-search` stays: the
 *  founding module sets `digging` on the first bite only once the opening has left the intro card, and the nest
 *  tests (and a queen digging during the intro card) dig in `site-search` (int-1B-sim: kept, see the gate report). */
export const FOUNDING_CELL_STATES: readonly FoundingDigState[] = ['site-search', 'digging', 'ready'];

/** Founding template per species (GDD 03 §13.1): shaft diameter and depth, cell W x H x L, BU. */
export const FOUNDING_TEMPLATE: Record<SpeciesId, { shaftD: number; shaftDepth: number; cell: { w: number; h: number; l: number } }> = {
  'lasius-niger': { shaftD: 2.5, shaftDepth: 10, cell: { w: 4, h: 2, l: 4.5 } },
  'messor-barbarus': { shaftD: 2.5, shaftDepth: 25, cell: { w: 6, h: 2.5, l: 7 } },
  'atta-texana': { shaftD: 2.5, shaftDepth: 35, cell: { w: 9, h: 3, l: 9 } },
  'camponotus-pennsylvanicus': { shaftD: 2.5, shaftDepth: 6, cell: { w: 4, h: 2.5, l: 5 } },
};

/** Chambers of the pre-carved template nest (carveTemplateNest): type, size, anchor depth on the shaft, BU. */
export const TEMPLATE_NEST_CHAMBERS: { type: ChamberType; size: ChamberSize; depthBu: number }[] = [
  { type: 'nursery', size: 's', depthBu: 16 },
  { type: 'food', size: 's', depthBu: 24 },
];
