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

const BACKQUOTE = 'Backquote';

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

export function onHudKey(e: KeyboardEvent): void {
  if (e.repeat || e.ctrlKey || e.altKey || e.metaKey || typing(document.activeElement)) return;
  if (snapshot.peek().mode !== 'playing') return;
  if (matchesAction(e, 'directives')) { e.preventDefault(); togglePanel('directives'); return; }
  if (matchesAction(e, 'roster')) { e.preventDefault(); togglePanel('roster'); return; }
  // ui-panels: Colony health (Y), Nest overview (U), Journal (J), Codex (K), scent view (V), the other overlays (O)
  if (matchesAction(e, 'why-view')) { e.preventDefault(); openBook.value = null; togglePanel('health'); return; }
  if (matchesAction(e, 'nest-overview')) { e.preventDefault(); openBook.value = null; togglePanel('nest'); return; }
  if (matchesAction(e, 'journal')) { e.preventDefault(); openBook.value = openBook.peek() === 'journal' ? null : 'journal'; return; }
  if (matchesAction(e, 'codex')) { e.preventDefault(); openBook.value = openBook.peek() === 'codex' ? null : 'codex'; return; }
  if (matchesAction(e, 'scent-view')) { e.preventDefault(); toggleOverlay('scent'); return; }
  if (matchesAction(e, 'overlay-cycle')) { e.preventDefault(); cycleOtherOverlay(); return; }
  if (e.code === BACKQUOTE && !e.shiftKey && enterFeed()) e.preventDefault();
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
