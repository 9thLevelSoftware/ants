// Tabs (GDD 08 2.7): horizontal for drawers, vertical rail for book screens. Roving tabindex, arrow keys move and
// activate, Home / End jump. `useTabHotkeys` adds the Q / E (LB / RB) switching that applies "when no text field
// has focus" inside book screens and drawers.
import { useEffect, useRef } from 'preact/hooks';
import { Icon } from '../icons';
import { cx } from './cx';
import { groupNext, type Orientation } from './logic/groupNav';

export interface TabDef<T extends string> {
  id: T;
  label: string;
  icon?: string;
  disabled?: boolean;
}

export interface TabsProps<T extends string> {
  tabs: readonly TabDef<T>[];
  value: T;
  onChange: (id: T) => void;
  orientation?: Orientation;
  'aria-label': string;
  class?: string;
  /** DOM id prefix so panels can point back with aria-labelledby (`${idPrefix}-tab-${id}`). */
  idPrefix?: string;
}

export function Tabs<T extends string>(p: TabsProps<T>) {
  const orientation = p.orientation ?? 'horizontal';
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = Math.max(0, p.tabs.findIndex((t) => t.id === p.value));
  return (
    <div class={cx('ui-tabs', `is-${orientation}`, p.class)} role="tablist" aria-orientation={orientation === 'vertical' ? 'vertical' : 'horizontal'} aria-label={p['aria-label']}>
      {p.tabs.map((t, i) => (
        <button
          key={t.id} type="button" role="tab" ref={(el) => { refs.current[i] = el; }}
          id={p.idPrefix ? `${p.idPrefix}-tab-${t.id}` : undefined}
          aria-controls={p.idPrefix ? `${p.idPrefix}-panel-${t.id}` : undefined}
          class={cx('ui-tab', i === selected && 'is-selected', t.disabled && 'is-disabled')}
          aria-selected={i === selected ? 'true' : 'false'} aria-disabled={t.disabled ? 'true' : undefined}
          tabIndex={i === selected ? 0 : -1}
          onClick={() => { if (!t.disabled) p.onChange(t.id); }}
          onKeyDown={(e: KeyboardEvent) => {
            const next = groupNext(p.tabs.length, i, e.key, { orientation, skip: (k) => !!p.tabs[k].disabled });
            if (next === null) return;
            e.preventDefault();
            refs.current[next]?.focus();
            p.onChange(p.tabs[next].id);
          }}
        >
          {t.icon && <Icon name={t.icon} size={20} decorative />}
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

function textFieldFocused(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset'].includes(type);
  }
  return false;
}

/** Q / E switch to the previous / next enabled tab while no text field has focus. */
export function useTabHotkeys<T extends string>(tabs: readonly TabDef<T>[], value: T, onChange: (id: T) => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey || textFieldFocused()) return;
      const dir = e.code === 'KeyQ' ? -1 : e.code === 'KeyE' ? 1 : 0;
      if (!dir) return;
      const i = tabs.findIndex((t) => t.id === value);
      const next = groupNext(tabs.length, i, dir > 0 ? 'ArrowRight' : 'ArrowLeft', { orientation: 'horizontal', skip: (k) => !!tabs[k].disabled });
      if (next !== null && next !== i) { e.preventDefault(); onChange(tabs[next].id); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tabs, value, onChange]);
}
