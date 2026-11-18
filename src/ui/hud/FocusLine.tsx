// Focus line (GDD 08 3.4, T2): the colony's current top aim under the clock. Click opens Journal > Aims.
import { useEffect, useRef, useState } from 'preact/hooks';
import { aimLine } from '../panels/journal/timeline';
import { journalTab, openBook } from '../panels/wiring/state';
import { uiPrefs } from '../styles/prefs';
import { FocusLineClock } from './focusLine';
import { focusAimSlice } from './slices';

export function FocusLine() {
  const aim = focusAimSlice.value;
  const mode = uiPrefs.prefs.value.gameplay.focusLine;
  const clock = useRef<FocusLineClock>(null as unknown as FocusLineClock);
  clock.current ??= new FocusLineClock();
  const [, tick] = useState(0);
  const now = Date.now();
  clock.current.note(aim, now);
  // a timed show ends without any other change: wake once when it does
  const left = clock.current.msLeft(now);
  useEffect(() => {
    if (left <= 0) return;
    const id = setTimeout(() => tick((n) => n + 1), left + 50);
    return () => clearTimeout(id);
  }, [left, aim?.id]);
  if (!aim || !clock.current.visible(mode, aim, now)) return null;
  const text = `Aim: ${aimLine(clock.current.shownId(aim, now), aim.species)}`;
  return (
    <button
      type="button" class="fd-focus fd-chip" data-hud="focus" data-testid="focus-line" title={`${text} (open the Journal)`} tabIndex={-1}
      onClick={() => { journalTab.value = 'aims'; openBook.value = 'journal'; }}
    >
      <span class="fd-focus-text">{text}</span>
    </button>
  );
}
