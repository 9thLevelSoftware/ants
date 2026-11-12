// Focus policy of the HUD during play (GDD 08 section 8): "the HUD is not in the tab order during play; the alert feed is
// entered with the backquote key and the speed control is operated by its keys". Two things follow.
//  - A mouse click on a HUD chip must not leave the focus on it. A focused button turns Space (the game's "let go" key) into
//    a second click, and Tab would walk through the HUD instead of cycling ants. So chips never take focus from the pointer.
//  - HUD chips are skipped by Tab. Drawers and the alert menu are real panels and keep their normal focus order.
// A drawer or the alert menu is a "panel": everything else inside the HUD root is a chip.

/** Selector of the panels whose controls keep their focus behaviour. */
export const PANEL_SELECTOR = '.fd-drawer, .fd-alert-menu';
/** Regions the keyboard can enter on purpose (backquote); game keys wait while focus is inside one. */
export const ENTERED_SELECTOR = '.fd-drawer, .fd-alerts, .fd-pulse';
const FOCUSABLE = 'a[href], button, input, select, textarea, summary, [tabindex]';

interface ClosestLike { closest(selector: string): unknown }

/** True for a focusable HUD element that is not part of a panel (a "chip": speed button, alert card, pulse, inspect button). */
export function isChip(el: ClosestLike | null): boolean {
  return !!el && !!el.closest(FOCUSABLE) && !el.closest(PANEL_SELECTOR);
}

/** True when `el` sits inside a region the keyboard entered (drawer, alerts feed, colony pulse). */
export function isEntered(el: ClosestLike | null): boolean {
  return !!el && !!el.closest(ENTERED_SELECTOR);
}

/** mousedown on a chip: keep the focus where it was (the game). */
export function onChipMouseDown(e: MouseEvent): void {
  if (isChip(e.target as Element | null)) e.preventDefault();
}

/** click on a chip made with a pointer (detail > 0; Enter and Space give 0): hand the focus back to the game. */
export function onChipClick(e: MouseEvent): void {
  if (e.detail === 0) return;
  const a = document.activeElement as HTMLElement | null;
  if (a && a !== document.body && isChip(a)) a.blur();
}

/** Esc or Tab inside the alerts feed or the colony pulse returns the focus to the game (GDD 08 6.2). */
export function onLeaveKey(e: KeyboardEvent): void {
  if (e.key !== 'Escape' && e.key !== 'Tab') return;
  const a = document.activeElement as HTMLElement | null;
  if (!a || !isEntered(a) || a.closest('.fd-drawer')) return;
  e.preventDefault();
  e.stopPropagation();
  a.blur();
}

/**
 * Keeps every chip out of the tab order, including the shared Button components that cannot take a tabIndex. Chips are
 * still focusable by script (backquote, arrows between alert cards). Returns the stop function.
 */
export function keepChipsOutOfTabOrder(root: HTMLElement): () => void {
  const apply = (): void => {
    root.querySelectorAll<HTMLElement>(FOCUSABLE).forEach((el) => {
      if (el.getAttribute('tabindex') !== '-1' && isChip(el)) el.setAttribute('tabindex', '-1');
    });
  };
  apply();
  if (typeof MutationObserver === 'undefined') return () => {};
  const mo = new MutationObserver(apply);
  mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['tabindex', 'disabled'] });
  return () => mo.disconnect();
}
