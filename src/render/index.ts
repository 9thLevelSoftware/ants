// Sub-renderer registry (contracts guidance §8, architecture §4/§6). Slots are drawn in a fixed order; each slot
// uses its registered real renderer, or the matching debug renderer from src/render/debug when none is
// registered (or when debug rendering is forced). Real renderers are added with registerRenderer() below: this
// list is the only registration point (composition roots change only by adding registrations).
import type { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import type { Vec3 } from '@/core';
import type { Sim } from '@/sim/types';
import type { QualityPreset } from '@/render/app';
import type { GradeParams } from '@/render/app/look';
import type { AssetLoader } from '@/render/assets';
import type { CutawayParams, FadeOutput } from '@/render/camera';
import { DEBUG_RENDERERS } from './debug';
import { AntsSlot, CreaturesSlot, FxSlot, HumansSlot, NestSlot, WeatherSlot, WorldSlot } from './slots';

export type RendererSlot = 'world' | 'nest' | 'ants' | 'creatures' | 'humans' | 'weather' | 'fx';
/**
 * Update and init order. `world` first: it owns the lights, sky and fog, and it is the only writer of the ground's
 * wetness (slots/worldSlot.ts wetnessTarget; the weather slot is not given the world peer). `weather` comes late only
 * so that `fx`, last, draws its overlays over the rain.
 */
export const RENDERER_SLOTS: readonly RendererSlot[] = ['world', 'nest', 'ants', 'creatures', 'humans', 'weather', 'fx'];

export type ViewName = 'possess' | 'observer' | 'colony' | 'photo';

/** What renderers may ask of the game (kept tiny on purpose). */
export interface RenderGameHooks {
  /** Ask for a frame (render-on-demand in test mode). */
  requestRender(): void;
  /** ?test=1: deterministic, no animation clock. */
  readonly testMode: boolean;
}

export interface RenderContext {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  quality: QualityPreset;
  /** The one asset loader (architecture §8); null when not available. */
  assets: AssetLoader | null;
  game: RenderGameHooks;
  /** Exposure hook (RenderApp.setExposure). */
  setExposure?: (ev: number) => void;
  /** Colour grade hook (RenderApp.setGrade): saturation and linear gain from the world lighting (render-integration). */
  setGrade?: (g: GradeParams) => void;
  /**
   * Another slot's renderer (set by RenderRegistry; every slot's renderer exists before any init runs, slots
   * earlier in RENDERER_SLOTS are initialised first). Lets the nest share the world's material library.
   */
  peer?: (slot: RendererSlot) => SubRenderer | null;
}

/** A hover / inspect highlight target. */
export interface HighlightRef {
  kind: 'ant' | 'brood' | 'item';
  id: number;
}

/** A pose the renderers draw for the possessed ant (per-frame prediction), mm and unit vectors. */
export interface PoseLike {
  pos: Vec3;
  up: Vec3;
  fwd: Vec3;
}

export interface FrameInfo {
  /** Real seconds since the last frame. */
  dt: number;
  /** Animation clock, seconds (frozen in test mode). */
  time: number;
  /** Tick interpolation 0..1 between prevPos and pos. */
  alpha: number;
  sim: Sim | null;
  view: ViewName;
  /** The camera is below the original ground (fSubstrate < 0). */
  underground: boolean;
  camera: PerspectiveCamera;
  /** Drawing-buffer height in px (projected-size LOD). */
  viewportHeightPx: number;
  /** What the camera looks at (possessed / followed ant), mm; null when nothing. */
  subject: Vec3 | null;
  /** Possessed ant id, -1 none. */
  possessedId: number;
  /** Predicted pose of the possessed ant, null = use the interpolated tick pose. */
  possessedPose: PoseLike | null;
  /** Possessed-ant opacity from the camera fade (0..1). */
  subjectOpacity: number;
  /** Colony-view cutaway, null outside the colony view. */
  cutaway: CutawayParams | null;
  /** Possession camera fade and occlusion cutaway (GDD 01 6.5), null outside the possess view. */
  fade?: FadeOutput | null;
  /** Entity under the cursor / being inspected (highlights), null none. */
  hover?: HighlightRef | null;
  inspect?: HighlightRef | null;
  /** Accessibility: no moving light patterns or idle animation flourishes. */
  reducedMotion?: boolean;
  /** Accessibility: Settings > Accessibility > Flash reduction. Lightning uses the soft brightening instead of the pulse. */
  reducedFlash?: boolean;
  /** Accessibility: spider comfort (and the optional mite / centipede substitutes), Settings > Accessibility. */
  comfort?: ComfortSettings | null;
  /** Photo mode with 'Hide markers and outlines' on: the possessed ant draws without its possession rim (GDD 01 6.9). */
  hidePossessedHighlight?: boolean;
}

/** The comfort part of Settings > Accessibility (GDD 08 §12), as the creature renderer reads it. */
export interface ComfortSettings {
  spiderComfort: 'off' | 'softened' | 'abstract' | 'marker';
  comfortMites: boolean;
  comfortCentipedes: boolean;
}

export interface SubRenderer {
  readonly name: string;
  /** Set-up; a returned promise resolves when its assets (textures) are loaded. */
  init(ctx: RenderContext): void | Promise<void>;
  /** A game starts; a returned promise resolves when its world is fully built (the first frame shows it). */
  onGameStart?(sim: Sim): void | Promise<void>;
  update(frame: FrameInfo): void;
  onGameEnd?(): void;
  setQuality?(q: QualityPreset): void;
  /** Small numeric statistics for perf() and debugging. */
  stats?(): Record<string, number>;
  dispose(): void;
}

export type SubRendererFactory = () => SubRenderer;

const REAL_RENDERERS: Partial<Record<RendererSlot, SubRendererFactory>> = {};

/** Registers the real renderer of a slot (replaces the debug fallback). */
export function registerRenderer(slot: RendererSlot, factory: SubRendererFactory): void {
  REAL_RENDERERS[slot] = factory;
}

// --- registrations of real renderers (task int-1A) ---
registerRenderer('world', () => new WorldSlot());
registerRenderer('nest', () => new NestSlot());
registerRenderer('ants', () => new AntsSlot());
registerRenderer('fx', () => new FxSlot());
// --- Stage 2 (task wire-stage2) ---
registerRenderer('creatures', () => new CreaturesSlot());
registerRenderer('humans', () => new HumansSlot());
registerRenderer('weather', () => new WeatherSlot());

export interface RegistryEntry {
  slot: RendererSlot;
  renderer: SubRenderer;
  debug: boolean;
}

export interface RegistryOptions {
  /** Use the debug renderer in every slot (?render=debug). */
  forceDebug?: boolean;
}

/** Owns one renderer per slot and fans the lifecycle calls out in slot order. */
export class RenderRegistry {
  readonly entries: RegistryEntry[];

  constructor(opts: RegistryOptions = {}) {
    this.entries = RENDERER_SLOTS.map((slot) => {
      const real = opts.forceDebug ? undefined : REAL_RENDERERS[slot];
      return { slot, renderer: (real ?? DEBUG_RENDERERS[slot])(), debug: !real };
    });
  }

  /** Initialises every slot in order; resolves when all of them have loaded their assets. */
  init(ctx: RenderContext): Promise<void> {
    const peer = (slot: RendererSlot) => this.entries.find((e) => e.slot === slot)?.renderer ?? null;
    const pending = this.entries.map((e) => e.renderer.init({ ...ctx, peer }));
    return Promise.all(pending).then(() => undefined);
  }

  /** A game starts; resolves when every slot has built what it draws for it. */
  onGameStart(sim: Sim): Promise<void> {
    const pending = this.entries.map((e) => e.renderer.onGameStart?.(sim));
    return Promise.all(pending).then(() => undefined);
  }

  update(frame: FrameInfo): void {
    for (const e of this.entries) e.renderer.update(frame);
  }

  onGameEnd(): void {
    for (const e of this.entries) e.renderer.onGameEnd?.();
  }

  setQuality(q: QualityPreset): void {
    for (const e of this.entries) e.renderer.setQuality?.(q);
  }

  stats(): Record<string, Record<string, number>> {
    const out: Record<string, Record<string, number>> = {};
    for (const e of this.entries) out[e.slot] = e.renderer.stats?.() ?? {};
    return out;
  }

  /** Which slots run a debug renderer (summary / perf). */
  describe(): Record<RendererSlot, string> {
    const out = {} as Record<RendererSlot, string>;
    for (const e of this.entries) out[e.slot] = `${e.renderer.name}${e.debug ? ' (debug)' : ''}`;
    return out;
  }

  dispose(): void {
    for (const e of [...this.entries].reverse()) e.renderer.dispose();
  }
}
