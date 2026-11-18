// When the Focus line shows (GDD 08 3.4 row "Focus line", setting Gameplay > Focus line): Never hides it, Always shows the
// current top aim, Auto shows it through a colony's first game days and then for FOCUS_LINE_REAL_S real seconds each time a
// NEW aim opens. "Opens" is seen from here: the aim the game starts with (a loaded save) is not new; a different one that
// appears afterwards is. Pure: the component feeds it the aim and the clock.
import type { UiFocusAim } from '../api';
import type { FocusLineMode } from '../styles/prefs';

/** Real seconds a newly opened aim stays on the line (Auto). */
export const FOCUS_LINE_REAL_S = 30;

export class FocusLineClock {
  private seen: string | null | undefined;
  private shownUntilMs = 0;

  /** Feed the current aim; call whenever it may have changed (cheap). */
  note(aim: UiFocusAim | null, nowMs: number): void {
    const id = aim ? aim.id : null;
    if (this.seen === undefined) { this.seen = id; return; } // the aim already open when we first look is not new
    if (id !== this.seen) {
      this.seen = id;
      if (id !== null) this.shownUntilMs = nowMs + FOCUS_LINE_REAL_S * 1000;
    }
  }

  /** Whether the line shows now; `msLeft` is how long a real-time window has left (for the re-check timer). */
  visible(mode: FocusLineMode, aim: UiFocusAim | null, nowMs: number): boolean {
    if (!aim || mode === 'never') return false;
    if (mode === 'always') return true;
    return aim.newColony || nowMs < this.shownUntilMs;
  }

  /** Real ms until a timed show ends, 0 when none is running. */
  msLeft(nowMs: number): number {
    return Math.max(0, this.shownUntilMs - nowMs);
  }
}
