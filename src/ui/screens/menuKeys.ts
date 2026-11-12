// The shell's one global key handler for menus. It runs in the capture phase on window so that, while a menu layer
// is open, Esc closes that layer and never reaches the game's own handling (which would resume from the pause menu
// or toggle it again). With no layer registered the key passes through untouched.
import { handleBack, hasBackHandler } from '../components/logic/escapeStack';

function textFieldFocused(): HTMLElement | null {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return null;
  // a read-only field has nothing to leave: Esc goes straight to the layer
  if ((el as HTMLInputElement).readOnly) return null;
  if (el.tagName === 'TEXTAREA') return el;
  if (el.tagName === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    return ['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'file'].includes(type) ? null : el;
  }
  return el.isContentEditable ? el : null;
}

export function onMenuKeyDown(e: KeyboardEvent): void {
  if (e.key !== 'Escape' || e.ctrlKey || e.altKey || e.metaKey) return;
  const field = textFieldFocused();
  if (field && hasBackHandler()) {
    // GDD 01 5.8: Esc blurs the field first
    e.preventDefault();
    e.stopImmediatePropagation();
    field.blur();
    return;
  }
  if (hasBackHandler()) {
    e.preventDefault();
    e.stopImmediatePropagation();
    handleBack();
  }
}

let installs = 0;
let detach: (() => void) | null = null;

/** Installs the handler (reference counted); returns the uninstaller. */
export function installMenuKeys(win: Window = window): () => void {
  if (installs++ === 0) {
    win.addEventListener('keydown', onMenuKeyDown, true);
    detach = () => win.removeEventListener('keydown', onMenuKeyDown, true);
  }
  return () => {
    if (--installs === 0) { detach?.(); detach = null; }
  };
}
