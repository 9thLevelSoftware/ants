// Toast / AlertItem (GDD 08 2.7, 6.2): a card with a status shape, the level word, a title (<= 48 chars), an
// optional cause line and count. `warning` and `critical` are announced assertively, the rest politely.
import { Icon } from '../icons';
import { cx } from './cx';
import { IconButton } from './Button';
import { ALERT_LEVEL_STATUS, ALERT_WORDS, type AlertLevel } from './StatusChip';

export interface AlertItemProps {
  level: AlertLevel;
  title: string;
  cause?: string;
  count?: number;
  resolved?: boolean;
  onDismiss?: () => void;
  onActivate?: () => void;
  class?: string;
}

export function AlertItem(p: AlertItemProps) {
  const status = ALERT_LEVEL_STATUS[p.level];
  const urgent = p.level === 'warning' || p.level === 'critical';
  const body = (
    <>
      <span class={cx('ui-alert-shape', `is-${status}`)}><Icon name={`status-${status}`} size={20} decorative /></span>
      <span class="ui-alert-text">
        <span class="ui-alert-head">
          <span class="ui-alert-word">{ALERT_WORDS[p.level]}</span>
          {p.count && p.count > 1 && <span class="ui-alert-count">x{p.count}</span>}
          {p.resolved && <span class="ui-alert-resolved">Resolved</span>}
        </span>
        <span class="ui-alert-title">{p.title}</span>
        {p.cause && <span class="ui-alert-cause">{p.cause}</span>}
      </span>
    </>
  );
  return (
    <div class={cx('ui-alert', `is-${p.level}`, p.resolved && 'is-resolved', p.class)} role={urgent ? 'alert' : 'status'}>
      {p.onActivate ? <button type="button" class="ui-alert-main" onClick={p.onActivate}>{body}</button> : <div class="ui-alert-main">{body}</div>}
      {p.onDismiss && <IconButton icon="close" label="Dismiss" onClick={p.onDismiss} />}
    </div>
  );
}
