// A right-docked drawer (GDD 08 4.1): header with the title and a close button, a scrolling body. Same classes as the
// shell's `Drawer` (so it looks alike), but the initial focus goes to the first usable control of the body instead of the
// close button, and the close button's tooltip opens below it (it would be clipped at the top of the screen). Esc closes
// it through the shell's back stack; focus returns to where it was when the drawer closes.
import type { ComponentChildren } from 'preact';
import { useId, useRef } from 'preact/hooks';
import { IconButton } from '../components/Button';
import { useBackLayer, useFocusScope } from '../components/focus';
import { BACK_LEVEL } from '../components/logic/escapeStack';
import { cx } from '../components/cx';

/** The first control of the body that can be used: a disabled button (kept focusable for its reason) is not a landing place. */
const INITIAL_FOCUS = '.ui-drawer-body button:not([aria-disabled="true"]):not(:disabled), .ui-drawer-body [role="slider"], .ui-drawer-body input';

export interface DrawerShellProps {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  class?: string;
  /** Selector of the element to focus on open (default: the first control inside the body). */
  initial?: string;
}

export function DrawerShell(p: DrawerShellProps) {
  const ref = useRef<HTMLElement>(null);
  const id = useId();
  useFocusScope(ref as never, { initial: p.initial ?? INITIAL_FOCUS });
  useBackLayer(p.onClose, BACK_LEVEL.screen);
  return (
    <aside ref={ref} class={cx('ui-drawer', 'ui-surface', p.class)} aria-labelledby={id}>
      <header class="ui-drawer-head">
        <h2 id={id} class="ui-panel-title">{p.title}</h2>
        <IconButton icon="close" label="Close" tooltipPlacement="bottom" onClick={p.onClose} />
      </header>
      <div class="ui-drawer-body">{p.children}</div>
    </aside>
  );
}
