// Select (GDD 08 2.7): a button that opens a listbox popover. Arrow keys move, Enter / Space choose, Esc closes
// (and is swallowed so it does not also close the screen), type-ahead jumps by first letters. The popover is
// position: fixed so scroll containers cannot clip it.
import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { Icon } from '../icons';
import { cx } from './cx';
import { useFieldA11y } from './Field';
import { pushBack } from './logic/escapeStack';
import { groupNext } from './logic/groupNav';
import { typeaheadNext, type TypeaheadState } from './logic/typeahead';

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
  disabled?: boolean;
  reason?: string;
}

export interface SelectProps<T extends string | number> {
  options: readonly SelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
  'aria-label'?: string;
  disabled?: boolean;
  class?: string;
  id?: string;
  /** Demo: render the popover open at mount. */
  defaultOpen?: boolean;
}

export function Select<T extends string | number>(p: SelectProps<T>) {
  const a11y = useFieldA11y(p['aria-label']);
  const [open, setOpen] = useState(!!p.defaultOpen);
  const selected = Math.max(0, p.options.findIndex((o) => o.value === p.value));
  const [active, setActive] = useState(selected);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const ta = useRef<TypeaheadState>({ buffer: '', at: 0 });
  const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean } | null>(null);
  const listId = useId();

  const close = (refocus = true) => { setOpen(false); if (refocus) button.current?.focus(); };
  const choose = (i: number) => {
    const o = p.options[i];
    if (!o || o.disabled) return;
    if (o.value !== p.value) p.onChange(o.value);
    close();
  };

  useEffect(() => {
    if (!open) return;
    const b = button.current;
    if (b) {
      const r = b.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom;
      const up = spaceBelow < Math.min(260, p.options.length * 36 + 12) && r.top > spaceBelow;
      setPos({ left: r.left, top: up ? r.top : r.bottom, width: r.width, up });
    }
    setActive(selected);
    list.current?.focus({ preventScroll: true });
    const off = pushBack(() => close());
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!list.current?.contains(t) && !button.current?.contains(t)) close(false);
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => { off(); window.removeEventListener('pointerdown', onDown, true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const onButtonKey = (e: KeyboardEvent) => {
    if (p.disabled) return;
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); setOpen(true); }
  };
  const onListKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(active); return; }
    if (e.key === 'Tab') { close(false); return; }
    const next = groupNext(p.options.length, active, e.key, { orientation: 'vertical', wrap: false, skip: (k) => !!p.options[k].disabled });
    if (next !== null) { e.preventDefault(); setActive(next); return; }
    const t = typeaheadNext(p.options.map((o) => o.label), active, e.key, performance.now(), ta.current);
    ta.current = t.state;
    if (t.index >= 0) { e.preventDefault(); setActive(t.index); }
  };

  return (
    <div class={cx('ui-select', open && 'is-open', p.disabled && 'is-disabled', p.class)}>
      <button
        ref={button} id={p.id} type="button" class="ui-select-btn" aria-haspopup="listbox" aria-expanded={open ? 'true' : 'false'}
        aria-controls={open ? listId : undefined} aria-disabled={p.disabled ? 'true' : undefined} {...a11y}
        onClick={() => { if (!p.disabled) (open ? close() : setOpen(true)); }}
        onKeyDown={onButtonKey}
      >
        <span class="ui-select-value">{p.options[selected]?.label ?? ''}</span>
        <Icon name="chevron-down" size={18} decorative />
      </button>
      {open && pos && (
        <ul
          ref={list} id={listId} role="listbox" tabIndex={-1} class={cx('ui-select-list', pos.up && 'is-up')}
          aria-activedescendant={`${listId}-${active}`} aria-label={a11y['aria-label']} aria-labelledby={a11y['aria-labelledby']}
          style={{ left: `${pos.left}px`, width: `${pos.width}px`, ...(pos.up ? { bottom: `${window.innerHeight - pos.top}px` } : { top: `${pos.top}px` }) }}
          onKeyDown={onListKey}
        >
          {p.options.map((o, i) => (
            <li
              key={String(o.value)} id={`${listId}-${i}`} data-index={i} role="option" aria-selected={i === selected ? 'true' : 'false'}
              aria-disabled={o.disabled ? 'true' : undefined} title={o.disabled ? o.reason : undefined}
              class={cx('ui-select-opt', i === active && 'is-active', i === selected && 'is-selected', o.disabled && 'is-disabled')}
              onPointerEnter={() => { if (!o.disabled) setActive(i); }}
              onClick={() => choose(i)}
            >
              <span>{o.label}</span>
              {i === selected && <Icon name="check" size={16} decorative />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
