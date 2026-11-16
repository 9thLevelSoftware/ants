// READY TO PASTE as src/render/slots/creaturesSlot.ts (task render-creatures; the slot files belong to the app gate).
// Registry slot 'creatures': the real creature renderer (src/render/creatures). Registration in src/render/index.ts:
//
//   import { CreaturesSlot } from './slots/creaturesSlot';
//   registerRenderer('creatures', () => new CreaturesSlot());
//
// Comfort mode: the game passes the settings store's accessibility section in the frame (one additive optional field
// on FrameInfo, `comfort?: { spiderComfort, comfortMites, comfortCentipedes }`, set from
// `this.settings.get().accessibility` where Game builds the frame), or calls slot.setComfort(...) on a settings change.
// Switching is instant: looks are re-resolved on the next frame.
// GDD 08 E17 (`ui.look()`): slot.lookOf(creatureId) returns { look, comfort, ring } for the last frame.
// Antlion pits: the sim's pit does not lower the ground yet; `pitHeightOverlay` (src/render/creatures/pitProfile.ts)
// is the cone as a field height overlay for createPit to register (the renderer then draws real depths by itself).
import { CreaturesRenderer } from '@/render/creatures';

export class CreaturesSlot extends CreaturesRenderer {}
