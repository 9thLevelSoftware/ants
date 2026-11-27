// Registry slot 'creatures' (wire-stage2): the real creature renderer (src/render/creatures). Comfort mode comes in the
// frame (`FrameInfo.comfort`, from Settings > Accessibility; Game builds it) and switches instantly on the next frame;
// `lookOf(creatureId)` reports what the last frame drew (GDD 08 E17, debug `ui.look()`). app-seams-4 item 6: the night look's moon
// rim follows the world's key light, scaled by the exposure like the ants' form light (ants/tuning.ts ANT_FILL.rim.night).
import type { FrameInfo, RenderContext } from '@/render';
import { ANT_FILL } from '@/render/ants/tuning';
import { CreaturesRenderer } from '@/render/creatures';
import { AntsSlot } from './antsSlot';
import { WorldSlot } from './worldSlot';

export class CreaturesSlot extends CreaturesRenderer {
  private worldSlot: WorldSlot | null = null;
  private antsSlot: AntsSlot | null = null;

  override init(ctx: RenderContext): void {
    super.init(ctx);
    const w = ctx.peer?.('world');
    this.worldSlot = w instanceof WorldSlot ? w : null;
    const a = ctx.peer?.('ants');
    this.antsSlot = a instanceof AntsSlot ? a : null;
  }

  override update(frame: FrameInfo): void {
    const l = this.worldSlot?.world.lighting;
    if (l) this.creatures.setMoon(l.keyDir, l.moonlit ? l.nightW * ANT_FILL.rim.night * Math.pow(2, -l.exposureEV) : 0);
    // GDD 01 6.5 rule 2: creatures between the camera and the possessed ant fade away like the ants do (the ants' own subject)
    const subj = this.antsSlot?.ants.occluderSubject() ?? null;
    this.creatures.setOccluderSubject(subj ? subj.pos : null, subj ? subj.lengthMm : 1);
    super.update(frame);
  }
}
