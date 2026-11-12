// List and ListItem (GDD 08 2.7): a plain list with optional interactive rows. Interactive rows are buttons, so
// Tab / Enter work; a `selected` row is marked aria-current.
import type { ComponentChildren } from 'preact';
import { Icon } from '../icons';
import { cx } from './cx';

export interface ListProps {
  children: ComponentChildren;
  class?: string;
  'aria-label'?: string;
}

export function List({ children, class: cls, 'aria-label': label }: ListProps) {
  return <ul class={cx('ui-list', cls)} aria-label={label}>{children}</ul>;
}

export interface ListItemProps {
  children: ComponentChildren;
  icon?: string;
  /** Secondary text on the right (a value, a date). */
  trailing?: ComponentChildren;
  onClick?: () => void;
  selected?: boolean;
  disabled?: boolean;
  class?: string;
}

export function ListItem(p: ListItemProps) {
  const body = (
    <>
      {p.icon && <Icon name={p.icon} size={20} decorative />}
      <span class="ui-list-main">{p.children}</span>
      {p.trailing !== undefined && <span class="ui-list-trail">{p.trailing}</span>}
    </>
  );
  return (
    <li class={cx('ui-listitem', p.selected && 'is-selected', p.disabled && 'is-disabled', p.class)}>
      {p.onClick ? (
        <button type="button" class="ui-listitem-btn" aria-current={p.selected ? 'true' : undefined} disabled={p.disabled} onClick={p.onClick}>{body}</button>
      ) : (
        <div class="ui-listitem-row">{body}</div>
      )}
    </li>
  );
}
