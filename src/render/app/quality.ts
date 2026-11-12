// Quality presets as plain data (architecture section 6, GDD 08 7.4 / 11.1). `test` turns everything expensive off
// and renders on demand (tech-stack section 3: post OFF, MSAA OFF, shadows OFF for headless software GL).
//
// Values come from the tech-stack spike and GDD 08 LOOK_* targets; spike-look.md did not exist when this was
// written, so they are starting points meant to be retuned here (one place).

export type QualityId = 'test' | 'low' | 'medium' | 'high' | 'ultra';
export type QualitySetting = QualityId | 'auto';

export const QUALITY_IDS: readonly QualityId[] = ['test', 'low', 'medium', 'high', 'ultra'];
/** Player-facing presets (test is a verification mode, not offered in Settings). */
export const PLAYER_QUALITY_IDS: readonly QualityId[] = ['low', 'medium', 'high', 'ultra'];

export interface DofParams {
  enabled: boolean;
  /** Bokeh scale (LOOK_BOKEH: Medium 2.0, High 3.2, Ultra 3.2). */
  bokehScale: number;
  /** Resolution of the blur passes relative to the frame (0.5 = half res). */
  resolutionScale: number;
  /** Focus range as a multiple of the focus distance (LOOK_DOF_RANGE = 0.6). */
  rangeK: number;
}

export interface BloomParams {
  enabled: boolean;
  intensity: number;
  threshold: number;
  smoothing: number;
  levels: number;
  radius: number;
}

export interface VignetteParams {
  enabled: boolean;
  offset: number;
  darkness: number;
}

export interface PostParams {
  /** Whole post chain on. Off: direct render with renderer tone mapping (and MSAA if `msaa`). */
  enabled: boolean;
  dof: DofParams;
  bloom: BloomParams;
  vignette: VignetteParams;
  smaa: { enabled: boolean; preset: 'low' | 'medium' | 'high' | 'ultra' };
}

export interface ShadowParams {
  enabled: boolean;
  mapSize: number;
  /** Half-extent of the sun shadow frustum around the camera focus, in BU. */
  distanceBU: number;
  type: 'basic' | 'pcf' | 'vsm';
}

export interface DynResParams {
  enabled: boolean;
  /** Target frame rate (GDD 08: 60 or 30). */
  targetFps: number;
  minScale: number;
  maxScale: number;
}

export interface QualityPreset {
  id: QualityId;
  /** Static resolution scale of the drawing buffer relative to CSS px x device pixel ratio (0.5..1). */
  resolutionScale: number;
  /** Device pixel ratio cap. */
  maxPixelRatio: number;
  dynamicResolution: DynResParams;
  /** Default-framebuffer MSAA, used only when post is off (post uses SMAA; antialias is fixed at creation). */
  msaa: boolean;
  shadows: ShadowParams;
  post: PostParams;
  /** Instance density multipliers for vegetation/decor/ants-at-distance renderers (0..1+). */
  density: { grass: number; litter: number; decor: number; crowdLod: number };
  anisotropy: number;
  /** Far plane / streaming radius, in BU. */
  drawDistanceBU: number;
  fog: { enabled: boolean; hazeScale: number };
  /** Render only when something requested a frame (test mode). */
  renderOnDemand: boolean;
  /** Cap for texture uploads (px); 0 = no cap. */
  maxTextureSize: number;
}

const POST_OFF: PostParams = {
  enabled: false,
  dof: { enabled: false, bokehScale: 0, resolutionScale: 0.5, rangeK: 0.6 },
  bloom: { enabled: false, intensity: 0.6, threshold: 0.9, smoothing: 0.2, levels: 5, radius: 0.75 },
  vignette: { enabled: false, offset: 0.28, darkness: 0.5 },
  smaa: { enabled: false, preset: 'medium' },
};

function post(over: { dof?: Partial<DofParams>; bloom?: Partial<BloomParams>; vignette?: Partial<VignetteParams>; smaa?: Partial<PostParams['smaa']> }): PostParams {
  return {
    enabled: true,
    dof: { ...POST_OFF.dof, enabled: true, ...over.dof },
    bloom: { ...POST_OFF.bloom, enabled: true, ...over.bloom },
    vignette: { ...POST_OFF.vignette, enabled: true, ...over.vignette },
    smaa: { ...POST_OFF.smaa, enabled: true, ...over.smaa },
  };
}

export const QUALITY_PRESETS: Record<QualityId, QualityPreset> = {
  test: {
    id: 'test', resolutionScale: 1, maxPixelRatio: 1,
    dynamicResolution: { enabled: false, targetFps: 60, minScale: 1, maxScale: 1 },
    msaa: false,
    shadows: { enabled: false, mapSize: 512, distanceBU: 60, type: 'basic' },
    post: POST_OFF,
    density: { grass: 0.25, litter: 0.25, decor: 0.25, crowdLod: 0.25 },
    anisotropy: 1, drawDistanceBU: 1500, fog: { enabled: true, hazeScale: 1 },
    renderOnDemand: true, maxTextureSize: 1024,
  },
  low: {
    id: 'low', resolutionScale: 0.85, maxPixelRatio: 1,
    dynamicResolution: { enabled: true, targetFps: 60, minScale: 0.6, maxScale: 1 },
    msaa: true,
    shadows: { enabled: true, mapSize: 1024, distanceBU: 60, type: 'pcf' },
    post: POST_OFF,
    density: { grass: 0.4, litter: 0.4, decor: 0.5, crowdLod: 0.5 },
    anisotropy: 2, drawDistanceBU: 2000, fog: { enabled: true, hazeScale: 0.85 },
    renderOnDemand: false, maxTextureSize: 1024,
  },
  medium: {
    id: 'medium', resolutionScale: 1, maxPixelRatio: 1.5,
    dynamicResolution: { enabled: true, targetFps: 60, minScale: 0.6, maxScale: 1 },
    msaa: false,
    shadows: { enabled: true, mapSize: 2048, distanceBU: 90, type: 'pcf' },
    post: post({ dof: { bokehScale: 2.0, resolutionScale: 0.5 }, bloom: { levels: 5 }, smaa: { preset: 'medium' } }),
    density: { grass: 0.7, litter: 0.7, decor: 0.75, crowdLod: 0.75 },
    anisotropy: 4, drawDistanceBU: 3500, fog: { enabled: true, hazeScale: 1 },
    renderOnDemand: false, maxTextureSize: 2048,
  },
  high: {
    id: 'high', resolutionScale: 1, maxPixelRatio: 2,
    dynamicResolution: { enabled: true, targetFps: 60, minScale: 0.7, maxScale: 1 },
    msaa: false,
    shadows: { enabled: true, mapSize: 2048, distanceBU: 140, type: 'pcf' },
    post: post({ dof: { bokehScale: 3.2, resolutionScale: 0.5 }, bloom: { levels: 7 }, smaa: { preset: 'high' } }),
    density: { grass: 1, litter: 1, decor: 1, crowdLod: 1 },
    anisotropy: 8, drawDistanceBU: 5000, fog: { enabled: true, hazeScale: 1 },
    renderOnDemand: false, maxTextureSize: 4096,
  },
  ultra: {
    id: 'ultra', resolutionScale: 1, maxPixelRatio: 2,
    dynamicResolution: { enabled: true, targetFps: 60, minScale: 0.8, maxScale: 1 },
    msaa: false,
    shadows: { enabled: true, mapSize: 4096, distanceBU: 200, type: 'pcf' },
    post: post({ dof: { bokehScale: 3.2, resolutionScale: 1 }, bloom: { levels: 8 }, smaa: { preset: 'ultra' } }),
    density: { grass: 1.25, litter: 1.25, decor: 1.25, crowdLod: 1.25 },
    anisotropy: 16, drawDistanceBU: 8000, fog: { enabled: true, hazeScale: 1 },
    renderOnDemand: false, maxTextureSize: 8192,
  },
};

/** A deep copy of a preset (callers may then apply user overrides without mutating the table). */
export function getPreset(id: QualityId): QualityPreset {
  return structuredCloneSafe(QUALITY_PRESETS[id]);
}

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export function isQualityId(s: unknown): s is QualityId {
  return typeof s === 'string' && (QUALITY_IDS as readonly string[]).includes(s);
}

/** Player overrides from Settings > Graphics (GDD 08 7.4) applied on top of a preset. */
export interface GraphicsOverrides {
  resolutionScale?: number; // 0.5..1
  dynamicResolution?: boolean;
  targetFps?: 30 | 60;
  depthOfField?: 'off' | 'subtle' | 'full';
  haze?: boolean;
  shadows?: 'off' | 'low' | 'high';
  density?: number; // 0.25..1
  reducedMotion?: boolean;
}

/** Apply Settings overrides. Subtle DoF = bokeh 2.0; full = the preset's value (or 3.2 if the preset has none). */
export function applyOverrides(base: QualityPreset, o: GraphicsOverrides): QualityPreset {
  const p = structuredCloneSafe(base);
  if (o.resolutionScale !== undefined) p.resolutionScale = Math.min(1, Math.max(0.5, o.resolutionScale));
  if (o.dynamicResolution !== undefined) p.dynamicResolution.enabled = o.dynamicResolution && base.id !== 'test';
  if (o.targetFps !== undefined) p.dynamicResolution.targetFps = o.targetFps;
  if (o.depthOfField !== undefined && p.post.enabled) {
    p.post.dof.enabled = o.depthOfField !== 'off';
    if (o.depthOfField === 'subtle') p.post.dof.bokehScale = 2.0;
    if (o.depthOfField === 'full') p.post.dof.bokehScale = Math.max(3.2, base.post.dof.bokehScale);
  }
  if (o.haze !== undefined) p.fog.enabled = o.haze;
  if (o.shadows !== undefined) {
    p.shadows.enabled = o.shadows !== 'off';
    if (o.shadows === 'low') p.shadows.mapSize = Math.min(p.shadows.mapSize, 1024);
    if (o.shadows === 'high') p.shadows.mapSize = Math.max(p.shadows.mapSize, 2048);
  }
  if (o.density !== undefined) {
    const d = Math.min(1, Math.max(0.25, o.density));
    p.density.grass = d; p.density.litter = d;
  }
  return p;
}
