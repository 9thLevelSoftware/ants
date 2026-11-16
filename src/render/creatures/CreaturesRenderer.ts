/**
 * The registry slot renderer for `creatures` (src/render/index.ts RendererSlot): a `SubRenderer` around
 * CreatureRenderer. The sim is its source (a Sim satisfies CreatureSimSource structurally, checked by
 * `creatureSource`). Comfort mode comes from the frame (`comfort`: the settings store's `accessibility` section,
 * when the game passes it) or from setComfort(); it never touches the settings store itself.
 */
import type { FrameInfo, RenderContext, SubRenderer } from '@/render';
import type { QualityPreset } from '@/render/app';
import type { Sim } from '@/sim/types';
import { CreatureRenderer, type CreatureFrameInfo, type CreatureLookInfo } from './CreatureRenderer';
import type { ComfortSettingsLike } from './looks';
import type { CreatureSimSource } from './simAdapter';

/** The sim as the creature renderer's read-only source (compile-time proof that the shapes match). */
export function creatureSource(sim: Sim): CreatureSimSource {
  return sim;
}

export class CreaturesRenderer implements SubRenderer {
  readonly name = 'creatures';
  readonly creatures = new CreatureRenderer();
  private sim: Sim | null = null;
  private readonly cf: CreatureFrameInfo = { dt: 0, time: 0, alpha: 1, sim: null, viewportHeightPx: 720 };

  init(ctx: RenderContext): void {
    this.creatures.init({ scene: ctx.scene, camera: ctx.camera, quality: ctx.quality, renderer: ctx.renderer });
  }

  onGameStart(sim: Sim): void { this.setSim(sim); }
  onGameEnd(): void { this.setSim(null); }

  private setSim(sim: Sim | null): void {
    this.sim = sim;
    this.creatures.setSim(sim ? creatureSource(sim) : null);
  }

  /** Spider comfort (and the optional mite / centipede substitutes); instant on the next frame. */
  setComfort(s: Partial<ComfortSettingsLike>): void { this.creatures.setComfort(s); }

  update(frame: FrameInfo): void {
    if (frame.sim !== this.sim) this.setSim(frame.sim);
    const f = this.cf;
    f.dt = frame.dt; f.time = frame.time; f.alpha = frame.alpha; f.camera = frame.camera; f.viewportHeightPx = frame.viewportHeightPx;
    f.sim = undefined; // set through setSim above
    f.comfort = (frame as FrameInfo & { comfort?: ComfortSettingsLike | null }).comfort ?? null;
    this.creatures.update(f);
  }

  setQuality(q: QualityPreset): void { this.creatures.setQuality(q); }

  /** What creature `id` was drawn as in the last frame (GDD 08 E17: `ui.look()` reports the render variant). */
  lookOf(id: number): CreatureLookInfo | null { return this.creatures.lookOf(id); }

  stats(): Record<string, number> {
    const s = this.creatures.stats;
    return {
      creatures: s.creatures, near: s.drawn[0], mid: s.drawn[1], far: s.drawn[2], culled: s.culled, herds: s.herds, aphids: s.aphids, herdDecals: s.herdDecals,
      pits: s.pits, bird: s.bird, markers: s.markers, drawCalls: s.drawCalls, triangles: s.triangles, cpuMs: s.cpuMs, looks: s.looks,
    };
  }

  dispose(): void { this.creatures.dispose(); }
}
