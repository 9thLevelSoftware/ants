// Every tunable number of the decor renderers (vegetation, draped decor, water) in one place.
// Sources: GDD 04 §9 (decor layers: zones, sizes, densities, seasons), §13 (water), GDD 06 §3.8 (dew),
// GDD 08 §11 (palette and look), spike-look.md §2.8 (grass technique, parting, counts per preset).
// Units: mm unless the name says BU; densities per m² of host zone at High quality (GDD 04 §9 "nominal at High").
//
// Distances that decide how much decor is drawn (streaming radius, LOD and full-density distances, the block size)
// are physical (mm), not BU: blades and leaves have physical sizes and densities, so at a given distance in mm they
// look the same on screen whatever the species, and a radius in BU would make the cost of a view grow with BU²
// (Camponotus, BU 9, would draw 5x the decor of Lasius). The values were tuned at DECOR_REF_BU (Lasius). Distances
// tied to the ant itself (parting, eye fade, lift above the ground) stay in BU.
import type { QualityId } from '@/render/app';

/** Placement tile edge (GDD 04 §9: positions come from hash(seed, layer, tile 64 BU)). */
export const DECOR_TILE_BU = 64;
/** Body unit the physical decor distances were tuned at (Lasius niger), mm. */
export const DECOR_REF_BU = 4;
/**
 * Streaming / draw unit: a block of n x n tiles shares one draw call per layer; n is chosen per BU so a block stays
 * close to this edge (4 tiles at BU 4, 2 at BU 7 and 9).
 */
export const BLOCK_TARGET_MM = 1024;

/**
 * Quality factor on all decor densities (GDD 04 §9: High x1, Medium x0.5, Low x0.25, test 0). Multiplied by the
 * ratio of the preset's current density to its default, so the Settings density slider still works.
 */
export const DECOR_QUALITY_FACTOR: Record<QualityId, number> = { test: 0, low: 0.25, medium: 0.5, high: 1, ultra: 1.25 };

/** Streaming radius per preset, mm (instances fade out before it); also capped by the preset's draw distance. */
export const DECOR_RADIUS_MM: Record<QualityId, number> = { test: 0, low: 1000, medium: 1600, high: 2400, ultra: 3200 };
/** Blocks farther than radius x this are disposed (hysteresis so a block does not flicker in and out). */
export const DECOR_DISPOSE_K = 1.25;
/** Time budget for block generation per frame, ms (at least one block is always generated). */
export const DECOR_BUDGET_MS = 3;
/** Sward heights, dynamic primitives and object moves are compared every this many frames (heights every frame). */
export const DECOR_WATCH_FRAMES = 15;
/**
 * A world change rebuilds the blocks within this distance of the changed rectangle, mm: ground (heights, sward)
 * only moves the blades of a tuft that fan out of their block (GRASS_TUFT.radiusMm); a primitive also decides
 * where the corners of a resting leaf or wrapper lie (half a card, up to about 110 mm).
 */
export const DECOR_CHANGE_MARGIN_MM = { ground: 16, prims: 200 } as const;

// ------------------------------------------------------------------------------------------------- grass

export const GRASS = {
  /** GDD 04 §9 decor-grass: blades per m² near the camera, mown / rough. */
  densityMown: 3000,
  densityRough: 1500,
  /** Blade width range, mm (2-6). */
  widthMm: [2, 6] as const,
  /** Rough sward length range, mm (100-300); mown length = the dynamic sward height. */
  roughLenMm: [100, 300] as const,
  /** Default mown sward height when the sim has no grassHeightMm yet (GDD 04 §15.5 starts 40-60). */
  mownDefaultMm: 50,
  /** Spread of a mown blade's length around the sward height (x). */
  mownLenK: [0.7, 1.2] as const,
  /** Full density within this distance of the camera, mm; beyond, kept fraction (D0 / d)^LOD_POW. */
  lodFullMm: 280,
  lodPow: 1.25,
  /** Far blades widen to keep coverage: width x min(maxWiden, keep^-widenPow). */
  lodWidenPow: 0.5,
  lodMaxWiden: 3.5,
  /** Rows per blade at each preset (spike 2.8 had 4 / 5 / 7 / 9; look-pass: the bend of a blade 15 mm from the
   *  lens showed its polygon kinks at 7; High uses 8 to stay inside the 1.5 M triangle budget); far blocks use half. */
  rows: { test: 3, low: 4, medium: 6, high: 8, ultra: 11 } as Record<QualityId, number>,
  folded: { test: false, low: false, medium: true, high: true, ultra: true } as Record<QualityId, boolean>,
  /** Blocks nearer than this (mm, nearest point) use the full row count and cast shadows. */
  nearBlockMm: 480,
  /** Roots sink this far below the ground so blade bases never float, mm. */
  rootSinkMm: 1,
  /** Atlas strips of the straightened CC0 grass atlas (spike 2.8). */
  strips: 7,
} as const;

/** decor-grass-tuft: tufts per m² in the 1 m band along edges (sand, rubber, pavement, kerbs) / forest clearings. */
export const GRASS_TUFT = {
  densityEdge: 200,
  densityClearing: 100,
  /** Band width along zone edges, mm. */
  bandMm: 1000,
  /** Tuft blade length, mm (30-120), blades per tuft and tuft radius, mm. */
  lenMm: [30, 120] as const,
  blades: [4, 9] as const,
  radiusMm: 6,
} as const;

/**
 * Parting and fading around the line of sight (GDD 04 §9: blades within 1.5 BU of the camera ray fade, within 1 BU
 * of the possessed ant bend away; spike 2.8 for the shape of the effect).
 */
export const PARTING = {
  /** Per-vertex dither fade within this distance of the camera->subject segment, BU. */
  rayFadeBU: 1.5,
  /** Blades whose root is within (bendBU + bendHeightK x height) of the segment in XZ bend away. */
  bendBU: 1.0,
  bendHeightK: 0.25,
  /** Extra bend at the tip, radians, at the segment. */
  bendMaxRad: 1.3,
  /** Eye proximity fade: invisible within near BU of the camera, fully visible beyond far BU. */
  eyeNearBU: 2.8,
  eyeFarBU: 3.2,
  /** The segment continues this far beyond the subject, BU (so blades just behind the ant also part). */
  beyondBU: 1.5,
  /**
   * Eye / line-of-sight fade is a per-blade cut, not a per-pixel screen door (which read as a grainy veil over the
   * near blades and stood still on screen while they moved): a blade is cut where the fade drops below its own
   * threshold, drawn from this range by the blade's random, with a little per-pixel noise to soften the cut edge.
   */
  cutRange: [0.1, 0.9] as const,
  cutNoise: 0.12,
} as const;

/** Wind sway (spike 2.8): radians of extra tip bend per m/s of wind at 2 m, clamped. */
export const WIND = {
  radPerMs: 0.035,
  minRad: 0.02,
  maxRad: 0.22,
  /** Gust wave number along the wind, 1/mm, and speed, rad/s. */
  waveK: 0.006,
  waveSpeed: 1.7,
} as const;

// ------------------------------------------------------------------------------------------------- draped decor

/** Hug rules: draped decor stays within this band above the ground, so an ant (feet on the ground) is on top. */
export const DRAPE = {
  /** Base lift above the ground, BU (the walker's foot offset is 0.15 BU). */
  liftBU: 0.004,
  /** Extra lift at a curled rim, BU, at curl 1. */
  curlBU: 0.03,
  /** Toward-camera depth bias: max(linK x d, depthUnits x one depth step at d). */
  viewBiasLinK: 2.5e-4,
  viewBiasDepthUnits: 6,
  /** Grid quads (along length x across) of the shared draped card per block LOD. */
  lodGrid: [[10, 6], [5, 3], [2, 1]] as const,
  /** Block LOD switch distances (nearest point of the block), mm. */
  lodMm: [320, 880] as const,
  /** Full instance density within this distance, mm; beyond, kept fraction (D0/d)^pow. */
  lodFullMm: 480,
  lodPow: 1.2,
  /**
   * Pixels of items nearer than this (mm) are resolved onto the hugging surface per pixel (drapedShape
   * dcResolve); beyond it the card with its vertex depth bias is drawn as is.
   */
  resolveMm: 600,
} as const;

/**
 * Look pass 3 (S9, leaves read as flat decals at ant height): a lit cut margin and a soft contact shadow on the ground beside
 * the leaf, so a leaf is a thin body lying on the soil. The shadow is blended over the ground (it darkens what is under it
 * by `shadowAlpha` at the margin, falling off over `shadowReachUv` card units): a dithered discard read as black pepper
 * between the lobes (review of look-pass 3). Every number of the leaf's look lives here, the shader only reads them.
 */
export const DECOR_LEAF = {
  /** Brightening of the cut margin (the alpha band [edgeBand0, edgeBand1] rising, falling to edgeBand2). */
  edgeLight: 0.45, edgeBand: [0.5, 0.56, 0.7],
  /** Darkening of the ground at the leaf's margin (0..1) and the reach of the shadow in card units (a leaf is 2 across). */
  shadowAlpha: 0.5, shadowReachUv: 0.09,
  /** Fringe pixels fainter than this are dropped (saves the blend, no visible step). */
  shadowCut: 0.03,
  /** Colour of the shadow (linear): a near-black warm brown, lit like the ground. */
  shadowRgb: [0.012, 0.010, 0.008],
  /** Leaf albedo at full night weight, x the day value: a cream dry leaf stayed the brightest thing in a dark night frame. */
  nightAlbedo: { dry: 0.4, fresh: 0.75 },
  /**
   * Look pass 4: detail made in the shader because the scan (256 texels a leaf) is a flat blur at an ant's eye. Distances in mm
   * (full detail up to [0], gone by [1]); the outline warp (card units, noise cells per mm); serration of the margin (alpha units);
   * stalk position and rib fan; the net of fine veins (noise cells per mm for two scales, contour width); how much veins lift the
   * colour and the net darkens it; yellowing blotches and dark flecks; surface relief fed to the normal.
   */
  detailFadeMm: [260, 800], warpUv: 0.075, warpScale: 0.55, serration: 0.55, serrationScale: 2.2,
  stalkUv: 0.43, ribSpread: 0.6, ribWidthUv: 0.022, netScale: [0.22, 0.6], netWidth: 0.05, veinLift: 0.5, netDark: 0.14,
  blotch: 0.55, blotchScale: 0.075, fleck: 0.35, reliefScale: 0.9, relief: 0.9,
  /** Draw order of the draped decor within the opaque pass: after terrain, primitives, grass and ants (default 0), because the shadow is blended over what is already drawn. */
  renderOrder: 1,
} as const;

/** GDD 04 §9 decor-leaf. Seasonal forest density per m²: index = season (spring, summer, autumn, winter). */
export const LEAF = {
  forestDensity: [400, 250, 600, 400] as const,
  /** Leaf length x width, mm; 30 % birch-like 30-50. */
  lengthMm: [60, 120] as const,
  aspect: [0.55, 0.7] as const,
  smallShare: 0.3,
  smallLengthMm: [30, 50] as const,
  /** Lawn / pavement within this distance of a tree, density linear to 0, mm. */
  fringeMm: 3000,
  /** Autumn window, default-year doy (inclusive): 600/m² (GDD 04 §9). */
  autumnDoy: [15, 21] as const,
  /** Curl 0..1 of a leaf (drawn as rim lift + rim normal bend). */
  curl: [0.2, 1] as const,
} as const;

/** decor-needle [T3]: pine-hardwood forest, 1 x 40-150 mm, 2000/m². */
export const NEEDLE = { density: 2000, lengthMm: [40, 150] as const, widthMm: 1 } as const;

/** decor-petal [T2]: within 1.5 m of flowering shrubs and fruit trees, 8-20 mm, 80/m² in spring doy 2-6. */
export const PETAL = { density: 80, sizeMm: [8, 16] as const, radiusMm: 1500, doy: [2, 6] as const } as const;

/** decor-litter: pavement, asphalt, playground; 0.05/m², 0.5/m² within 1 m of bins; wrappers 50-150 mm. */
export const LITTER = { density: 0.05, binDensity: 0.5, binRadiusMm: 1000, sizeMm: [50, 150] as const, receiptShare: 0.35 } as const;

/** decor-grit: asphalt edges, gravel, sand margins: grains below PROP_MIN_SOLID_BU (0.75), 500/m². */
export const GRIT = { density: 500, sizeBU: [0.12, 0.6] as const, edgeBandMm: 400 } as const;

/** decor-mulch-fine / decor-pebble-fine: x3 their solid categories (mulch chip 12/m², pebble 3/m²). */
export const MULCH_FINE = { density: 36, sizeMm: [6, 20] as const } as const;
export const PEBBLE_FINE = { density: 9, sizeBU: [0.3, 0.7] as const } as const;

/**
 * decor-moss-lichen: on stones, walls, logs where shade >= 0.4 (GDD 04 §9); in paving joints (moss in the sand of
 * the joints, the demo's "paving joints with moss"), candidates per m² of pavement before the joint test.
 */
export const MOSS = {
  minShade: 0.4,
  jointCandidates: 9000,
  /** Joint moss everywhere on pavement gets this share; shaded cells (shade >= minShade) get all. */
  jointSunShare: 0.45,
  jointSizeMm: [8, 24] as const,
  primPerM2: 30,
  primSizeMm: [12, 40] as const,
  primMaterials: ['stone', 'brick', 'concrete', 'bark', 'wood-decayed', 'wood-sound'] as const,
  /** Grid of a baked moss patch on a primitive (vertices per edge). */
  primGrid: 6,
  /** Lift above the primitive surface, mm. */
  primLiftMm: 0.05,
} as const;

/** Object templates the decor reacts to (GDD 04 §5 ids). */
export const DECOR_OBJECTS = {
  trees: ['standing-tree', 'fruit-tree', 'park-tree', 'tree-pit'] as const,
  flowering: ['shrub', 'fruit-tree', 'perennial-plant'] as const,
  bins: ['litter-bin', 'pedal-bin'] as const,
} as const;

// ------------------------------------------------------------------------------------------------- dew and water

/** Dew droplets on blades (GDD 06 §3.8: droplet size 0.2-2 mm; dewLevel 0..1). */
export const DEW = {
  /** Only blocks nearer than this (nearest point) get droplets, mm. */
  blockRadiusMm: 240,
  /** Share of blades with droplets at dewLevel 1, and droplets per such blade. */
  bladeShare: 0.45,
  perBlade: [1, 4] as const,
  radiusMm: [0.25, 1.1] as const,
} as const;

export const WATER = {
  /** Meniscus band at the waterline, mm (bright rim, slight alpha boost). */
  meniscusMm: 0.2,
  /** Depth at which the water reaches its full darkening, mm. */
  fullDepthMm: 8,
  /** Clear water in vessels darkens over this depth, mm. */
  clearFullDepthMm: 120,
  /** Puddle cells with less water than this are dry, mm. */
  minPuddleMm: 0.3,
  /** Water tint (linear) seen through shallow water and at depth. */
  shallowTint: [0.62, 0.6, 0.52] as const,
  deepTint: [0.05, 0.06, 0.05] as const,
  roughness: 0.04,
  /** Ground under a puddle surface is drawn this far below the water plane only (wet seam), mm. */
  seamMm: 0.15,
} as const;

// ------------------------------------------------------------------------------------------------- palettes

/** Seasonal leaf palette (linear multipliers on the atlas colour): spring, summer, autumn, winter. GDD 08 11.3. */
export const LEAF_PALETTE = {
  /** Share of fresh-coloured (maple atlas) leaves per season; the rest are dry oak-type leaves. */
  freshShare: [0.12, 0.1, 0.65, 0.05] as const,
  /**
   * Tint of dry litter per season (old leaves darken and grey over winter). The oak atlas is a pale peach scan:
   * outside autumn it is pulled toward weathered brown (look-pass: summer litter read as salmon-pink sheets).
   */
  dryTint: [[0.48, 0.47, 0.4], [0.5, 0.5, 0.42], [0.92, 0.8, 0.66], [0.44, 0.41, 0.37]] as const,
  /** Tint of fresh leaves per season. */
  freshTint: [[0.9, 0.95, 0.8], [0.85, 0.95, 0.75], [1.05, 1.0, 0.95], [0.7, 0.65, 0.6]] as const,
  /** Saturation per season (1 = atlas). */
  saturation: [0.6, 0.6, 0.95, 0.55] as const,
} as const;
