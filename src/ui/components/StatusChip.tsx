// StatusChip, Badge and the status shapes (GDD 08 2.6): every status carries a shape AND a word, never colour alone.
import { Icon } from '../icons';
import { cx } from './cx';

export type StatusKind = 'ok' | 'watch' | 'warn' | 'bad';

/** Shape and word per status (diagnostic wording; alerts use ALERT_WORDS). */
export const STATUS_WORDS: Record<StatusKind, string> = { ok: 'Good', watch: 'Note', warn: 'Strained', bad: 'Failing' };
export const ALERT_LEVEL_STATUS = { info: 'ok', notice: 'watch', warning: 'warn', critical: 'bad' } as const;
export const ALERT_WORDS = { info: 'Note', notice: 'Notice', warning: 'Warning', critical: 'Critical' } as const;
export type AlertLevel = keyof typeof ALERT_LEVEL_STATUS;

export interface StatusChipProps {
  status: StatusKind;
  /** Override the word (default from STATUS_WORDS). */
  word?: string;
  class?: string;
}

export function StatusChip({ status, word, class: cls }: StatusChipProps) {
  return (
    <span class={cx('ui-chip', `is-${status}`, cls)}>
      <Icon name={`status-${status}`} size={16} decorative />
      <span>{word ?? STATUS_WORDS[status]}</span>
    </span>
  );
}

export interface BadgeProps {
  count: number;
  class?: string;
}

/** Count badge, capped at "99+". */
export function Badge({ count, class: cls }: BadgeProps) {
  return <span class={cx('ui-badge', cls)} aria-label={`${count} more`}>{count > 99 ? '99+' : String(count)}</span>;
}
