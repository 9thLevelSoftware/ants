// The render application layer: WebGL2 renderer, colour management / tone mapping per path (tech-stack 4 and 7),
// shadows, resize with a device-pixel-ratio cap, dynamic resolution, the post chain, frame statistics,
// render-on-demand for test quality, context loss handling and a dispose() that frees everything.
import {
  ACESFilmicToneMapping, BasicShadowMap, NoToneMapping, PCFShadowMap, PerspectiveCamera, Scene, SRGBColorSpace, VSMShadowMap, WebGLRenderer,
  type Camera,
} from 'three';
import { DynamicResolution, dynResConfig } from './dynamicResolution';
import { FrameStats, type FrameStatsSnapshot } from './frameStats';
import { PostChain } from './postChain';
import { type QualityPreset } from './quality';
import { markMaterialsDirty } from './disposeObject';
import { DirectGrade, type GradeParams } from './look';

export interface RenderAppOptions {
  quality: QualityPreset;
  scene?: Scene;
  camera?: PerspectiveCamera;
  /** Logarithmic depth for very large near/far ratios. Off by default: the depth-based DoF is untested with it. */
  logarithmicDepth?: boolean;
  /** Keep the drawing buffer for toDataURL outside the frame (photo capture can also render-then-read). */
  preserveDrawingBuffer?: boolean;
  onContextLost?: () => void;
  onContextRestored?: () => void;
  /** Device pixel ratio source (tests / harness). */
  devicePixelRatio?: () => number;
}

export type FrameCallback = (dtSeconds: number, nowMs: number) => void;

export interface RenderApp {
  readonly renderer: WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  scene: Scene;
  camera: PerspectiveCamera;
  readonly quality: QualityPreset;
  readonly post: PostChain | null;
  readonly stats: FrameStats;
  readonly dynres: DynamicResolution;
  /** A setting changed that only a new renderer can honour. Always false now (MSAA moved into the grade target). */
  readonly needsRecreate: boolean;
  readonly contextLost: boolean;
  /** Resolves after the first rendered frame (and SMAA lookup images when SMAA is on). */
  readonly ready: Promise<void>;
  setQuality(q: QualityPreset): void;
  setView(scene: Scene, camera: PerspectiveCamera): void;
  /** Depth-of-field focus in mm (call every frame); range defaults to the preset's rangeK x distance. */
  setFocus(distanceMm: number, rangeMm?: number, instant?: boolean): void;
  /** Reduced motion: DoF focus changes become instant. */
  setReducedMotion(on: boolean): void;
  setExposure(ev: number): void;
  /** Colour grade (saturation, linear gain) from the world lighting: post effect or the no-post grading pass. */
  setGrade(g: GradeParams): void;
  requestRender(): void;
  /** Force render-on-demand on or off (paused game, frozen screenshots); null = the preset decides. */
  setOnDemand(on: boolean | null): void;
  /** Called right after every rendered frame, in the same task (the canvas can still be read then). null removes it. */
  setAfterRender(cb: (() => void) | null): void;
  /** Render one frame now (synchronously). Returns false when the context is lost. */
  renderFrame(dtSeconds?: number): boolean;
  /** Start the animation loop: onFrame every display frame; renders when needed (always unless on demand). */
  start(onFrame: FrameCallback): void;
  stop(): void;
  resize(): void;
  frameStats(): FrameStatsSnapshot;
  dispose(): void;
}

const SHADOW_TYPES = { basic: BasicShadowMap, pcf: PCFShadowMap, vsm: VSMShadowMap } as const;

export function createRenderApp(canvas: HTMLCanvasElement, options: RenderAppOptions): RenderApp {
  let quality = options.quality;
  // No MSAA on the default framebuffer, ever: the post chain uses SMAA, and the no-post path renders into the colour
  // grade's target, which carries the preset's MSAA samples (render-integration; look/directGrade.ts).
  const renderer = new WebGLRenderer({
    canvas, antialias: false, stencil: false, powerPreference: 'high-performance', logarithmicDepthBuffer: !!options.logarithmicDepth,
    preserveDrawingBuffer: !!options.preserveDrawingBuffer,
  });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.info.autoReset = false; // reset once per frame so the counts include every pass
  let scene = options.scene ?? new Scene();
  let camera = options.camera ?? new PerspectiveCamera(60, 1, 0.1, 1000);
  let post: PostChain | null = null;
  const direct = new DirectGrade(); // no-post path: scene target (MSAA per preset) + colour grade + tone mapping
  const stats = new FrameStats();
  const dynres = new DynamicResolution(dynResConfig(quality.dynamicResolution.targetFps, quality.dynamicResolution.minScale, quality.dynamicResolution.maxScale));
  const needsRecreate = false; // MSAA lives in the grade target: no quality change needs a new context
  let lost = false;
  let dirty = true;
  let loop: FrameCallback | null = null;
  let lastNow = -1;
  let exposureEV = 0;
  let onDemandOverride: boolean | null = null;
  let reducedMotion = false;
  const onDemand = () => onDemandOverride ?? quality.renderOnDemand;
  let firstFrame: () => void = () => {};
  const firstFramePromise = new Promise<void>((r) => { firstFrame = r; });
  let readyPromise: Promise<void> = firstFramePromise;
  let sizeKey = '';
  const dpr = options.devicePixelRatio ?? (() => (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1));

  function applyRendererQuality(prev: QualityPreset | null): void {
    renderer.toneMapping = quality.post.enabled ? NoToneMapping : ACESFilmicToneMapping; // never both (tech-stack 7)
    renderer.toneMappingExposure = Math.pow(2, exposureEV);
    const shadowChanged = !prev || prev.shadows.enabled !== quality.shadows.enabled || prev.shadows.type !== quality.shadows.type;
    renderer.shadowMap.enabled = quality.shadows.enabled;
    renderer.shadowMap.type = SHADOW_TYPES[quality.shadows.type];
    renderer.shadowMap.needsUpdate = true;
    if (shadowChanged && prev) markMaterialsDirty(scene); // shadow defines are compiled into programs
    if (quality.post.enabled) {
      if (!post) { post = new PostChain(renderer, scene, camera, quality.post); post.reducedMotion = reducedMotion; post.setGrade(direct.grade); }
      else post.setParams(quality.post);
      readyPromise = Promise.all([firstFramePromise, post.ready]).then(() => undefined);
    } else if (post) {
      post.dispose();
      post = null;
      renderer.autoClear = true; // the EffectComposer switched it off; the direct path needs cleared targets
    }
    direct.setMsaa(!quality.post.enabled && quality.msaa);
    if (quality.post.enabled) direct.releaseTarget(); // the post chain grades; free the direct path's target
    const d = quality.dynamicResolution;
    dynres.cfg = dynResConfig(d.targetFps, d.minScale, d.maxScale);
    dynres.reset(d.enabled ? Math.min(dynres.scale, d.maxScale) : 1);
    sizeKey = '';
  }

  // Last CSS size the canvas was laid out at. A canvas with no layout size (display:none, detached, zero-size
  // frame) keeps it: falling back to canvas.width would read back the size set on the previous frame and compound
  // it by pixel ratio x scale every frame.
  let cssW = 0, cssH = 0;
  function updateCssSize(): void {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w > 0 && h > 0) { cssW = w; cssH = h; }
    else if (cssW === 0) { cssW = Math.max(1, canvas.width); cssH = Math.max(1, canvas.height); } // never laid out yet
  }

  function resize(): void {
    updateCssSize();
    const ratio = Math.min(dpr(), quality.maxPixelRatio);
    const scale = quality.resolutionScale * (quality.dynamicResolution.enabled ? dynres.scale : 1);
    const w = Math.max(1, Math.round(cssW * ratio * scale)), h = Math.max(1, Math.round(cssH * ratio * scale));
    const key = `${w}x${h}@${cssW}x${cssH}`;
    if (key === sizeKey) return;
    sizeKey = key;
    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false); // CSS size stays whatever the page says (100%)
    post?.setSize(w, h);
    camera.aspect = cssW / cssH;
    camera.updateProjectionMatrix();
    stats.width = w; stats.height = h;
    stats.resolutionScale = scale;
    dirty = true;
  }

  let afterRender: (() => void) | null = null;
  function renderFrame(dt = 1 / 60): boolean {
    if (lost) return false;
    resize();
    const t0 = performance.now();
    renderer.info.reset();
    if (post) post.render(dt);
    else direct.render(renderer, scene, camera);
    stats.record(t0, performance.now() - t0, renderer.info.render);
    dirty = false;
    if (stats.frames === 1) firstFrame();
    afterRender?.();
    return true;
  }

  function tick(now: number): void {
    const dt = lastNow < 0 ? 1 / 60 : Math.min(0.25, (now - lastNow) / 1000);
    lastNow = now;
    loop?.(dt, now);
    if (lost) return;
    if (onDemand() && !dirty) return;
    renderFrame(dt);
    if (quality.dynamicResolution.enabled && !onDemand()) {
      const before = dynres.scale;
      dynres.update(stats.lastIntervalMs);
      if (dynres.scale !== before) resize();
    }
  }

  const onLost = () => {
    lost = true;
    stats.resetTiming();
    options.onContextLost?.();
  };
  const onRestored = () => {
    // three re-initialises its GL state itself and re-uploads geometry/textures lazily from retained sources; the
    // composer's render targets and effect programs are rebuilt from scratch to be safe.
    lost = false;
    if (post) { post.dispose(); post = new PostChain(renderer, scene, camera, quality.post); post.reducedMotion = reducedMotion; post.setGrade(direct.grade); }
    direct.releaseTarget();
    markMaterialsDirty(scene);
    renderer.shadowMap.needsUpdate = true;
    sizeKey = '';
    dirty = true;
    stats.resetTiming();
    options.onContextRestored?.();
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { sizeKey = ''; dirty = true; }) : null;
  ro?.observe(canvas);

  applyRendererQuality(null);
  resize();

  const app: RenderApp = {
    renderer,
    canvas,
    get scene() { return scene; },
    set scene(s: Scene) { app.setView(s, camera); },
    get camera() { return camera; },
    set camera(c: PerspectiveCamera) { app.setView(scene, c); },
    get quality() { return quality; },
    get post() { return post; },
    stats,
    dynres,
    get needsRecreate() { return needsRecreate; },
    get contextLost() { return lost; },
    get ready() { return readyPromise; },
    setQuality(q) {
      const prev = quality;
      quality = q;
      applyRendererQuality(prev);
      resize();
      dirty = true;
    },
    setView(s, c) {
      scene = s;
      camera = c;
      post?.setView(s, c as Camera);
      sizeKey = '';
      dirty = true;
    },
    setFocus(d, r, instant) { post?.setFocus(d, r, instant); },
    setReducedMotion(on) { reducedMotion = on; if (post) post.reducedMotion = on; },
    setExposure(ev) { exposureEV = ev; renderer.toneMappingExposure = Math.pow(2, ev); dirty = true; },
    setGrade(g) { direct.set(g); post?.setGrade(g); },
    requestRender() { dirty = true; },
    setOnDemand(on) { onDemandOverride = on; dirty = true; },
    renderFrame,
    setAfterRender(cb) { afterRender = cb; },
    start(onFrame) { loop = onFrame; lastNow = -1; renderer.setAnimationLoop(tick); },
    stop() { renderer.setAnimationLoop(null); loop = null; },
    resize,
    frameStats: () => stats.snapshot(),
    dispose() {
      renderer.setAnimationLoop(null);
      loop = null;
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      ro?.disconnect();
      post?.dispose();
      post = null;
      direct.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
  return app;
}
