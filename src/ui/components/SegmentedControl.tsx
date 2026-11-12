// SegmentedControl (GDD 08 2.7): 2-6 segments, role="radiogroup" with a roving tabindex; arrow keys move the
// selection (Home / End jump). Disabled segments are skipped by the arrows and may carry a reason.
import { useRef } from 'preact/hooks';
import { Icon } from '../icons';
import { cx } from './cx';
import { useFieldA11y } from './Field';
import { groupNext } from './logic/groupNav';

export interface SegmentOption<T extends string | number> {
  value: T;
  label: string;
  icon?: string;
  disabled?: boolean;
  /** Tooltip for a disabled segment (why it is unavailable). */
  reason?: string;
}

export interface SegmentedControlProps<T extends string | number> {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  'aria-label'?: string;
  disabled?: boolean;
  class?: string;
  id?: string;
  /** Stretch segments to equal widths (default true). */
  fill?: boolean;
}

export function SegmentedControl<T extends string | number>(p: SegmentedControlProps<T>) {
  const a11y = useFieldA11y(p['aria-label']);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = Math.max(0, p.options.findIndex((o) => o.value === p.value));
  const select = (i: number) => {
    const o = p.options[i];
    if (!o || o.disabled || p.disabled) return;
    refs.current[i]?.focus();
    if (o.value !== p.value) p.onChange(o.value);
  };
  return (
    <div id={p.id} class={cx('ui-seg', p.fill !== false && 'is-fill', p.disabled && 'is-disabled', p.class)} role="radiogroup" {...a11y}>
      {p.options.map((o, i) => (
        <button
          key={String(o.value)} type="button" role="radio" ref={(el) => { refs.current[i] = el; }}
          class={cx('ui-seg-item', i === selected && 'is-selected', o.disabled && 'is-disabled')}
          aria-checked={i === selected ? 'true' : 'false'} aria-disabled={o.disabled ? 'true' : undefined}
          tabIndex={i === selected ? 0 : -1} title={o.disabled ? o.reason : undefined}
          onClick={() => select(i)}
          onKeyDown={(e: KeyboardEvent) => {
            const next = groupNext(p.options.length, i, e.key, { orientation: 'horizontal', skip: (k) => !!p.options[k].disabled });
            if (next === null) return;
            e.preventDefault();
            select(next);
          }}
        >
          {o.icon && <Icon name={o.icon} size={18} decorative />}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}
