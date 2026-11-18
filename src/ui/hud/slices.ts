// Computed slices of the snapshot. The bridge keeps the previous object for a slice whose value did not change, and a
// computed signal only notifies when the object it returns changed, so a component that reads one slice re-renders only
// when that slice does (GDD 08 App. A: the snapshot refreshes 4 times per real second).
import { computed } from '@preact/signals';
import { snapshot } from '../store';

export const screenSlice = computed(() => snapshot.value.screen);
export const viewSlice = computed(() => snapshot.value.view);
export const hudHiddenSlice = computed(() => snapshot.value.hudHidden);
export const timeSlice = computed(() => snapshot.value.time);
export const speedSlice = computed(() => snapshot.value.speed);
export const colonySlice = computed(() => snapshot.value.colony);
export const possessedSlice = computed(() => snapshot.value.possessed);
export const promptSlice = computed(() => snapshot.value.prompt);
export const alertsSlice = computed(() => snapshot.value.alerts);
export const toastsSlice = computed(() => snapshot.value.toasts);
export const directivesSlice = computed(() => snapshot.value.directives ?? null);
export const rosterSlice = computed(() => snapshot.value.roster ?? null);
export const inspectSlice = computed(() => snapshot.value.inspect ?? null);
export const focusAimSlice = computed(() => snapshot.value.focusAim ?? null);
