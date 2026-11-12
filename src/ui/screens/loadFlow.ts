// What the loading screen is for. The game only says "loading"; whether that is world generation (New Game) or reading
// a save decides the wording, the summary and the failure panel (GDD 08 3.6, GDD 01 1.1). The UI knows because it
// made the call: every start goes through here. `UiLoading.kind` from the snapshot wins when the game provides it.
import { signal } from '@preact/signals';
import type { GameFacade, SaveResult, SaveSlotInfo } from '../api';

export interface LoadingContext {
  kind: 'generate' | 'load';
  /** The save being read, when the UI knew it (a slot card, Continue); null for an import. */
  info: SaveSlotInfo | null;
}

export const loadingContext = signal<LoadingContext>({ kind: 'generate', info: null });

export function markGenerating(): void {
  loadingContext.value = { kind: 'generate', info: null };
}

/** Loads a slot and remembers that the loading screen that follows is a load. */
export function loadSlot(f: GameFacade, slot: string, info: SaveSlotInfo | null = null): Promise<SaveResult> {
  loadingContext.value = { kind: 'load', info };
  return f.load(slot);
}

/** Imports a file or text; target 'now' loads it without storing, which is a load as far as the screen goes. */
export function importInto(f: GameFacade, data: Uint8Array | string, target: string): Promise<SaveResult> | undefined {
  if (target === 'now') loadingContext.value = { kind: 'load', info: null };
  return f.importSave?.(data, target);
}
