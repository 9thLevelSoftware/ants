// Inputs of the world renderer. Structurally compatible with the render registry's RenderContext / FrameInfo
// (contracts guidance 8): a FrameInfo can be passed to WorldRenderer.update as is; `subject` and `env` are extras.
import type { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import type { QualityPreset } from '@/render/app';
import type { AssetLoader } from '@/render/assets';
import type { Sim, WeatherState } from '@/sim/types';

export interface WorldRenderContext {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  quality: QualityPreset;
  /** The one asset loader (architecture 8); null = procedural textures only (tests). */
  assets: AssetLoader | null;
  /** Exposure hook (RenderApp.setExposure). Default: renderer.toneMappingExposure = 2^ev. */
  setExposure?: (ev: number) => void;
}

export interface Vec3Like { x: number; y: number; z: number }

/** Environment values that override the simulation (demo URL flags, photo mode, tests). */
export interface EnvOverride {
  /** Hour of day 0..24. */
  hour?: number;
  /** Year fraction 0..1 (day length); default early summer. */
  yearFrac?: number;
  weather?: WeatherState;
  cloud?: number;
  moonIllum?: number;
  fog?: number;
}

export interface WorldFrame {
  /** Real seconds since the last frame. */
  dt: number;
  /** Animation clock, seconds (frozen for deterministic screenshots). */
  time: number;
  sim?: Sim | null;
  /** The camera is inside the nest: the surface world dims away (eased). */
  underground?: boolean;
  /** What the camera looks at (possessed ant / followed entity), mm; centres the sun shadow. */
  subject?: Vec3Like | null;
  env?: EnvOverride | null;
  /** Accessibility setting: no moving light patterns (the forest dapple stands still). */
  reducedMotion?: boolean;
}
