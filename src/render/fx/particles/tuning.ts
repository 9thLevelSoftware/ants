// Presentation constants of the particle effects (GDD 08 §11.5, §11.7): small things that sell ant-scale
// physicality. Sizes and speeds in BU (scaled by the species' body unit), times in real seconds. Render only.
import type { QualityId } from '@/render/app/quality';
import type { MaterialId } from '@/sim/types';

export interface ParticleBudget {
  /** Pooled particles (debris, dust, droplets, mist, puffs, crumbs). */
  particles: number;
  /** Underground scent motes. */
  motes: number;
  /** Effects farther than this from the camera are not spawned, BU. */
  radiusBu: number;
  /** Ants sampled per frame for footfall dust. */
  footfallAnts: number;
}

/** Everything is off in the `test` preset unless explicitly requested (then the `high` numbers apply). */
export const PARTICLE_BUDGET: Readonly<Record<QualityId, ParticleBudget>> = {
  test: { particles: 0, motes: 0, radiusBu: 0, footfallAnts: 0 },
  low: { particles: 400, motes: 120, radiusBu: 80, footfallAnts: 8 },
  medium: { particles: 900, motes: 240, radiusBu: 120, footfallAnts: 16 },
  high: { particles: 1600, motes: 400, radiusBu: 160, footfallAnts: 24 },
  ultra: { particles: 2600, motes: 600, radiusBu: 220, footfallAnts: 32 },
};
export const REQUESTED_IN_TEST: QualityId = 'high';

/** Pending emits kept while the sim runs without frames (older ones are dropped), and their max age, ticks. */
export const EMIT_QUEUE = 512;
export const EMIT_MAX_AGE_TICKS = 30;

/** Gravity, BU/s² (an ant-scale grain falls ~10 BU in its first half second; air drag does the rest). */
export const GRAVITY_BU_S2 = 60;

/** One effect: count, size (start, end), speed, life, colour (sRGB) and alpha, gravity factor, drag per s. */
export interface Recipe {
  count: [number, number];
  size: [number, number];
  /** Size multiplier at the end of life. */
  grow: number;
  speed: [number, number];
  /** Share of the velocity along the surface normal (the rest spreads tangentially). */
  lift: number;
  life: [number, number];
  color: string;
  alpha: number;
  gravity: number;
  drag: number;
  /** Settles on the floor (a grain) instead of falling through. */
  settles: boolean;
}

export type EffectKind = 'debris' | 'pellet' | 'dust' | 'splash' | 'drip' | 'mist' | 'puff' | 'crumbs';

export const RECIPES: Readonly<Record<EffectKind, Recipe>> = {
  debris: { count: [7, 11], size: [0.1, 0.2], grow: 1, speed: [3, 7], lift: 0.75, life: [1.2, 2], color: '#7A6048', alpha: 0.95, gravity: 1, drag: 1.5, settles: true },
  pellet: { count: [5, 8], size: [0.12, 0.25], grow: 1, speed: [1.5, 4], lift: 0.45, life: [0.9, 1.6], color: '#6B4F33', alpha: 0.95, gravity: 1, drag: 1, settles: true },
  dust: { count: [1, 2], size: [0.35, 0.6], grow: 2.2, speed: [0.2, 0.6], lift: 0.8, life: [0.6, 1.1], color: '#C9B08A', alpha: 0.22, gravity: -0.02, drag: 2.5, settles: false },
  splash: { count: [7, 11], size: [0.08, 0.18], grow: 0.7, speed: [4, 8], lift: 0.75, life: [0.35, 0.7], color: '#D8E8F2', alpha: 0.85, gravity: 1, drag: 0.8, settles: false },
  drip: { count: [1, 1], size: [0.18, 0.24], grow: 1, speed: [0, 0.2], lift: -1, life: [0.8, 1.2], color: '#D8E8F2', alpha: 0.9, gravity: 1, drag: 0.2, settles: false },
  mist: { count: [14, 18], size: [0.4, 0.7], grow: 2.6, speed: [5, 9], lift: 0.25, life: [0.7, 1.1], color: '#F6F2CF', alpha: 0.16, gravity: 0, drag: 4, settles: false },
  puff: { count: [8, 10], size: [1, 1.5], grow: 2.4, speed: [0.8, 1.6], lift: 0.4, life: [1.2, 1.8], color: '#F4EEE2', alpha: 0.13, gravity: -0.01, drag: 1.6, settles: false },
  crumbs: { count: [4, 7], size: [0.08, 0.16], grow: 1, speed: [1.5, 3.5], lift: 0.8, life: [0.6, 1.1], color: '#8A6A44', alpha: 0.95, gravity: 1, drag: 1.2, settles: true },
};

/** Grain colour by the material a bite or pellet came from (GDD 08 §11.6: pellets match the source substrate). */
export const MATERIAL_GRAIN: Partial<Record<MaterialId, string>> = {
  loam: '#7A6048', humus: '#5E4834', sand: '#CDB58A', clay: '#8A5A3C', gravel: '#8E857A', 'wood-sound': '#A07A50',
  'wood-decayed': '#7A5A3A', bark: '#4A3B2E', insulation: '#E8DCC0', mortar: '#B8B0A2', plaster: '#E6DFD2',
};

/** Footfall dust: only on dry loose ground (topsoil moisture below DRY), ants faster than MIN_SPEED BU/s. */
export const LOOSE_MATERIALS: ReadonlySet<MaterialId> = new Set<MaterialId>(['sand', 'loam', 'humus', 'gravel', 'clay']);
export const FOOTFALL_DRY = 0.3;
export const FOOTFALL_MIN_SPEED_BU_S = 3;
/** Dust puffs per BU walked by a sampled ant (before the per-frame sample share). */
export const FOOTFALL_PER_BU = 0.25;

/** Scent motes (GDD 08 §11.5): 0.05 BU, 1 per 8 BU³ near traffic, drifting, colourless unless the scent view is on. */
export const MOTE = {
  sizeBu: 0.05,
  /** Rendered a little larger than the physical size so a mote reads as a point of light, not a sub-pixel. */
  drawScale: 1.2,
  perBu3: 1 / 8,
  /** Emitters: brood piles, food stores, the queen; motes within this radius of one, BU. */
  radiusBu: 3,
  /** Motes only within this distance of the camera, BU. */
  nearBu: 40,
  life: [4, 8] as [number, number],
  driftBu: 0.25,
  color: '#FFE6C4',
  alpha: 0.4,
} as const;

export const PARTICLE_RENDER_ORDER = 920;
export const MOTE_RENDER_ORDER = 930;
/** Points never grow beyond this on screen, px, and fade out nearer than this to the eye, mm. */
export const MAX_POINT_PX = 48;
export const NEAR_FADE_MM: [number, number] = [6, 14];
