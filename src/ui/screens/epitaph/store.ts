// The Epitaph screen's contract (GDD 06 §13.5, GDD 08): the epitaph flow (src/game/flows/epitaph) publishes the
// colony's record when it ends; the screen words it and calls the actions.
import { signal } from '@preact/signals';
import type { EpitaphData, EpitaphGraph } from '@/sim/colony/succession/epitaph';

export type { EpitaphData, EpitaphGraph };

export interface EpitaphUi {
  data: EpitaphData;
  /** Daughters of this colony still available in the Lineage. */
  available: number;
  /** "Load the last autosave" is offered when the final autosave exists. */
  canLoad: boolean;
}

export interface EpitaphActions {
  foundAgain(): void;
  foundDaughter(daughterId: string | null): void;
  loadLast(): void;
  newGame(): void;
  title(): void;
  copyRecord(): string;
  openLineage(): void;
}

export const epitaphUi = signal<EpitaphUi | null>(null);
export const epitaphActions = signal<EpitaphActions | null>(null);

export function publishEpitaph(ui: EpitaphUi | null): void {
  epitaphUi.value = ui;
}
