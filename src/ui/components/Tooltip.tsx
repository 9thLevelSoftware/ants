// Tooltip (GDD 08 2.7): plain text or rich (term + one-line definition). Opens after 500 ms of hover or at once on
// keyboard focus; closes on leave, blur or Esc. Never the only copy of essential information.
import type { ComponentChildren } from 'preact';
import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { UI_BALANCE } from '../styles/tokens';
import { cx } from './cx';

export interface TooltipProps {
  text: ComponentChildren;
  /** Rich form: a term shown above the one-line text. */
  term?: string;
  placement?: 'top' | 'bottom';
  children: ComponentChildren;
  class?: string;
  /** Demo/test: render open. */
  forceOpen?: boolean;
}

export function Tooltip({ text, term, placement = 'top', children, class: cls, forceOpen }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const id = useId();
  const clear = () => { if (timer.current !== undefined) { clearTimeout(timer.current); timer.current = undefined; } };
  useEffect(() => clear, []);
  const show = (delay: number) => { clear(); timer.current = window.setTimeout(() => setOpen(true), delay); };
  const hide = () => { clear(); setOpen(false); };
  return (
    <span
      class={cx('ui-tip', cls)}
      onMouseEnter={() => show(UI_BALANCE.tooltipDelayMs)}
      onMouseLeave={hide}
      onFocusIn={() => show(0)}
      onFocusOut={hide}
      onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Escape' && open) { hide(); } }}
      aria-describedby={open || forceOpen ? id : undefined}
    >
      {children}
      {(open || forceOpen) && (
        <span role="tooltip" id={id} class={cx('ui-tip-bubble', `is-${placement}`, term && 'is-rich')}>
          {term && <strong class="ui-tip-term">{term}</strong>}
          {text}
        </span>
      )}
    </span>
  );
}
