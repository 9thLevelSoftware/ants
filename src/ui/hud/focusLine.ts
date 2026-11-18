// When the Focus line shows (GDD 08 3.4 row "Focus line", setting Gameplay > Focus line): Never hides it, Always shows the
// current top aim, Auto shows it through a colony's first game days and then for FOCUS_LINE_REAL_S real seconds each time a
// NEW aim opens. "Opens" is seen from here: the aim the game starts with (a loaded save) is not new; a different one that
// appears afterwards is. Pure: the component feeds it the aim and the clock.
import type { UiFocusAim } from '../api';
import type { FocusLineMode } from '../styles/prefs';

/** Real seconds a newly opened aim stays on the line (Auto). */
export const FOCUS_LINE_REAL_S = 30;

const openIdsOf = (aim: UiFocusAim | null): readonly string[] => (aim ? aim.openIds ?? [aim.id] : []);

export class FocusLineClock {
  private seenTop: string | null | undefined;
  private seenOpen: ReadonlySet<string> = new Set();
  private announced: string | null = null;
  private shownUntilMs = 0;

  /**
   * Feed the current aim; call whenever it may have changed (cheap). A window starts when the top aim changes or when
   * any aim not seen before is open (an aim usually opens BEHIND an older one that stays open).
   */
  note(aim: UiFocusAim | null, nowMs: number): void {
    const top = aim ? aim.id : null;
    const open = openIdsOf(aim);
    if (this.seenTop === undefined) { // the aims already open when we first look are not new
      this.seenTop = top;
      this.seenOpen = new Set(open);
      return;
    }
    let fresh: string | null = top !== null && top !== this.seenTop ? top : null;
    for (const id of open) if (!this.seenOpen.has(id)) fresh = id; // the newest of several wins
    this.seenTop = top;
    this.seenOpen = new Set(open);
    if (fresh !== null) {
      this.announced = fresh;
      this.shownUntilMs = nowMs + FOCUS_LINE_REAL_S * 1000;
    }
  }

  /** The aim the line words: the one just announced while its window runs and it is still open, else the top aim. */
  shownId(aim: UiFocusAim, nowMs: number): string {
    const announced = this.announced;
    if (announced !== null && nowMs < this.shownUntilMs && openIdsOf(aim).includes(announced)) return announced;
    return aim.id;
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
