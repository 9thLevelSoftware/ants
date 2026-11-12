// Which card the HUD asks the bridge for: the pinned target, else whatever the game's picking highlights. Writes the
// request channel (src/game/uiBridge/requests.ts) so the bridge only builds a card while there is one to show.
import { effect } from '@preact/signals';
import { hudRequests } from '@/game/uiBridge/requests';
import { facade } from '../../store';
import { inspectHover, inspectPin } from '../../hud/state';

export interface InspectRef { kind: string; id: number }

/** Pin (click) a target: the card stays until unpinned or Esc. */
export function pinInspect(ref: InspectRef | null): void {
  inspectPin.value = ref;
  facade.value?.refreshUi?.();
}

/** Debug and picking entry: show the card of `ref` as a hover (no pin). */
export function hoverInspect(ref: InspectRef | null): void {
  inspectHover.value = ref;
  facade.value?.refreshUi?.();
}

/** Mirrors the pin / hover signals into the request channel. Returns the uninstaller. */
export function startInspectRequests(): () => void {
  return effect(() => {
    hudRequests.inspect = inspectPin.value ?? inspectHover.value;
  });
}
