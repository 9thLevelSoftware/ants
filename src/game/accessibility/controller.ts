// Applies Settings > Accessibility to the systems that honour it (GDD 08 7.4, 12): reduced motion (resolved from the
// device when set to System) into the camera rigs and the render app, the footstep-tremor scale ("camera shake and
// sway"), the depth-of-field strength, the status-colour palette. UI scale, text size, font and contrast are applied to
// the document by the UI shell (src/ui/styles); spider comfort and the overlay palette reach the renderers through
// stage2Wiring. Pure parts are in motion.ts; this file is the glue with the Game.
import { planTransition } from '@/render/camera';
import type { CameraPose } from '@/render/camera';
import type { Game } from '../Game';
import type { ViewId } from '../time/speedRules';
import { applyPalette } from './palette';
import { motionPlan, resolveReducedMotion, type MotionPlan } from './motion';

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

/** Two poses 100 mm apart: what a view switch would blend between (for reporting the transition the rig would plan). */
const pose = (x: number): CameraPose => ({ pos: { x, y: 0, z: 0 }, look: { x, y: 0, z: 1 }, up: { x: 0, y: 1, z: 0 }, fov: 60, near: 0.1, far: 1000 });

export class Accessibility {
  private mq: MediaQueryList | null = null;
  private offs: (() => void)[] = [];
  plan: MotionPlan = motionPlan(false, 100);

  constructor(private readonly game: Game, private readonly win: Window | undefined = typeof window === 'undefined' ? undefined : window) {}

  /** Starts following the settings and the device. Call once the renderer exists (Game.boot). */
  attach(): void {
    this.mq = this.win?.matchMedia?.(REDUCED_QUERY) ?? null;
    const onDevice = () => this.apply();
    this.mq?.addEventListener?.('change', onDevice);
    this.offs.push(() => this.mq?.removeEventListener?.('change', onDevice));
    this.offs.push(this.game.settings.subscribe((_s, changed) => {
      if (changed.some((p) => p.startsWith('accessibility') || p === 'camera.reducedMotion')) this.apply();
    }));
    this.apply();
  }

  /** Reads the settings and pushes them everywhere. Idempotent. */
  apply(): void {
    const s = this.game.settings.get();
    const a = s.accessibility;
    const reduced = resolveReducedMotion(a.reducedMotion, this.mq?.matches ?? false);
    this.plan = motionPlan(reduced, a.shake);
    // the camera rigs and the title read the resolved flag from the camera settings
    if (s.camera.reducedMotion !== reduced) this.game.setSettings({ camera: { reducedMotion: reduced } });
    this.game.app?.setReducedMotion(reduced);
    if (this.win) applyPalette(this.win.document, a.overlayPalette);
    this.frame(this.game.view);
    this.game.requestRender();
  }

  /**
   * Per frame, cheap: the tremor scale on the camera director, and the depth-of-field strength on the post chain. Photo
   * mode owns the post chain's DoF while it is open (it sets the strength itself), so it is left alone there.
   */
  frame(view: ViewId): void {
    const views = this.game.session?.views;
    if (views) views.tremorScale = this.plan.shakeScale;
    const post = this.game.app?.post;
    if (post && view !== 'photo' && post.hooks.dofStrength !== this.plan.dofStrength) post.setHooks({ dofStrength: this.plan.dofStrength });
  }

  /** What is in effect right now, read from the systems themselves (the debug API `__game.a11y.state()`). */
  state() {
    const g = this.game;
    const s = g.settings.get();
    const a = s.accessibility;
    const views = g.session?.views;
    const bu = g.sim?.world.bu ?? 1;
    const tr = planTransition(pose(0), pose(100 * bu), bu, !!views?.third.opts.reducedMotion || s.camera.reducedMotion);
    const post = g.app?.post ?? null;
    const doc = this.win?.document;
    return {
      reducedMotion: { choice: a.reducedMotion, systemPrefersReduced: this.mq?.matches ?? false, effective: this.plan.reduced, cameraSetting: s.camera.reducedMotion, rigFlag: views ? !!views.third.opts.reducedMotion : null },
      camera: {
        shakePercent: a.shake,
        shakeScale: views ? views.tremorScale : this.plan.shakeScale,
        /** Peak footstep-tremor amplitude the possession camera would apply, mm. */
        shakeAmplitudeMm: views ? views.tremorAmplitudeMm() : 0,
        /** The rigs implement no sway or bob (GDD 01 6.1: the only camera shake is footstep tremor); always zero. */
        swayAmplitudeMm: 0,
        /** The camera transition a view switch would use now. */
        transition: tr,
      },
      dof: { strength: post ? post.hooks.dofStrength : null, target: this.plan.dofStrength, postChainActive: !!post },
      ui: {
        motionAttr: doc?.documentElement.dataset.motion ?? null,
        paletteAttr: doc?.documentElement.dataset.palette ?? null,
        scaleRootPx: doc ? parseFloat(doc.documentElement.style.fontSize) || null : null,
        layout: doc?.documentElement.dataset.layout ?? null,
      },
      comfort: { spiderComfort: a.spiderComfort, mites: a.comfortMites, centipedes: a.comfortCentipedes },
      overlayPalette: a.overlayPalette,
      hold: { holdMs: s.controls.holdMs ?? 600, scale: g.input.holdScale, orbitToggle: !!s.controls.orbitToggle, toggles: { ...s.bindings.holdToggle } },
    };
  }

  dispose(): void {
    this.offs.forEach((f) => f());
    this.offs = [];
  }
}
