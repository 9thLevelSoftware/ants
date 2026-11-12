// The live scene behind the title menu (GDD 08 §3.3), run by the Game while it is at the title screen with no game:
// the vignette's sim is handed to the renderers like a game's (registry.onGameStart), never ticked, and drawn from a
// slowly drifting camera. Replaced cleanly by a new game (the renderers' onGameStart supersedes it; leave() drops
// it), rebuilt when the game returns to the title. Deterministic in test mode: the drift clock stays at 0.
//
// Still frame instead of the drift (GDD 08 §3.3) when the player's preset is `test` / `low` or with reduced motion:
// the renderers are updated and the frame drawn for a short settling period (decor streams in), then neither again
// until the preset, the canvas size or reduced motion changes.
//
// Low quality cap (GDD 08 §3.3): while the title is entered the Game renders at most at the Low preset
// (setQualityCap; titleQualityCap below) and returns to the player's preset when a game starts.
import type { PerspectiveCamera } from 'three';
import type { FrameInfo, RenderRegistry } from '@/render';
import type { QualityId, RenderApp } from '@/render/app';
import { applyPose, makePose } from '@/render/camera';
import type { Sim } from '@/sim/types';
import { titlePose } from './titleCamera';
import { makeTitleSim, titleSubject } from './titleWorld';

/** Frames rendered after entering a still title so streamed decor and textures settle, then it stops. */
export const TITLE_STILL_SETTLE_FRAMES = 90;

/** What the host needs from the Game. */
export interface TitleHostDeps {
  registry: () => RenderRegistry | undefined;
  app: () => RenderApp | undefined;
  camera: PerspectiveCamera;
  canvas: HTMLCanvasElement;
  testMode: boolean;
  reducedMotion: () => boolean;
  /** The player's own preset (before the title's cap); defaults to the app's current preset. */
  playerQuality?: () => QualityId;
  /** Turns the title's Low quality cap on (entering) or off (leaving). */
  setQualityCap?: (on: boolean) => void;
}

/** The preset the title backdrop renders at for a player's preset: at most Low (GDD 08 §3.3); `test` stays `test`. */
export function titleQualityCap(id: QualityId): QualityId {
  return id === 'test' ? 'test' : 'low';
}

/** False with ?autostart=1 (the game starts at once) or ?title=0 (no backdrop, e.g. for quick scripted checks). */
export function titleSceneWanted(search: string): boolean {
  const q = new URLSearchParams(search);
  return q.get('autostart') !== '1' && q.get('title') !== '0';
}

export class TitleHost {
  private sim: Sim | null = null;
  private built = false;
  private token = 0;
  private t = 0;
  private stillFrames = 0;
  /** What a settled still frame depends on (preset, canvas size, reduced motion): a change settles it again. */
  private settleKey = '';
  private lastFrame: FrameInfo | null = null;
  /** enter() was called since the last leave() (also when that build failed): ensure() does not retry it. */
  private entered = false;
  private readonly pose = makePose();
  /** Resolves when the last enter() finished building (or was superseded). */
  ready: Promise<boolean> = Promise.resolve(false);

  constructor(private readonly deps: TitleHostDeps) {}

  /** The backdrop is built and drawn. */
  get active(): boolean {
    return this.built && this.sim !== null;
  }

  /** Builds the vignette and hands it to the renderers. Resolves false when a newer enter / leave took over. */
  enter(): Promise<boolean> {
    const reg = this.deps.registry();
    if (!reg) return Promise.resolve(false);
    const token = ++this.token;
    this.entered = true;
    this.built = false;
    this.t = 0;
    this.stillFrames = 0;
    this.lastFrame = null;
    this.deps.setQualityCap?.(true); // before the build, so the vignette is built at the capped preset
    // a failed backdrop must never take the title (or a new game) down with it: logged, and the title stays empty
    const fail = (e: unknown) => { console.error('[title] backdrop failed', e); if (token === this.token) this.sim = null; return false; };
    try {
      const sim = makeTitleSim();
      this.sim = sim;
      this.ready = reg.onGameStart(sim).then(() => {
        if (token !== this.token) return false;
        this.built = true;
        this.deps.app()?.requestRender();
        return true;
      }, fail);
    } catch (e) {
      this.ready = Promise.resolve(fail(e));
    }
    return this.ready;
  }

  /** A game starts (or the Game is disposed): forget the vignette; the renderers are re-targeted by the caller. */
  leave(): void {
    this.token++;
    this.sim = null;
    this.built = false;
    this.entered = false;
    this.lastFrame = null;
    const app = this.deps.app();
    if (app && !this.deps.testMode) app.setOnDemand(null);
    this.deps.setQualityCap?.(false);
  }

  /**
   * The Game is at the title with no game: builds the backdrop if nothing has since the last leave() (e.g. a load
   * from the title failed after the old game was ended). Returns whether it started a build.
   */
  ensure(): boolean {
    if (this.entered) return false;
    void this.enter();
    return true;
  }

  private still(): boolean {
    const q = this.deps.playerQuality?.() ?? this.deps.app()?.quality.id;
    return this.deps.testMode || q === 'test' || q === 'low' || this.deps.reducedMotion();
  }

  /** One title frame: camera, renderers. Returns the frame (null when the backdrop is not ready). */
  frame(dt: number): FrameInfo | null {
    const reg = this.deps.registry(), app = this.deps.app(), sim = this.sim;
    if (!reg || !app || !sim || !this.built) return null;
    const still = this.still();
    const c = this.deps.canvas;
    const key = `${app.quality.id}|${c.clientWidth}x${c.clientHeight}|${still}`;
    if (key !== this.settleKey) { this.settleKey = key; this.stillFrames = 0; }
    // a settled still frame: nothing moves, so neither the renderers nor the screen need anything
    if (still && !this.deps.testMode && this.stillFrames >= TITLE_STILL_SETTLE_FRAMES && this.lastFrame) return this.lastFrame;
    if (!still) this.t += Math.max(0, Math.min(0.25, dt));
    // a still frame has no time: eased looks (grade, exposure) settle at once instead of freezing half-way
    const fdt = still ? 0 : dt;
    const subject = titleSubject(sim);
    titlePose(subject, (x, z) => sim.field.height(x, z), sim.world.bu, still ? 0 : this.t, this.pose);
    applyPose(this.deps.camera, this.pose, c.clientWidth / Math.max(1, c.clientHeight));
    const d = Math.hypot(this.pose.pos.x - subject.x, this.pose.pos.y - subject.y, this.pose.pos.z - subject.z);
    app.setFocus(d, undefined, still || dt === 0);
    const frame: FrameInfo = {
      dt: fdt, time: this.deps.testMode ? 0 : this.t, alpha: 1, sim, view: 'observer', underground: false, camera: this.deps.camera,
      viewportHeightPx: app.renderer.domElement.height, subject, possessedId: -1, possessedPose: null, subjectOpacity: 1, cutaway: null,
      fade: null, hover: null, inspect: null, reducedMotion: this.deps.reducedMotion(),
    };
    reg.update(frame);
    if (!this.deps.testMode) {
      // drifting: draw every display frame; still: draw while the decor settles, then only on demand
      app.setOnDemand(still ? true : null);
      if (!still || this.stillFrames++ < TITLE_STILL_SETTLE_FRAMES) app.requestRender();
    }
    this.lastFrame = frame;
    return frame;
  }
}
