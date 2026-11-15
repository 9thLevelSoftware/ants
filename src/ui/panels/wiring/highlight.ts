// "Suggested control" highlight (GDD 08 4.4): a 2 dp accent outline on the control a remedy points at, for 4 real
// seconds. The outline is static (no pulse), so reduced motion needs no special case.
import { HIGHLIGHT_REAL_S } from '../balance';

export const HIGHLIGHT_CLASS = 'pn-highlight';

let timers: ReturnType<typeof setTimeout>[] = [];

/** Removes every highlight now. */
export function clearHighlights(doc: Document = document): void {
  timers.forEach(clearTimeout);
  timers = [];
  doc.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((el) => el.classList.remove(HIGHLIGHT_CLASS));
}

/**
 * Highlights the first element matching `selector`, waiting up to `waitMs` for it to be drawn (the drawer that holds it
 * may have just opened). Resolves to the element, or null when it never appeared.
 */
export function highlightControl(selector: string, waitMs = 1500, doc: Document = document): Promise<HTMLElement | null> {
  clearHighlights(doc);
  return new Promise((resolve) => {
    const t0 = Date.now();
    const look = (): void => {
      const el = doc.querySelector<HTMLElement>(selector);
      if (el) {
        el.classList.add(HIGHLIGHT_CLASS);
        el.scrollIntoView?.({ block: 'nearest' });
        timers.push(setTimeout(() => el.classList.remove(HIGHLIGHT_CLASS), HIGHLIGHT_REAL_S * 1000));
        resolve(el);
      } else if (Date.now() - t0 < waitMs) requestAnimationFrame(look);
      else resolve(null);
    };
    look();
  });
}
