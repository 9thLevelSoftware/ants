// Card and RadioCards (GDD 08 2.7). Card: static, selectable or pinned surface. RadioCards: a group of cards where
// exactly one is chosen (species, archetype, difficulty, save slot lists); roving tabindex, arrow keys move AND
// choose, disabled cards are skipped and not focusable.
import type { ComponentChildren } from 'preact';
import { useRef } from 'preact/hooks';
import { cx } from './cx';
import { useFieldA11y } from './Field';
import { groupNext, type Orientation } from './logic/groupNav';

export interface CardProps {
  children: ComponentChildren;
  selected?: boolean;
  pinned?: boolean;
  class?: string;
  as?: 'div' | 'li' | 'article';
}

export function Card({ children, selected, pinned, class: cls, as = 'div' }: CardProps) {
  const Tag = as;
  return <Tag class={cx('ui-card', selected && 'is-selected', pinned && 'is-pinned', cls)}>{children}</Tag>;
}

export interface RadioCardOption<T extends string | number> {
  value: T;
  disabled?: boolean;
  /** Tooltip / explanation when disabled. */
  reason?: string;
}

export interface RadioCardsProps<T extends string | number> {
  options: readonly RadioCardOption<T>[];
  value: T;
  onChange: (value: T) => void;
  render: (option: RadioCardOption<T>, selected: boolean) => ComponentChildren;
  'aria-label'?: string;
  orientation?: Orientation;
  class?: string;
  cardClass?: string;
}

export function RadioCards<T extends string | number>(p: RadioCardsProps<T>) {
  const a11y = useFieldA11y(p['aria-label']);
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const enabled = p.options.map((o) => !o.disabled);
  const firstEnabled = enabled.indexOf(true);
  const selIdx = p.options.findIndex((o) => o.value === p.value);
  const tabStop = selIdx >= 0 && enabled[selIdx] ? selIdx : firstEnabled;
  const choose = (i: number) => {
    const o = p.options[i];
    if (!o || o.disabled) return;
    refs.current[i]?.focus();
    if (o.value !== p.value) p.onChange(o.value);
  };
  return (
    <div class={cx('ui-radiocards', p.class)} role="radiogroup" {...a11y}>
      {p.options.map((o, i) => {
        const selected = i === selIdx;
        return (
          <div
            key={String(o.value)} ref={(el) => { refs.current[i] = el; }} role="radio" aria-checked={selected ? 'true' : 'false'}
            aria-disabled={o.disabled ? 'true' : undefined} tabIndex={o.disabled ? undefined : i === tabStop ? 0 : -1}
            title={o.disabled ? o.reason : undefined}
            class={cx('ui-card', 'is-choice', selected && 'is-selected', o.disabled && 'is-disabled', p.cardClass)}
            onClick={() => choose(i)}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); choose(i); return; }
              const next = groupNext(p.options.length, i, e.key, { orientation: p.orientation ?? 'vertical', skip: (k) => !!p.options[k].disabled });
              if (next === null) return;
              e.preventDefault();
              choose(next);
            }}
          >
            {p.render(o, selected)}
          </div>
        );
      })}
    </div>
  );
}
