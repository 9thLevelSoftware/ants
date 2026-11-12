// ScrollArea: an overflow container that is keyboard-scrollable. When its content overflows and has nothing
// focusable inside, it becomes a focusable region (arrow keys / PageUp / PageDown scroll it); otherwise it is not a
// tab stop (focus moving through its controls scrolls it).
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { cx } from './cx';
import { FOCUSABLE } from './focus';

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
    // a region with focusable content scrolls by moving focus; only a region without any needs to be a tab stop itself
    const measureNow = () => setScrollable(el.scrollHeight > el.clientHeight + 1 && !el.querySelector(FOCUSABLE));
    measureNow();
    if (typeof ResizeObserver === 'undefined') return;
    // measure on the next frame: setting state inside the observer callback triggers the "ResizeObserver loop" error
    let raf = 0;
    const measure = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measureNow); };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    Array.from(el.children).forEach((c) => ro.observe(c));
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
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
