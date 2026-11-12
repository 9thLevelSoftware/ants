// Stepper: a number with minus / plus buttons. The container is the single tab stop (role="spinbutton"); Up / Down
// and PageUp / PageDown change the value, the buttons are for the mouse.
import { Icon } from '../icons';
import { cx } from './cx';
import { useFieldA11y } from './Field';
import { snapToStep, sliderKey, type SliderRange } from './logic/sliderLogic';

export interface StepperProps extends SliderRange {
  value: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
  'aria-label'?: string;
  disabled?: boolean;
  class?: string;
  id?: string;
}

export function Stepper(p: StepperProps) {
  const a11y = useFieldA11y(p['aria-label']);
  const range: SliderRange = { min: p.min, max: p.max, step: p.step };
  const text = p.format ? p.format(p.value) : String(p.value);
  const bump = (dir: 1 | -1) => { if (!p.disabled) p.onChange(snapToStep(p.value + dir * p.step, range)); };
  return (
    <div
      id={p.id} class={cx('ui-stepper', p.disabled && 'is-disabled', p.class)} role="spinbutton" tabIndex={p.disabled ? -1 : 0}
      aria-valuemin={p.min} aria-valuemax={p.max} aria-valuenow={p.value} aria-valuetext={text}
      aria-disabled={p.disabled ? 'true' : undefined}
      {...a11y}
      onKeyDown={(e: KeyboardEvent) => {
        if (p.disabled) return;
        const next = sliderKey(p.value, e.key, range);
        if (next === null) return;
        e.preventDefault();
        if (next !== p.value) p.onChange(next);
      }}
    >
      <button type="button" tabIndex={-1} class="ui-stepper-btn" aria-label="Decrease" disabled={p.disabled || p.value <= p.min} onClick={() => bump(-1)}>
        <Icon name="minus" size={16} decorative />
      </button>
      <span class="ui-stepper-value" aria-hidden="true">{text}</span>
      <button type="button" tabIndex={-1} class="ui-stepper-btn" aria-label="Increase" disabled={p.disabled || p.value >= p.max} onClick={() => bump(1)}>
        <Icon name="plus" size={16} decorative />
      </button>
    </div>
  );
}
