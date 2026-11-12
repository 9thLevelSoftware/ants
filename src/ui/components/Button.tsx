// Button and IconButton (GDD 08 2.7). Variants primary / secondary / ghost / danger. A disabled button without an
// explanation is truly disabled (not focusable); with `disabledReason` it stays focusable, announces
// aria-disabled and shows the reason as a tooltip, so a keyboard user can find out why.
import type { ComponentChildren } from 'preact';
import { Icon } from '../icons';
import { cx } from './cx';
import { Tooltip } from './Tooltip';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
/** Demo/test: draw a pseudo-state without real interaction. */
export type ForcedState = 'hover' | 'active' | 'focus';

export interface ButtonProps {
  variant?: ButtonVariant;
  icon?: string;
  busy?: boolean;
  disabled?: boolean;
  /** Why the button is disabled; keeps it focusable. */
  disabledReason?: string;
  onClick?: (e: MouseEvent) => void;
  type?: 'button' | 'submit';
  autoFocus?: boolean;
  class?: string;
  id?: string;
  'aria-label'?: string;
  'aria-haspopup'?: 'dialog' | 'menu' | 'listbox';
  'data-testid'?: string;
  forceState?: ForcedState;
  /** Fill the width of the container (menu rows). */
  block?: boolean;
  children?: ComponentChildren;
}

export function Button(p: ButtonProps) {
  const reason = p.disabled ? p.disabledReason : undefined;
  const hardDisabled = !!p.disabled && !reason;
  const blocked = !!p.disabled || !!p.busy;
  const button = (
    <button
      type={p.type ?? 'button'}
      id={p.id}
      class={cx('ui-btn', `ui-btn--${p.variant ?? 'secondary'}`, p.block && 'is-block', p.busy && 'is-busy', p.forceState && `is-${p.forceState}`, p.class)}
      disabled={hardDisabled}
      aria-disabled={p.disabled && reason ? 'true' : undefined}
      aria-busy={p.busy ? 'true' : undefined}
      aria-label={p['aria-label']}
      aria-haspopup={p['aria-haspopup']}
      data-testid={p['data-testid']}
      autofocus={p.autoFocus}
      onClick={(e: MouseEvent) => { if (!blocked) p.onClick?.(e); else e.preventDefault(); }}
    >
      {p.busy ? <span class="ui-spinner" aria-hidden="true" /> : p.icon ? <Icon name={p.icon} size={20} decorative /> : null}
      {p.children !== undefined && p.children !== null && <span class="ui-btn-label">{p.children}</span>}
    </button>
  );
  return reason ? <Tooltip text={reason} placement="top">{button}</Tooltip> : button;
}

export interface IconButtonProps {
  icon: string;
  /** Accessible name; also the tooltip text. */
  label: string;
  onClick?: (e: MouseEvent) => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  disabledReason?: string;
  class?: string;
  id?: string;
  pressed?: boolean;
  forceState?: ForcedState;
  'data-testid'?: string;
  tooltipPlacement?: 'top' | 'bottom';
}

export function IconButton(p: IconButtonProps) {
  const reason = p.disabled ? p.disabledReason : undefined;
  const hardDisabled = !!p.disabled && !reason;
  return (
    <Tooltip text={reason ? `${p.label}: ${reason}` : p.label} placement={p.tooltipPlacement ?? 'top'}>
      <button
        type="button"
        id={p.id}
        class={cx('ui-btn', 'ui-iconbtn', `ui-btn--${p.variant ?? 'ghost'}`, p.forceState && `is-${p.forceState}`, p.class)}
        aria-label={p.label}
        aria-pressed={p.pressed === undefined ? undefined : p.pressed ? 'true' : 'false'}
        aria-disabled={p.disabled && reason ? 'true' : undefined}
        disabled={hardDisabled}
        data-testid={p['data-testid']}
        onClick={(e: MouseEvent) => { if (!p.disabled) p.onClick?.(e); else e.preventDefault(); }}
      >
        <Icon name={p.icon} size={20} decorative />
      </button>
    </Tooltip>
  );
}
