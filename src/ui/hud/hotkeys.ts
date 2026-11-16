// The HUD's keys: the Directives and Roster toggles (rebindable actions `directives` and `roster`, read from the
// current bindings, never hard-coded) and the backquote key that moves focus into the alerts feed (GDD 08 6.2).
// The game's own input layer does not handle these actions; text fields keep their keys (typing "l" in a search
// box must not toggle the roster).
import type { Binding } from '@/input';
import { currentBindings } from '../components';
import { snapshot } from '../store';
import { cycleOtherOverlay, toggleOverlay } from '../overlays/state';
import { openBook } from '../panels/wiring/state';
import { togglePanel } from './state';

function typing(el: Element | null): boolean {
  if (!el) return false;
  const t = el as HTMLElement;
  if (t.isContentEditable || t.tagName === 'TEXTAREA') return true;
  if (t.tagName !== 'INPUT') return false;
  return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'file'].includes((t as HTMLInputElement).type);
}

/** True when a keyboard binding of `action` matches the event. */
export function matchesAction(e: KeyboardEvent, action: string): boolean {
  const list = (currentBindings.value.kbm[action] ?? []) as (Binding | null)[];
  return list.some((b) => !!b && b.kind === 'key' && b.code === e.code && !!b.shift === e.shiftKey);
}

/**
 * What each UI-handled action does. The keyboard handler below and the pad navigation layer (src/ui/nav) both run
 * these, so a binding of either device opens the same thing. The game's own input layer does not handle them.
 */
export const HUD_ACTIONS: Record<string, () => void> = {
  'directives': () => togglePanel('directives'),
  'roster': () => togglePanel('roster'),
  // ui-panels: Colony health (Y), Nest overview (U), Journal (J), Codex (K), scent view (V), the other overlays (O)
  'why-view': () => { openBook.value = null; togglePanel('health'); },
  'nest-overview': () => { openBook.value = null; togglePanel('nest'); },
  'journal': () => { openBook.value = openBook.peek() === 'journal' ? null : 'journal'; },
  'codex': () => { openBook.value = openBook.peek() === 'codex' ? null : 'codex'; },
  'scent-view': () => toggleOverlay('scent'),
  'overlay-cycle': () => cycleOtherOverlay(),
};

export function onHudKey(e: KeyboardEvent): void {
  if (e.repeat || e.ctrlKey || e.altKey || e.metaKey || typing(document.activeElement)) return;
  if (snapshot.peek().mode !== 'playing') return;
  for (const [action, run] of Object.entries(HUD_ACTIONS)) {
    if (matchesAction(e, action)) { e.preventDefault(); run(); return; }
  }
  if (matchesAction(e, 'alert-focus') && enterFeed()) e.preventDefault();
}

/** Moves the focus into the alerts feed; with no card on screen, into the colony pulse (it expands on keyboard focus). */
export function enterFeed(): boolean {
  const first = document.querySelector<HTMLElement>('[data-hud="alerts"] [data-alert-button]') ?? document.querySelector<HTMLElement>('[data-hud="pulse"]');
  if (!first) return false;
  first.focus();
  return true;
}

export function installHudKeys(win: Window = window): () => void {
  win.addEventListener('keydown', onHudKey);
  return () => win.removeEventListener('keydown', onHudKey);
}
