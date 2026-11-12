// The tiny facade the UI and game call (task boundary: "UI calls audio.ui(id)"). It forwards to the one AudioSystem
// when there is one and is a silent no-op otherwise (no game yet, test mode, blocked or unsupported audio).
import type { AudioStatus } from './context';
import type { UiSoundId } from './uiSounds';

interface FacadeTarget {
  ui(id: UiSoundId): void;
  status(): AudioStatus;
  enable(): void;
}

let current: FacadeTarget | null = null;

export function setAudioFacadeTarget(t: FacadeTarget | null): void { current = t; }

/** Plays an interface sound (`click`, `click-secondary`, `tab`, `hover`, `toggle`, `page`, ...). */
export function audioUi(id: UiSoundId): void { current?.ui(id); }

/** `off` | `running` | `blocked` | `unsupported` (Settings > Audio status line, diag-audio). */
export function audioStatus(): AudioStatus { return current?.status() ?? 'off'; }

/** "Click to enable sound": retries starting the context; call from a user gesture handler. */
export function audioEnable(): void { current?.enable(); }
