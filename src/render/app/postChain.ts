// Post-processing chain with pmndrs postprocessing (tech-stack section 4): DoF + bloom + tone mapping + vignette in
// one EffectPass, SMAA in a second pass on tone-mapped colour. Effects are switched by rebuilding the passes (the
// library's own advice: BlendFunction.SKIP does not fully disable an effect). DoF focus is set every frame in mm.
import { HalfFloatType, type Camera, type Scene, type WebGLRenderer } from 'three';
import {
  BloomEffect, DepthOfFieldEffect, EffectComposer, EffectPass, RenderPass, SMAAEffect, SMAAPreset, ToneMappingEffect, ToneMappingMode,
  VignetteEffect, type Effect,
} from 'postprocessing';
import type { PostParams } from './quality';
import { GradeEffect, neutralGrade, type GradeParams } from './look';

/** DoF focus easing (GDD 08 11.1 LOOK_DOF_FOCUS: eased over 300 ms, instant in reduced motion). */
export const LOOK_DOF_EASE_S = 0.3 / 3; // time constant: ~95 % of the change within 300 ms

const SMAA_PRESETS = { low: SMAAPreset.LOW, medium: SMAAPreset.MEDIUM, high: SMAAPreset.HIGH, ultra: SMAAPreset.ULTRA } as const;

/** Photo-mode / reduced-motion hooks layered on top of the preset. */
export interface PostHooks {
  /** Multiplies the preset bokeh scale (photo aperture, 0 disables the blur look). */
  dofStrength: number;
  /** Overrides the preset bokeh scale outright when set (photo mode). */
  bokehOverride: number | null;
  vignetteOffset: number | null;
  vignetteDarkness: number | null;
}

export class PostChain {
  readonly composer: EffectComposer;
  private renderPass: RenderPass;
  private passes: EffectPass[] = [];
  private dof: DepthOfFieldEffect | null = null;
  private bloom: BloomEffect | null = null;
  private vignette: VignetteEffect | null = null;
  private smaa: SMAAEffect | null = null;
  /** Colour grade (render-integration): rebuilt with the passes, always present, values kept across rebuilds. */
  private grade: GradeEffect | null = null;
  private readonly gradeValues: GradeParams = neutralGrade();
  private params: PostParams;
  private camera: Camera;
  private smaaReady: Promise<void> = Promise.resolve();
  readonly hooks: PostHooks = { dofStrength: 1, bokehOverride: null, vignetteOffset: null, vignetteDarkness: null };
  private focus = { distance: 100, range: 60 };
  /** Focus actually applied: eased towards `focus` over LOOK_DOF_EASE_S (instant in reduced motion, GDD 08 11.1). */
  private applied = { distance: -1, range: -1 };
  reducedMotion = false;
  private lastNear = -1;
  private lastFar = -1;

  constructor(renderer: WebGLRenderer, scene: Scene, camera: Camera, params: PostParams) {
    this.camera = camera;
    this.params = clone(params);
    this.composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType, multisampling: 0 });
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    this.build();
  }

  /** Resolves when SMAA's lookup images are loaded (wait before the first screenshot). */
  get ready(): Promise<void> {
    return this.smaaReady;
  }

  private build(): void {
    for (const p of this.passes) { this.composer.removePass(p); p.dispose(); } // EffectPass.dispose disposes its effects
    this.passes = [];
    this.dof = this.bloom = this.vignette = this.smaa = null;
    this.lastNear = this.lastFar = -1;
    const P = this.params;
    const main: Effect[] = [];
    if (P.dof.enabled && P.dof.bokehScale > 0) {
      this.dof = new DepthOfFieldEffect(this.camera, {
        focusDistance: this.focus.distance, focusRange: this.focus.range, bokehScale: P.dof.bokehScale, resolutionScale: P.dof.resolutionScale,
      });
      main.push(this.dof);
    }
    if (P.bloom.enabled) {
      this.bloom = new BloomEffect({
        intensity: P.bloom.intensity, luminanceThreshold: P.bloom.threshold, luminanceSmoothing: P.bloom.smoothing, mipmapBlur: true,
        radius: P.bloom.radius, levels: P.bloom.levels,
      });
      main.push(this.bloom);
    }
    this.grade = new GradeEffect(this.gradeValues); // linear HDR, before tone mapping (as on the no-post path)
    main.push(this.grade);
    main.push(new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }));
    if (P.vignette.enabled) {
      this.vignette = new VignetteEffect({ offset: P.vignette.offset, darkness: P.vignette.darkness });
      main.push(this.vignette);
    }
    this.passes.push(new EffectPass(this.camera, ...main));
    if (P.smaa.enabled) {
      const smaa = new SMAAEffect({ preset: SMAA_PRESETS[P.smaa.preset] });
      this.smaa = smaa;
      // typing quirk (tech-stack 7): the 'load' event exists at runtime but is not in the typings
      this.smaaReady = new Promise((resolve) => {
        (smaa as unknown as { addEventListener(t: string, f: () => void): void }).addEventListener('load', () => resolve());
        setTimeout(resolve, 3000); // never block forever if the images fail to decode
      });
      this.passes.push(new EffectPass(this.camera, smaa));
    } else {
      this.smaaReady = Promise.resolve();
    }
    for (const p of this.passes) this.composer.addPass(p);
    this.applyHooks();
  }

  /** Apply new parameters; rebuilds only when an effect is switched on or off or a construction-time value changes. */
  setParams(next: PostParams): void {
    const a = this.params, b = next;
    const rebuild = a.dof.enabled !== b.dof.enabled || a.bloom.enabled !== b.bloom.enabled || a.vignette.enabled !== b.vignette.enabled
      || a.smaa.enabled !== b.smaa.enabled || a.smaa.preset !== b.smaa.preset || a.dof.resolutionScale !== b.dof.resolutionScale
      || a.bloom.levels !== b.bloom.levels || (a.dof.bokehScale > 0) !== (b.dof.bokehScale > 0);
    this.params = clone(next);
    if (rebuild) { this.build(); return; }
    if (this.bloom) {
      this.bloom.intensity = b.bloom.intensity;
      this.bloom.luminanceMaterial.threshold = b.bloom.threshold;
      this.bloom.luminanceMaterial.smoothing = b.bloom.smoothing;
    }
    this.applyHooks();
  }

  get current(): PostParams {
    return this.params;
  }

  private applyHooks(): void {
    if (this.dof) this.dof.bokehScale = (this.hooks.bokehOverride ?? this.params.dof.bokehScale) * this.hooks.dofStrength;
    if (this.vignette) {
      this.vignette.offset = this.hooks.vignetteOffset ?? this.params.vignette.offset;
      this.vignette.darkness = this.hooks.vignetteDarkness ?? this.params.vignette.darkness;
    }
  }

  setHooks(h: Partial<PostHooks>): void {
    Object.assign(this.hooks, h);
    this.applyHooks();
  }

  /** Colour grade from the world lighting (render-integration, src/render/app/look). */
  setGrade(g: GradeParams): void {
    this.gradeValues.saturation = g.saturation;
    this.gradeValues.gain[0] = g.gain[0]; this.gradeValues.gain[1] = g.gain[1]; this.gradeValues.gain[2] = g.gain[2];
    this.grade?.set(this.gradeValues);
  }

  /** Focus distance in mm (world units); range defaults to rangeK x distance (LOOK_DOF_RANGE). */
  setFocus(distanceMm: number, rangeMm = distanceMm * this.params.dof.rangeK, instant = false): void {
    this.focus.distance = distanceMm;
    this.focus.range = rangeMm;
    if (instant || this.reducedMotion || this.applied.distance < 0) { this.applied.distance = distanceMm; this.applied.range = rangeMm; this.pushFocus(); }
  }

  private pushFocus(): void {
    if (!this.dof) return;
    this.dof.cocMaterial.focusDistance = this.applied.distance;
    this.dof.cocMaterial.focusRange = this.applied.range;
  }

  private easeFocus(dt: number): void {
    // ease in log space: focus moves between millimetres and metres
    const k = this.reducedMotion ? 1 : 1 - Math.exp(-Math.max(0, dt) / LOOK_DOF_EASE_S);
    const ease = (a: number, b: number) => (a <= 0 || b <= 0 ? b : Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * k));
    this.applied.distance = ease(this.applied.distance, this.focus.distance);
    this.applied.range = ease(this.applied.range, this.focus.range);
    this.pushFocus();
  }

  setView(scene: Scene, camera: Camera): void {
    this.camera = camera;
    this.composer.setMainScene(scene);
    this.composer.setMainCamera(camera);
  }

  setSize(w: number, h: number): void {
    this.composer.setSize(w, h, false);
  }

  render(dtSeconds: number): void {
    // The CoC material copies near/far by value; rigs change the near plane every frame (GDD 01 6.1).
    const cam = this.camera as Camera & { near?: number; far?: number };
    if (this.dof && (cam.near !== this.lastNear || cam.far !== this.lastFar)) {
      this.dof.cocMaterial.adoptCameraSettings(this.camera); // typed name; copyCameraSettings at runtime
      this.lastNear = cam.near ?? 0;
      this.lastFar = cam.far ?? 0;
    }
    this.easeFocus(dtSeconds);
    this.composer.render(dtSeconds);
  }

  /** Frees the composer's targets and every pass and effect (EffectComposer.dispose disposes its passes). */
  dispose(): void {
    this.passes = [];
    this.composer.dispose();
  }
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
