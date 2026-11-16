// The tiny facade the UI and game call (task boundary: "UI calls audio.ui(id)"). It forwards to the one AudioSystem
// when there is one and is a silent no-op otherwise (no game yet, test mode, blocked or unsupported audio).
import type { AudioStatus } from './context';
import type { AudioStatusDetail, TestBus } from './statusText';
import type { UiSoundId } from './uiSounds';

interface FacadeTarget {
  ui(id: UiSoundId): void;
  status(): AudioStatus;
  enable(): void;
  statusDetail?(): AudioStatusDetail;
  testBus?(bus: TestBus): void;
}

let current: FacadeTarget | null = null;

export function setAudioFacadeTarget(t: FacadeTarget | null): void { current = t; }

/** Plays an interface sound (`click`, `click-secondary`, `tab`, `hover`, `toggle`, `page`, ...). */
export function audioUi(id: UiSoundId): void { current?.ui(id); }

/** `off` | `running` | `blocked` | `unsupported` (Settings > Audio status line, diag-audio). */
export function audioStatus(): AudioStatus { return current?.status() ?? 'off'; }

/** "Click to enable sound": retries starting the context; call from a user gesture handler. */
export function audioEnable(): void { current?.enable(); }

/** The status line's state: waiting for a click, running, blocked, not supported, muted while hidden, test mode, no game (so no audio system) yet. */
export function audioStatusDetail(): AudioStatusDetail { return current?.statusDetail?.() ?? 'no-game'; }

/** Settings > Audio "Test" button: a representative sound on that bus (call from a click). */
export function audioTest(bus: TestBus): void { current?.testBus?.(bus); }
