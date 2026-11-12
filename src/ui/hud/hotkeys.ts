// The HUD's keys: the Directives and Roster toggles (rebindable actions `directives` and `roster`, read from the
// current bindings, never hard-coded) and the backquote key that moves focus into the alerts feed (GDD 08 6.2).
// The game's own input layer does not handle these actions; text fields keep their keys (typing "l" in a search
// box must not toggle the roster).
import type { Binding } from '@/input';
import { currentBindings } from '../components';
import { snapshot } from '../store';
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
  if (e.code === BACKQUOTE && !e.shiftKey) {
    const first = document.querySelector<HTMLElement>('[data-hud="alerts"] [data-alert-button]');
    if (first) { e.preventDefault(); first.focus(); }
  }
}

export function installHudKeys(win: Window = window): () => void {
  win.addEventListener('keydown', onHudKey);
  return () => win.removeEventListener('keydown', onHudKey);
}
