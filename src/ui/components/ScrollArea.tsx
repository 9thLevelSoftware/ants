// ScrollArea: an overflow container that is keyboard-scrollable. When its content overflows it becomes a focusable
// region (arrow keys / PageUp / PageDown scroll it); when it fits it is not a tab stop.
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { cx } from './cx';

export interface ScrollAreaProps {
  children: ComponentChildren;
  /** Accessible name of the scrollable region. */
  label: string;
  class?: string;
  /** Draw fade edges where content continues. */
  fade?: boolean;
}

export function ScrollArea({ children, label, class: cls, fade }: ScrollAreaProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setScrollable(el.scrollHeight > el.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    Array.from(el.children).forEach((c) => ro.observe(c));
    return () => ro.disconnect();
  }, [children]);
  return (
    <div
      ref={ref} class={cx('ui-scroll', fade && 'has-fade', cls)} tabIndex={scrollable ? 0 : undefined}
      role={scrollable ? 'region' : undefined} aria-label={scrollable ? label : undefined}
    >
      {children}
    </div>
  );
}
