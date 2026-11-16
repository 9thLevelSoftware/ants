// Constants of the living layer (GDD 04 §8, §12.5; GDD 05 §0, §1.2-§1.3, §2.2, §3.1; registry C10, C13).
// Densities are per plot (100 x 100 BU, GDD 05 §0) unless stated; distances in BU; probabilities 0..1.

import type { CreatureKind, FoodVariant, SpeciesId, ZoneType } from '@/sim/types';
import type { RivalSpeciesId } from '@/sim/types';

type PerZone = Partial<Record<ZoneType, number>>;

/** GDD 05 §1.3 expected count per plot and map cap of each placed node class (zone multipliers included). */
export const NODE_DENSITY: Record<'aphidHost' | 'flower' | 'efn' | 'elaiosome' | 'prey' | 'crumb' | 'sugar', { perPlot: PerZone; cap: number }> = {
  aphidHost: { perPlot: { forest: 0.05, lawn: 0.03, 'garden-bed': 0.12, pavement: 0.01, sand: 0.005 }, cap: 90 },
  flower: { perPlot: { forest: 0.03, lawn: 0.08, 'garden-bed': 0.15, pavement: 0.01, sand: 0.01 }, cap: 150 },
  efn: { perPlot: { forest: 0.03, 'garden-bed': 0.03 }, cap: 30 },
  elaiosome: { perPlot: { forest: 0.02, 'garden-bed': 0.02 }, cap: 20 },
  prey: { perPlot: { forest: 0.08, lawn: 0.04, 'garden-bed': 0.06 }, cap: 80 },
  crumb: { perPlot: { lawn: 0.005, pavement: 0.02, asphalt: 0.01, sand: 0.03, rubber: 0.01, interior: 0.08 }, cap: 60 },
  sugar: { perPlot: { pavement: 0.005, sand: 0.01, interior: 0.03 }, cap: 15 },
};
/** Map cap scale for compact / large maps follows the plot count (GDD 05 §0: densities per plot). */

/** Minimum aphid host plants on a map (GDD 05 §1.3 "20-90"). */
export const APHID_HOST_MIN = 20;
/** Tree branch aphid sites (GDD 04 §8.1: per branch p 0.35). */
export const TREE_BRANCH_APHID_P = 0.35;

/** T1 static honeydew sites (GDD 05 §0): 1 per 250 plots, at least 2 within 600 BU of the start. */
export const T1_HONEYDEW = { plotsPerSite: 250, nearMin: 2, nearBu: 600 };

/** Crumb spots (GDD 04 §8.1): 300 mm around benches, patio tables, bins; 1-3 clusters per spot. */
export const CRUMB_SPOT = { radiusMm: 300, clusters: [1, 3] as [number, number] };
/** One protein cluster per this many crumb clusters (GDD 05 §1.2: 1 protein per 3 starch). */
export const CRUMB_PROTEIN_EVERY = 4;

/** Fruit trees drop windfalls in autumn: 2-4 anchors per tree under the canopy, at most 4 trees (GDD 04 §8.1). */
export const WINDFALL = { perTree: [2, 4] as [number, number], maxTrees: 4, radiusMm: [150, 900] as [number, number] };

/** Prey patches need humid ground (GDD 04 §8.1: theta0 >= 0.35); patch radius, BU (GDD 05 §2.3). */
export const PREY_PATCH = { thetaMin: 0.35, radiusBu: [20, 60] as [number, number] };

/** Interior POIs and the food they hold (GDD 04 §8.1 interior row; T1 crumb and sugar, T2 the rest). */
export const INTERIOR_VARIANT: Record<string, FoodVariant> = {
  counter: 'crumb-starch', 'bread-board': 'crumb-starch', sugar: 'sugar-granules', 'fruit-bowl': 'berry',
  'hob-grease': 'crumb-fatty', 'table-top': 'crumb-starch', 'under-table': 'crumb-protein', 'pet-food': 'kibble',
  'bin-rim': 'crumb-starch',
};

/** Food anchors must not lie inside solids: the anchor is lifted to the surface if the field is below this, mm. */
export const ANCHOR_SURFACE_TOL_MM = 0.25;

/**
 * Economy floors (registry C13, Lasius summer, loads per game day): the renewable daily supply of the Tier 1 food
 * set within a path radius of the start (pool refill + the T1 crumb re-placement + expected carrion drops; no
 * one-time stock). N 50 at 300 BU: T1 "2 flowers, sugar and crumbs (~15 C), boosted carcasses and crumb-protein
 * (~5-15 P)"; N 300 at 900 BU: "45-60 C and 25-40 P".
 */
export const ECONOMY_FLOORS: readonly { colony: number; radiusBu: number; c: number; p: number }[] = [
  { colony: 50, radiusBu: 300, c: 15, p: 5 },
  { colony: 300, radiusBu: 900, c: 45, p: 25 },
];

/**
 * GDD 05 §1.3 validation: every good-or-better site has >= 2 carbohydrate sources within 400 BU (enforced for the
 * sites near the start; topped up with flowers and measured map-wide, see finalize.ts).
 */
export const SITE_FOOD = { radiusBu: 400, carbMin: 2 };

/**
 * Tier 2 budget (viab-economy R1; registry C13 counts "1-2 herds + 2 flowers (≈ 25 C), 1-2 prey patches (≈ 16-32 P)"
 * within 300 BU for N = 50 at T2). An `aphid-herd` anchor supplies per summer gd the honeydew of the herd it holds
 * with the plants module's start occupancy (HERD_INITIAL_OCCUPANCY), aphids at `aShare` of the host's K, tended,
 * at temperature factor 1 (GDD 05 §1.4: A x HONEYDEW_PER_APHID). A prey patch supplies `preyP` loads P per gd, half
 * the C13 figure (its prey must be caught). The static films and the T1 crumb re-placement are not placed at T2.
 */
export const HERD_OFFER = { aShare: 0.5, preyP: 8 };

/** Top-up of food near the start when a floor is missed: flowers first, then crumb clusters, BU. */
export const TOP_UP = { minBu: 60, maxBu: 280, tries: 40, siteCrumbMax: 6 };

/**
 * Zones a guarantee top-up may put a ground variant in: where the T1 crumb rows of GDD 05 §1.3 place clusters
 * (crumb-protein goes where the starch clusters are, §1.2), outdoors only (the start is outdoors). Never forest or
 * garden beds: there the design places no crumbs.
 */
export function topUpZones(v: FoodVariant): readonly ZoneType[] {
  if (v !== 'crumb-starch' && v !== 'crumb-protein') return [];
  return (Object.keys(NODE_DENSITY.crumb.perPlot) as ZoneType[]).filter((z) => z !== 'interior' && (NODE_DENSITY.crumb.perPlot[z] ?? 0) > 0);
}

// ---- creature territories (GDD 04 §8.2, GDD 05 §2.2) ----

export interface TerritoryRule {
  kind: CreatureKind;
  zones: readonly ZoneType[];
  /** Territories per m^2 of the zones, or per anchor/object as `per`. */
  perM2?: number;
  cap: number;
  radiusMm: [number, number];
}
export const TERRITORY_ZONE_RULES: readonly TerritoryRule[] = [
  { kind: 'earthworm', zones: ['lawn', 'garden-bed'], perM2: 0.2, cap: 30, radiusMm: [200, 400] },
  { kind: 'snail', zones: ['garden-bed', 'forest'], perM2: 0.05, cap: 10, radiusMm: [300, 600] },
  { kind: 'wolf-spider', zones: ['lawn', 'forest'], perM2: 1 / 25, cap: 4, radiusMm: [500, 1000] },
  { kind: 'centipede', zones: ['forest'], perM2: 1 / 30, cap: 3, radiusMm: [300, 600] },
  { kind: 'rove-beetle', zones: ['forest', 'garden-bed'], perM2: 0.05, cap: 6, radiusMm: [200, 400] },
];
/** Woodlice / millipedes: 1 group per log, stump, large stone or pot with this probability. */
export const SHELTER_FAUNA = { p: 0.5, stoneMinMm: 100, radiusMm: 200 };
/** Jumping spiders on walls and fences: 1 per 6 m, cap 4. */
export const JUMPING_SPIDER = { perMm: 1 / 6000, cap: 4, radiusMm: 400 };
/** Aphid predators: 1 territory per 4 aphid anchors. */
export const APHID_PREDATORS = { perAnchors: 4, kinds: ['ladybird', 'ladybird-larva', 'lacewing-larva'] as const, radiusMm: 600 };
/** Ant-spider: best 2 warm, dry cells (sand margins, dry lawn), temperate and Mediterranean regions. */
export const ANT_SPIDER = { max: 2, radiusMm: 400, thetaMax: 0.3 };
/** Antlions: sheltered dry sand (shade >= 0.5, theta0 < 0.15), 1 per m^2, cap 6. */
export const ANTLION = { shadeMin: 0.5, thetaMax: 0.15, perM2: 1, cap: 6, radiusMm: 40 };
/** Birds: one region per open zone (sky view >= 0.7) of at least 4 m^2. */
export const BIRD = { minAreaM2: 4, zones: ['lawn', 'pavement', 'sand', 'rubber'] as readonly ZoneType[], exposureMin: 0.7 };
/** Ant predators keep their territory centres this far from the start (no hazard on top of the queen), BU. */
export const PREDATOR_START_CLEAR_BU = 150;
export const ANT_PREDATORS: readonly CreatureKind[] = ['wolf-spider', 'jumping-spider', 'ant-spider', 'antlion', 'centipede', 'rove-beetle'];

// ---- rival sites (GDD 04 §12.5, GDD 05 §3.1) ----

/** Zones of the playable species when they are rivals (conspecifics; GDD 05 §3.1 roster rows). */
export const CONSPECIFIC_ZONES: Record<SpeciesId, readonly ZoneType[]> = {
  'lasius-niger': ['lawn', 'garden-bed', 'pavement', 'sand'],
  'camponotus-pennsylvanicus': ['forest', 'garden-bed', 'lawn'],
  'messor-barbarus': ['lawn', 'sand', 'pavement'],
  'atta-texana': ['forest', 'lawn', 'garden-bed'],
};

/**
 * Nest-site profile of a rival: the suitability profile of one of the four playable species, with its own
 * moisture window or slab-cover multiplier (GDD 04 §12.5 examples). Missing = the base profile as it is.
 */
export interface RivalSiteProfile {
  base: SpeciesId;
  moist?: { lo0: number; lo1: number; hi1: number; hi0: number };
  slabCoverMult?: number;
  /** Placed at most this far from a map edge (Formica-type), BU; the 200 BU edge minimum does not apply. */
  edgeMaxBu?: number;
  /** Needs at least this share of the map in its zones (Formica: forest >= 20 %). */
  zoneShareMin?: number;
}
export const RIVAL_SITE_PROFILES: Partial<Record<RivalSpeciesId, RivalSiteProfile>> = {
  'myrmica-rubra': { base: 'lasius-niger', moist: { lo0: 0.25, lo1: 0.45, hi1: 0.75, hi0: 0.95 } },
  'tetramorium-immigrans': { base: 'lasius-niger', slabCoverMult: 2 },
  'formica-rufa': { base: 'lasius-niger', edgeMaxBu: 400, zoneShareMin: 0.2 },
  'solenopsis-fugax': { base: 'lasius-niger' },
  'lasius-flavus': { base: 'lasius-niger', moist: { lo0: 0.2, lo1: 0.35, hi1: 0.65, hi0: 0.9 } },
};
/** Rivals choose among the top share of their suitability cells (GDD 04 §12.5), relaxed when nothing fits. */
export const RIVAL_TOP_SHARE = [0.2, 0.5, 1] as const;
/** Incipient conspecifics: 300-800 BU from the start, >= 150 BU from any other nest (GDD 03 §15). */
export const INCIPIENT = { minBu: 300, maxBu: 800, preferMinBu: 550, nestSpacingBu: 150 };
/** Incipients may use any natural zone when their own zones are outside the band. */
export const INCIPIENT_FALLBACK_ZONES: readonly ZoneType[] = ['forest', 'lawn', 'garden-bed'];
/** At most one Formica-type colony (GDD 05 §3.1). */
export const SINGLE_ROSTER: readonly RivalSpeciesId[] = ['formica-rufa'];

// ---- micro-connection guarantee (GDD 04 §6.3 steps 3-4) ----

/** Targeted connections: a carved channel under a thin barrier, radius and depth below the ground, BU. */
export const MICRO_INSERT = { radiusBu: 0.75, depthBu: 2.5, maxCells: 6, maxAdded: 8, sampleStride: 3 };

// ---- start (directions §K, GDD 04 §12.5, worldgen-life addendum) ----

export const START_RULE = {
  /** Good-or-better nav cells reachable by walking within the chapter's radius (START_RADIUS_BU). */
  goodMin: 3,
  /** A diggable founding patch (diggability >= digMin at 1.5 BU depth over patchCells^2 terrain cells, nothing on
   * top) within this walk of the start, BU (the opening's dig-site search reaches 80 BU). */
  digWalkBu: 60,
  digMin: 0.8,
  digDepthBu: 1.5,
  patchCells: 3,
  /** No water body, terrain hole, rival or predator territory within this of the start, BU. */
  hazardClearBu: 40,
  /** Incipient rival nests at least this far, BU. */
  incipientMinBu: 300,
  /** Candidates re-checked with path distances. */
  candidates: 120,
};
