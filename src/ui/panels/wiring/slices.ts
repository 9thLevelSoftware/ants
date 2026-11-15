// Computed slices of the snapshot for the panels (same pattern as src/ui/hud/slices.ts): a component that reads one
// re-renders only when the bridge hands over a changed object.
import { computed } from '@preact/signals';
import { snapshot } from '../../store';

export const healthSlice = computed(() => snapshot.value.health ?? null);
export const nestSlice = computed(() => snapshot.value.nest ?? null);
export const journalSlice = computed(() => snapshot.value.journal ?? null);
export const codexSlice = computed(() => snapshot.value.codex ?? null);
export const markersSlice = computed(() => snapshot.value.markers ?? null);
