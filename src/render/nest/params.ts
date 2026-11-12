// Every tunable number of the nest renderer, in one file so it can be merged into the shared material library
// later. Lengths in BU unless the name says Mm; colours are sRGB hex (GDD 08 gives them that way).
//
// Sources: GDD 08 11.5 (underground look), GDD 08 4.3 and GDD 01 6.7 (cutaway), spike-nest.md 5.6/5.8/5.11 and 6,
// spike-look.md 2.9 (daylight dying along the tunnel, SDF AO).
import type { QualityId } from '@/render/app';
import type { MaterialId } from '@/sim/types';

// ------------------------------------------------------------------------------------------------ meshing

/** Chunks per region edge: a region (R^3 chunks) is one geometry and one draw per wall material. */
export const REGION_CHUNKS = 4;

export interface MeshQuality {
  /** Wall-clock budget for re-meshing per frame, ms (at least one build stage always runs). */
  budgetMs: number;
  /** Curved edges split at midpoints moved onto the curve of the end normals (rounder tunnels; refine.ts). */
  refine: boolean;
  /** Per-vertex ambient occlusion taps from the carve field. */
  ao: boolean;
  /** Walls cast sun shadows (only when the preset has shadows). */
  castShadow: boolean;
  /** Second, finer normal-map scale on the walls. */
  detailNormals: boolean;
}

export const MESH_QUALITY: Record<QualityId, MeshQuality> = {
  test: { budgetMs: 4, refine: true, ao: true, castShadow: false, detailNormals: false },
  low: { budgetMs: 1.5, refine: false, ao: true, castShadow: false, detailNormals: false },
  medium: { budgetMs: 2, refine: true, ao: true, castShadow: false, detailNormals: true },
  high: { budgetMs: 3, refine: true, ao: true, castShadow: true, detailNormals: true },
  ultra: { budgetMs: 4, refine: true, ao: true, castShadow: true, detailNormals: true },
};

/** Largest move of a refined midpoint off its chord, in voxels (keeps thin features from folding). */
export const REFINE_MAX_MOVE_VOXELS = 0.35;
/** Edges whose endpoint normals differ by less than this are not split (flat floors stay coarse), degrees. */
export const REFINE_FLAT_DEG = 9;
/** Below this soil depth (BU) a midpoint's discard attribute is interpolated instead of evaluated. */
export const REFINE_EXACT_SOIL_BU = 2;

/** AO taps along the normal (BU) and the darkest AO value. */
export const AO_TAPS_BU: readonly [number, number] = [0.6, 1.4];
export const AO_MIN = 0.35;

/**
 * Discard band below the soil surface (spike-nest.md 5.6b): cavity walls within this depth are not drawn so the MC
 * "dish" of a sphere that barely dips into the ground never pokes through flat terrain. Must stay below the
 * terrain hole margin (render-world HOLE_MARGIN_BU = 0.125) so the terrain lip always hides the cut.
 */
export const CAVITY_SKIN_BU = 0.05;
/**
 * The skin band is not applied where the terrain hole probe is above -this (BU): inside the hole and under the
 * terrain lip (render-world HOLE_MARGIN_BU = 0.125, plus 0.025 for the hole mask's outline error). There the wall
 * top must reach the surface, or grazing views across the hole see the sky through the band under the lip.
 */
export const HOLE_LIP_BU = 0.15;
/** Polygon offset of the wall materials (pushes walls behind terrain they are flush with; spike-nest 5.6b). */
export const WALL_DEPTH_OFFSET = { factor: 2, units: 8 } as const;

/** Chunk builds: smoothing of the per-stage cost estimate (ms per marching-cubes triangle) and its first guess. */
export const BUILD_COST_EMA = 0.25;
export const BUILD_COST_INITIAL_MS_PER_TRI = 0.0004;
/** Edit batches: frames until a batch is shown as far as it got; the backlog gets a chunk at least this often. */
export const BATCH_MAX_FRAMES = 8;
export const BACKLOG_MAX_WAIT_FRAMES = 4;
/** A finished batch waits one frame when the builds of this frame already used this fraction of the budget. */
export const COMMIT_DEFER_FRACTION = 0.6;
/** Backlog ordering: distance buckets (in chunk edges) and how far the camera may move before re-bucketing. */
export const BACKLOG_BUCKET_CHUNKS = 1;
export const BACKLOG_REORDER_CHUNKS = 2;

// ------------------------------------------------------------------------------------------------ wall look

export interface WallLook {
  /** Material library row whose texture set the wall uses. */
  textureFrom: MaterialId;
  /** mm per texture tile on the walls (finer than the surface: walls are seen from 1-5 BU). */
  scaleMm: number;
  /** Linear albedo multiplier. */
  tint: [number, number, number];
  normalScale: number;
  /** Strength of the horizontal strata banding 0..1 (soil); wood uses grain along X instead. */
  strata: number;
  /** Fine grain noise amplitude. */
  grain: number;
  /** Albedo factor when soaked, and how much moisture of the soil shows on the wall. */
  wetDarken: number;
}

const SOIL_WALL: WallLook = { textureFrom: 'loam', scaleMm: 48, tint: [0.62, 0.7, 0.97], normalScale: 1.2, strata: 0.45, grain: 0.35, wetDarken: 0.55 };

/** Wall looks per substrate material; anything missing uses `loam`. */
export const WALL_LOOKS: Partial<Record<MaterialId, WallLook>> = {
  loam: SOIL_WALL,
  humus: { ...SOIL_WALL, textureFrom: 'humus', scaleMm: 70, tint: [0.7, 0.66, 0.66], strata: 0.3 },
  sand: { ...SOIL_WALL, textureFrom: 'sand', scaleMm: 36, tint: [0.95, 0.9, 0.84], strata: 0.35, grain: 0.5, wetDarken: 0.65 },
  clay: { ...SOIL_WALL, scaleMm: 60, tint: [0.92, 0.66, 0.5], normalScale: 0.7, strata: 0.7, grain: 0.15 },
  gravel: { ...SOIL_WALL, textureFrom: 'gravel', scaleMm: 60, tint: [0.75, 0.72, 0.68], strata: 0.2, grain: 0.4 },
  'wood-decayed': { textureFrom: 'wood-decayed', scaleMm: 90, tint: [0.92, 0.8, 0.66], normalScale: 1.4, strata: 0, grain: 0.3, wetDarken: 0.6 },
  'wood-sound': { textureFrom: 'wood-decayed', scaleMm: 120, tint: [1.15, 0.98, 0.78], normalScale: 1.0, strata: 0, grain: 0.2, wetDarken: 0.75 },
  bark: { textureFrom: 'bark', scaleMm: 90, tint: [0.75, 0.66, 0.58], normalScale: 1.3, strata: 0, grain: 0.3, wetDarken: 0.6 },
  insulation: { textureFrom: 'insulation', scaleMm: 30, tint: [1, 1, 1], normalScale: 1, strata: 0, grain: 0.3, wetDarken: 0.7 },
};

/** Materials whose walls show wood grain (along the grain axis) instead of soil strata. */
export const WOODY: ReadonlySet<MaterialId> = new Set<MaterialId>(['wood-decayed', 'wood-sound', 'bark']);

/** Detail normal scale relative to the main tile, and its weight. */
export const DETAIL_NORMAL_SCALE = 0.23;
export const DETAIL_NORMAL_WEIGHT = 0.45;

// ------------------------------------------------------------------------------------------------ underground light

/**
 * GDD 08 11.5: no physical light underground; a soft "sense light" (warm #FFB775, radius 12 BU, falloff squared)
 * around the possessed ant (the spec; the camera when nothing is possessed) plus an ambient #2A1F17, daylight
 * falling 3-4 BU into tunnels from open entrances. Levels are linear radiance multipliers tuned by eye at the
 * underground exposure (+1.7 EV, render-world UNDERGROUND).
 */
export const NEST_LIGHT = {
  ambientHex: '#2A1F17',
  ambientLevel: 1.3,
  /** Ambient boost near entrances (factor at the mouth) and its falloff length, BU. */
  ambientNearBoost: 1.6,
  ambientNearBU: 10,
  /** Ambient at great depth below the surface (factor) reached at this depth, BU. */
  ambientDeepFactor: 0.55,
  ambientDeepBU: 40,
  lanternHex: '#FFB775',
  lanternRadiusBU: 12,
  lanternLevel: 1.25,
  /** Wrap lighting of the lantern (0 = Lambert, 1 = flat). */
  lanternWrap: 0.35,
  /** Daylight shaft: e-folding length into the tunnel, BU (e^-3 at 3.6 BU: "3-4 BU", GDD 08 11.5). */
  skyFalloffBU: 1.2,
  /** Daylight at full day on the walls at the mouth (linear radiance multiplier of the daylight colour): sky light
   *  only (no direct sun inside a hole), so well below the sunlit ground. */
  skyLevel: 1.1,
  /** Default daylight colour (sRGB) and level when nobody sets one (midday). */
  daylightHex: '#E8E4DA',
  /** Default moisture -> wetness mapping (wet = moisture * scale + offset): soil at 0.4 reads slightly damp. */
  moistScale: 0.6,
  moistOffset: -0.1,
  /** Max sky openings in the shader (nearest to the camera). */
  maxOpenings: 16,
} as const;

/** GDD 08 11.5: freshly carved walls are darker and damper-looking for 1 game hour (250 ticks). */
export const FRESH_WALL = {
  ticks: 250,
  /** Albedo factor and extra wetness at the moment of carving (fading linearly to none). */
  darken: 0.72,
  wet: 0.6,
} as const;

/**
 * Per-vertex nest attribute: ambient occlusion, soil moisture, tick the wall was carved (fresh look), and the signed
 * openness of the ground above the vertex (mm, > 0 where the terrain is cut open: no skin band there).
 */
export const NEST_ATTR = 4;
/** Ground openness is evaluated for vertices shallower than this (BU); deeper ones never reach the skin band. */
export const HOLE_ATTR_DEPTH_BU = 1;
/** Ground openness is clamped to +-this (mm) so interpolation stays local to the hole outline. */
export const HOLE_ATTR_CLAMP_MM = 4;

/** GDD 08 11.5 fog and the exposure switch, for callers that drive the post chain from the nest renderer. */
export const NEST_LOOK = {
  fogHex: '#1E1712',
  fogLevel: 0.2,
  fogVisBU: 30,
  /** Exposure underground (render-world UNDERGROUND.exposureEV). */
  exposureEV: 1.7,
  /** GDD 01 6.1: surface <-> underground exposure adaptation 1.0 real s (time constant tau = 1/3 s). */
  adaptS: 1.0,
  /** The camera counts as underground deeper than this below the substrate surface, BU (hysteresis band). */
  enterDepthBU: 0.3,
  exitDepthBU: 0.1,
} as const;

// ------------------------------------------------------------------------------------------------ cutaway

/** GDD 08 4.3: cap #3A2A1E, cut edge 0.25 BU line in --c-text-3 (#A39884). */
export const CUTAWAY = {
  capHex: '#3A2A1E',
  edgeHex: '#A39884',
  edgeBU: 0.25,
  /** Cap texel size: at least this (BU) and at most 2R / capMaxTexels. */
  capTexelBU: 0.5,
  capMaxTexels: 512,
  /** Cap rasterisation budget per frame, ms (the previous cap stays until the new one is complete). */
  capBudgetMs: 6,
  /** Fill light into the cut nest from the cut side (so the colony view reads), level and falloff BU. */
  fillLevel: 5,
  fillFalloffBU: 40,
  fillHex: '#D8CDB8',
  /** Hard primitives seen in the cap. */
  stoneHex: '#77736C',
  /** Radiance multiplier of the cap colour (so the tone-mapped cap reads as #3A2A1E on screen). */
  capLevel: 1.8,
} as const;

/** GDD 08 4.3: ground over the nest at alpha 0.15 -> the nest cast is drawn at 0.85 over the ground. */
export const XRAY = {
  opacity: 0.85,
  nearHex: '#E7D7B8',
  deepHex: '#8A6F55',
  deepBU: 40,
  /** Render order of the x-ray passes (draw your own overlays above this). */
  renderOrder: 1000,
} as const;

/** Render order of nest ghosts (dig plans, markers): after the x-ray passes. */
export const GHOST_RENDER_ORDER = 1010;
