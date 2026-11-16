// Registry slot 'creatures' (wire-stage2): the real creature renderer (src/render/creatures). Comfort mode comes in the
// frame (`FrameInfo.comfort`, from Settings > Accessibility; Game builds it) and switches instantly on the next frame;
// `lookOf(creatureId)` reports what the last frame drew (GDD 08 E17, debug `ui.look()`).
import { CreaturesRenderer } from '@/render/creatures';

export class CreaturesSlot extends CreaturesRenderer {}
