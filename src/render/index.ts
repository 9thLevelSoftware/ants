// Sub-renderer registry (contracts guidance §8, architecture §4/§6). Slots are drawn in a fixed order; each slot
// uses its registered real renderer, or the matching debug renderer from src/render/debug when none is
// registered (or when debug rendering is forced). Real renderers are added with registerRenderer() below: this
// list is the only registration point (composition roots change only by adding registrations).
import type { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import type { Vec3 } from '@/core';
import type { Sim } from '@/sim/types';
import type { QualityPreset } from '@/render/app';
import type { AssetLoader } from '@/render/assets';
import type { CutawayParams } from '@/render/camera';
import { DEBUG_RENDERERS } from './debug';

export type RendererSlot = 'world' | 'nest' | 'ants' | 'creatures' | 'fx';
/** Update and init order. `world` first: it owns the lights, sky and fog. */
export const RENDERER_SLOTS: readonly RendererSlot[] = ['world', 'nest', 'ants', 'creatures', 'fx'];

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
}

export interface SubRenderer {
  readonly name: string;
  init(ctx: RenderContext): void;
  onGameStart?(sim: Sim): void;
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

// --- registrations of real renderers (task int-1A wires world, nest and ants here) ---

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

  init(ctx: RenderContext): void {
    for (const e of this.entries) e.renderer.init(ctx);
  }

  onGameStart(sim: Sim): void {
    for (const e of this.entries) e.renderer.onGameStart?.(sim);
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
