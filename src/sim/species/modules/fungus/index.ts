// Economy module `fungus-garden` (Atta, GDD 07 §6). STUB written by F1c; owner: species-leafcutter.
// The module contributes systems, behaviours and command handlers through these arrays (rulings 9, 13): the
// composition roots pick them up, so the owner only edits files inside this folder.

import type { Behaviour, CommandHandlerMap, System } from '@/sim/types';

/** Systems of this module (each with a `phase`). */
export const systems: readonly System[] = [];

/** Species-specific behaviours (set `species` on each). */
export const behaviours: readonly Behaviour[] = [];

/** Command handlers this module owns. */
export const commandHandlers: Partial<CommandHandlerMap> = {
  'cheat.setGarden': () => {}, // owner: species-leafcutter
  'cheat.supplySubstrate': () => {}, // owner: species-leafcutter
  'cheat.infectGarden': () => {}, // owner: species-leafcutter
};
