// The Lineage screen's contract (GDD 06 §12, GDD 08): the device Lineage (colonies, flights, daughters) as the
// lineage flow reads it from the profile store, and the actions (found as a daughter queen, export, close).
import { signal } from '@preact/signals';
import type { LineageStore } from '@/sim/types';

export interface LineageActions {
  foundDaughter(daughterId: string): void;
  exportJson(): string;
  close(): void;
}

/** Open while non-null: the lineage to show. */
export const lineageUi = signal<LineageStore | null>(null);
export const lineageActions = signal<LineageActions | null>(null);

export function publishLineage(l: LineageStore | null): void {
  lineageUi.value = l;
}
