// READY TO PASTE as src/render/slots/humansSlot.ts (task human-events; the slot files belong to the app gate).
// Registry slot 'humans': the human-event renderer. The registry has no 'humans' slot yet; registration needs two
// additive edits in src/render/index.ts:
//
//   export type RendererSlot = 'world' | 'nest' | 'ants' | 'creatures' | 'humans' | 'fx';
//   export const RENDERER_SLOTS: readonly RendererSlot[] = ['world', 'nest', 'ants', 'creatures', 'humans', 'fx'];
//   import { HumansSlot } from './slots/humansSlot';
//   registerRenderer('humans', () => new HumansSlot());
//
// (and a trivial debug fallback for 'humans' in src/render/debug, e.g. the FxSlot-style empty renderer).
// Parked cars and bait stations are dynamic primitives: the world renderer already draws them from worldDelta.
// Camera tremor: the views layer reads `tremor` cues (src/game/views/tremorCue.ts); `tremorShake` in
// src/render/world/humans/tremor.ts gives the same shake to other cameras (none in reduced motion).
import { HumansRenderer } from '@/render/world/humans';

export class HumansSlot extends HumansRenderer {}
