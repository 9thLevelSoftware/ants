// Toggle switch (GDD 08 2.7): track 36 x 20 dp, role="switch", Space / Enter flips it.
import type { ComponentChildren } from 'preact';
import { cx } from './cx';
import { useFieldA11y } from './Field';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Text shown beside the track (also the accessible name when there is no enclosing Field). */
  label?: ComponentChildren;
  'aria-label'?: string;
  disabled?: boolean;
  disabledReason?: string;
  id?: string;
  class?: string;
  forceState?: 'hover' | 'active' | 'focus';
}

export function Toggle(p: ToggleProps) {
  const a11y = useFieldA11y(p['aria-label']);
  const blocked = !!p.disabled;
  return (
    <button
      type="button" role="switch" id={p.id}
      class={cx('ui-toggle', p.checked && 'is-on', p.forceState && `is-${p.forceState}`, p.class)}
      aria-checked={p.checked ? 'true' : 'false'}
      aria-disabled={blocked ? 'true' : undefined}
      title={blocked ? p.disabledReason : undefined}
      {...(p.label ? {} : a11y)}
      onClick={() => { if (!blocked) p.onChange(!p.checked); }}
    >
      <span class="ui-toggle-track" aria-hidden="true"><span class="ui-toggle-thumb" /></span>
      {p.label && <span class="ui-toggle-label">{p.label}</span>}
      <span class="ui-toggle-word" aria-hidden="true">{p.checked ? 'On' : 'Off'}</span>
    </button>
  );
}
