// The views layer's tool state as a signal: refreshed after every action of the palette and whenever the snapshot
// refreshes (the player may also pick a tool with Shift+1..7), and only replaced when it changed.
import { effect, signal } from '@preact/signals';
import { snapshot } from '../../store';
import { panelsBridge } from '../wiring/state';
import type { UiToolState } from '../wiring/bridgeTypes';

export const toolState = signal<UiToolState | null>(null);

const same = (a: UiToolState | null, b: UiToolState | null): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Reads the bridge now. */
export function refreshToolState(): void {
  const next = panelsBridge.peek()?.tool() ?? null;
  if (!same(toolState.peek(), next)) toolState.value = next;
}

/** Follows the snapshot; returns the stop function. */
export function startToolState(): () => void {
  return effect(() => {
    void snapshot.value.rev;
    void panelsBridge.value;
    refreshToolState();
  });
}
