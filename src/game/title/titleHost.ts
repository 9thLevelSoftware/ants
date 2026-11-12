// The live scene behind the title menu (GDD 08 §3.3), run by the Game while it is at the title screen with no game:
// the vignette's sim is handed to the renderers like a game's (registry.onGameStart), never ticked, and drawn from a
// slowly drifting camera. Replaced cleanly by a new game (the renderers' onGameStart supersedes it; leave() drops
// it), rebuilt when the game returns to the title. Deterministic in test mode: the drift clock stays at 0.
//
// Still frame instead of the drift (GDD 08 §3.3) at the `test` / `low` presets or with reduced motion: the frame is
// rendered on demand for a short settling period (decor streams in) and then not again until something changes.
import type { PerspectiveCamera } from 'three';
import type { FrameInfo, RenderRegistry } from '@/render';
import type { RenderApp } from '@/render/app';
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
    this.built = false;
    this.t = 0;
    this.stillFrames = 0;
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
    const app = this.deps.app();
    if (app && !this.deps.testMode) app.setOnDemand(null);
  }

  private still(): boolean {
    const q = this.deps.app()?.quality.id;
    return this.deps.testMode || q === 'test' || q === 'low' || this.deps.reducedMotion();
  }

  /** One title frame: camera, renderers. Returns the frame (null when the backdrop is not ready). */
  frame(dt: number): FrameInfo | null {
    const reg = this.deps.registry(), app = this.deps.app(), sim = this.sim;
    if (!reg || !app || !sim || !this.built) return null;
    const still = this.still();
    if (!still) this.t += Math.max(0, Math.min(0.25, dt));
    const subject = titleSubject(sim);
    titlePose(subject, (x, z) => sim.field.height(x, z), sim.world.bu, still ? 0 : this.t, this.pose);
    const c = this.deps.canvas;
    applyPose(this.deps.camera, this.pose, c.clientWidth / Math.max(1, c.clientHeight));
    const d = Math.hypot(this.pose.pos.x - subject.x, this.pose.pos.y - subject.y, this.pose.pos.z - subject.z);
    app.setFocus(d, undefined, still || dt === 0);
    const frame: FrameInfo = {
      dt, time: this.deps.testMode ? 0 : this.t, alpha: 1, sim, view: 'observer', underground: false, camera: this.deps.camera,
      viewportHeightPx: app.renderer.domElement.height, subject, possessedId: -1, possessedPose: null, subjectOpacity: 1, cutaway: null,
      fade: null, hover: null, inspect: null, reducedMotion: this.deps.reducedMotion(),
    };
    reg.update(frame);
    if (!this.deps.testMode) {
      // drifting: draw every display frame; still: draw while the decor settles, then only on demand
      app.setOnDemand(still ? true : null);
      if (!still || this.stillFrames++ < TITLE_STILL_SETTLE_FRAMES) app.requestRender();
    }
    return frame;
  }
}
