// EmptyState: an icon, a short statement and an optional action, for lists with nothing in them yet.
import type { ComponentChildren } from 'preact';
import { Icon } from '../icons';
import { cx } from './cx';

export interface EmptyStateProps {
  icon?: string;
  title: string;
  children?: ComponentChildren;
  action?: ComponentChildren;
  class?: string;
}

export function EmptyState({ icon = 'leaf', title, children, action, class: cls }: EmptyStateProps) {
  return (
    <div class={cx('ui-empty', cls)}>
      <Icon name={icon} size={32} decorative />
      <p class="ui-empty-title">{title}</p>
      {children && <p class="ui-empty-text">{children}</p>}
      {action && <div class="ui-empty-action">{action}</div>}
    </div>
  );
}
