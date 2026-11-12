// Panel, Drawer and BookScreen (GDD 08 2.7, 7.1). Panel = a semi-opaque surface; Drawer = right-docked panel with a
// close button; BookScreen = centred 1120 x 640 dp page with a vertical tab rail (Q / E switch tabs, Esc closes).
import type { ComponentChildren } from 'preact';
import { useEffect, useId, useRef } from 'preact/hooks';
import { cx } from './cx';
import { IconButton } from './Button';
import { useFocusScope } from './focus';
import { pushBack } from './logic/escapeStack';
import { Tabs, useTabHotkeys, type TabDef } from './Tabs';

export interface PanelProps {
  title?: string;
  children: ComponentChildren;
  /** Landmark name (panels are ARIA landmarks, GDD 08 section 8). */
  label?: string;
  class?: string;
  raised?: boolean;
}

export function Panel(p: PanelProps) {
  const id = useId();
  return (
    <section class={cx('ui-panel', 'ui-surface', p.raised && 'is-raised', p.class)} aria-labelledby={p.title ? id : undefined} aria-label={p.title ? undefined : p.label}>
      {p.title && <h2 id={id} class="ui-panel-title">{p.title}</h2>}
      {p.children}
    </section>
  );
}

export interface DrawerProps {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  class?: string;
}

export function Drawer(p: DrawerProps) {
  const ref = useRef<HTMLElement>(null);
  const id = useId();
  useFocusScope(ref as never, {});
  useEffect(() => pushBack(p.onClose), [p.onClose]);
  return (
    <aside ref={ref} class={cx('ui-drawer', 'ui-surface', p.class)} aria-labelledby={id}>
      <header class="ui-drawer-head">
        <h2 id={id} class="ui-panel-title">{p.title}</h2>
        <IconButton icon="close" label="Close" onClick={p.onClose} />
      </header>
      <div class="ui-drawer-body">{p.children}</div>
    </aside>
  );
}

export interface BookScreenProps<T extends string> {
  title: string;
  tabs: readonly TabDef<T>[];
  tab: T;
  onTab: (id: T) => void;
  onClose: () => void;
  /** Rail footer (e.g. a Back button). */
  railFooter?: ComponentChildren;
  children: ComponentChildren;
  /** Selector of the element to focus first. */
  initialFocus?: string;
  class?: string;
  idPrefix?: string;
  /** Test/demo: do not register the Esc handler. */
  noEscape?: boolean;
}

export function BookScreen<T extends string>(p: BookScreenProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const prefix = p.idPrefix ?? 'book';
  useFocusScope(ref, { initial: p.initialFocus });
  useTabHotkeys(p.tabs, p.tab, p.onTab);
  useEffect(() => (p.noEscape ? undefined : pushBack(p.onClose)), [p.onClose, p.noEscape]);
  return (
    <div class="ui-book-wrap">
      <div ref={ref} class={cx('ui-book', 'ui-surface', 'is-elevated', p.class)} role="dialog" aria-label={p.title}>
        <nav class="ui-book-rail" aria-label={`${p.title} sections`}>
          <h1 class="ui-book-title">{p.title}</h1>
          <Tabs tabs={p.tabs} value={p.tab} onChange={p.onTab} orientation="vertical" aria-label={`${p.title} sections`} idPrefix={prefix} />
          {p.railFooter && <div class="ui-book-rail-foot">{p.railFooter}</div>}
        </nav>
        <div class="ui-book-page" role="tabpanel" id={`${prefix}-panel-${p.tab}`} aria-labelledby={`${prefix}-tab-${p.tab}`}>
          {p.children}
        </div>
      </div>
    </div>
  );
}

export interface BookPageProps {
  title: string;
  onClose: () => void;
  /** Text of the back button (default "Back"). */
  backLabel?: string;
  children: ComponentChildren;
  /** Extra header controls, right-aligned. */
  headerRight?: ComponentChildren;
  initialFocus?: string;
  class?: string;
  noEscape?: boolean;
}

/** A book screen without a tab rail (New Game, Credits, Lineage): header with Back, then the page. */
export function BookPage(p: BookPageProps) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusScope(ref, { initial: p.initialFocus });
  useEffect(() => (p.noEscape ? undefined : pushBack(p.onClose)), [p.onClose, p.noEscape]);
  return (
    <div class="ui-book-wrap">
      <div ref={ref} class={cx('ui-book', 'is-plain', 'ui-surface', 'is-elevated', p.class)} role="dialog" aria-label={p.title}>
        <header class="ui-book-head">
          <IconButton icon="back" label={p.backLabel ?? 'Back'} onClick={p.onClose} class="ui-book-back" data-testid="book-back" />
          <h1 class="ui-book-title">{p.title}</h1>
          <div class="ui-book-head-right">{p.headerRight}</div>
        </header>
        <div class="ui-book-body">{p.children}</div>
      </div>
    </div>
  );
}
