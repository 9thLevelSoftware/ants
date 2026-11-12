// The UI's signal store: the current UiSnapshot (replaced on every refresh by the game) and the GameFacade the
// components call. Components read `snapshot.value`; nothing else in the UI holds game state.
import { signal } from '@preact/signals';
import { emptySnapshot, type GameFacade, type UiSnapshot } from './api';

export const snapshot = signal<UiSnapshot>(emptySnapshot('boot'));

/** Set once by main.ts when the game exists; null on the boot / unsupported screens. */
export const facade = signal<GameFacade | null>(null);

export function setSnapshot(s: UiSnapshot): void {
  snapshot.value = s;
}

/** Boot outcomes before the game exists (WebGL2 missing, uncaught error during boot). */
export function setBootScreen(screen: 'boot' | 'unsupported', error: string | null = null): void {
  snapshot.value = { ...snapshot.value, screen, error };
}

/** Shows the error overlay over whatever screen is up. */
export function showError(text: string): void {
  snapshot.value = { ...snapshot.value, error: text };
}
