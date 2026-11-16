// Presentation constants of the map boundary (GDD 04 §14 "What the player sees"). Render-only numbers: nothing here
// changes the simulation (the soft margin and the hard limit are locomotion's, src/sim/locomotion/params.ts).
import type { ZoneType } from '@/sim/types';

/** Skirt width beyond each map edge as a fraction of the map side L (GDD 04 §14: 0.5 L). */
export const SKIRT_WIDTH_L = 0.5;
/**
 * Rows outward from the edge: the edge row itself, then the first row at this offset (BU), then each row this many
 * times farther (geometric).
 */
export const SKIRT_FIRST_ROW_BU = 2;
export const SKIRT_ROW_GROWTH = 1.6;
/**
 * Along the edge the rows next to the map use the terrain's own cell spacing, so the skirt's edge meets the terrain
 * exactly (no ledge, no ridge between vertices). Farther out the spacing doubles from row to row while it stays
 * below the row's offset x this factor, never coarser than SKIRT_MIN_SEGMENTS per side.
 */
export const SKIRT_FINE_ROWS = 2;
export const SKIRT_STEP_PER_OFFSET = 1;
export const SKIRT_MIN_SEGMENTS = 32;
/** Extrapolated relief beyond the edge: amplitude grows by this many mm per mm outward, capped (mm). */
export const SKIRT_RELIEF_SLOPE = 0.03;
export const SKIRT_RELIEF_MAX_MM = 500;
/** Feature size of the extrapolation noise as a fraction of L. */
export const SKIRT_NOISE_SCALE_L = 0.06;
/** The skirt is lifted above the clamped terrain plane by this many mm per mm outward, up to the max (mm). */
export const SKIRT_LIFT_PER_MM = 0.01;
export const SKIRT_LIFT_MAX_MM = 2;

/**
 * Exponential haze from the edge outward (GDD 04 §14): extra haze fraction 1 - exp(-d / (k L)) for a point d mm
 * outside the map, on top of the scene's distance haze. At 0.5 L it is ~98 % so the skirt's end never shows.
 */
export const EDGE_HAZE_K_L = 0.08;
/** ...but never shorter than this (mm): small maps (the title vignette) still show human-scale silhouettes softly. */
export const EDGE_HAZE_MIN_MM = 2400;
/**
 * The scene's distance fog reaches the boundary shapes over this fraction of the real distance (look-pass 2): the lawn's
 * 1.2 m visibility hid every fence and tree line at 1.6 m and beyond, so the world ended in a flat band of fog colour.
 * The edge haze (above) then does the aerial perspective, from the map edge outward.
 */
export const BOUNDARY_FOG_SCALE = 0.35;
/** Grazing silhouettes of the backdrop shapes take this much more haze (soft, blurred-looking edges). */
export const BACKDROP_RIM_HAZE = 0.7;
/** Backdrop shapes always carry at least this much haze (aerial perspective: they are never crisp foreground). */
export const BACKDROP_MIN_HAZE = 0.3;
/** ...and at night (look-pass 2): moonlit panels and canopies against the dark horizon band must not read as pale slabs. */
export const BACKDROP_MIN_HAZE_NIGHT = 0.8;
/** Silhouette fuzz: the outermost rim of a backdrop shape is dithered away (hashed alpha), 0..1 strength. */
export const BACKDROP_FUZZ = 0.85;
/** Foliage masses: radius noise amplitude and underside darkening of canopies, shrubs and hedges. */
export const FOLIAGE_LUMP = 0.35;
export const FOLIAGE_SHADE = 0.45;

/** Ground colour of the skirt per zone (GDD 08 11.3 dominant palette, sRGB hex), mixed with a little variation. */
export const SKIRT_ZONE_HEX: Record<ZoneType, string> = {
  forest: '#4a3a2a', lawn: '#5e7f3c', 'garden-bed': '#3e2f24', pavement: '#9c978e', asphalt: '#34322f', sand: '#c4ad84',
  rubber: '#6e3a32', interior: '#8b6544',
};
/** Farther out the skirt tends toward this far-ground tone (soft vegetation), fraction at the skirt's end. */
export const SKIRT_FAR_HEX = '#5a6448';
export const SKIRT_FAR_MIX = 0.6;

/**
 * How far beyond the edge each kind of backdrop shape stands, mm [min, max] (real-world distances, independent of the
 * map size: a neighbour's fence a couple of metres away, trees a few metres into the woods).
 */
export const BACKDROP_BAND_MM = {
  trees: [2000, 8000], roadTrees: [3000, 8000], gardenTrees: [3000, 8000], shrubs: [1200, 3500], understorey: [2500, 7000], fence: [1600, 2000],
  cars: [1200, 2200], hedge: [300, 500], facade: [200, 200],
} as const satisfies Record<string, readonly [number, number]>;
/**
 * Every shape keeps at least this clearance (mm) from the map square (nothing hangs over the playable area). Lumpy
 * foliage counts with its largest lump (radius x (1 + FOLIAGE_LUMP)).
 */
export const BACKDROP_MARGIN_MM = 100;
/** Shapes per metre of edge, per treatment (human-scale objects: sizes in mm, independent of BU). */
export const BACKDROP_DENSITY_PER_M = { trees: 0.35, shrubs: 0.45, understorey: 0.5, fence: 1 / 1.83, hedge: 0.9, cars: 0.18, facade: 0 } as const;

/** Sizes, mm (real-world objects at true scale, GDD 08 11.7: never shown whole from ant height). */
export const BACKDROP_SIZE = {
  trunkDiameter: [220, 650] as const,
  trunkHeight: [6000, 12000] as const,
  /** The trunk narrows to this fraction of its base diameter at the top; the root flare widens the base this much. */
  trunkTaper: 0.55,
  rootFlare: 1.6,
  canopyRadius: [1800, 3500] as const,
  /** Lowest live branches (the crown's bottom) as a fraction of the tree's height. */
  crownBase: [0.3, 0.55] as const,
  /** Saplings and tall understorey stems in the woods: height, crown radius (mm). */
  saplingHeight: [1500, 3500] as const,
  saplingCrown: [400, 900] as const,
  shrubRadius: [350, 900] as const,
  hedgeHeight: [1200, 1700] as const,
  hedgeDepth: [700, 1000] as const,
  fencePanel: { width: 1830, height: 1800, thick: 20, post: 90 },
  car: { length: 4300, width: 1800, height: 1450 },
  facadeHeight: 6200,
  facadeDepth: 4000,
} as const;

/** Silhouette colours (sRGB hex). The haze does most of the work; these keep them believable when close. */
export const BACKDROP_HEX = {
  bark: '#2f2820', canopy: '#34482a', shrub: '#45592f', hedge: '#3b5129', fence: '#6b5845', car: ['#5a6670', '#7a2e2a', '#c9c6be', '#2b2d30'],
  facade: '#b3a28c', roof: '#5b4a42',
} as const;

/** Edge glyph (GDD 04 §14 "edge of the locality"): shown while the possessed ant presses against the hard limit. */
export const EDGE_GLYPH_BAND_BU = 1;
/** Minimum outward component of the ant's intended direction for "pressing outward". */
export const EDGE_GLYPH_MIN_OUTWARD = 0.3;

/** Backdrop fence panels (look-pass 2): height factor range per panel and the share of panels that are missing. */
export const FENCE_HEIGHT_VARY: readonly [number, number] = [0.78, 1.08];
export const FENCE_GAP_P = 0.07;

/**
 * Look pass 2: the skirt's ground colours were the zone palette at full strength, far brighter than the soil and litter
 * inside the map (a flat lime plane with a ruler-straight horizon at the map edge, by day and night). The skirt is
 * drawn at this share of that albedo.
 */
export const SKIRT_ALBEDO_SCALE = 0.5;
/**
 * ...and it is dithered away within this many body units of the map edge, so the terrain's own continuation beyond the
 * edge (same material and light as the ground inside the map) shows through there and the skirt's ground takes over
 * gradually. A haze FLOOR on the skirt (tried first) turned the row that touches the terrain 60 % sky-coloured in one
 * step: a hard line (reviewer, look-pass 2). The skirt and the terrain must meet with equal colour, never with a step.
 */
export const SKIRT_BLEND_BU = 80;
