// Slider (GDD 08 2.7): custom role="slider" so the keys match the chapter: arrows = 1 step, PageUp / PageDown =
// 10 steps, Home / End = ends. Pointer drag on the track; a value readout beside it. `onCommit` fires when a
// drag or key burst settles (Directives use a 300 ms commit; Settings applies every change immediately).
import { useRef, useState } from 'preact/hooks';
import { cx } from './cx';
import { useFieldA11y } from './Field';
import { sliderFraction, sliderFromFraction, sliderKey, type SliderRange } from './logic/sliderLogic';

export interface SliderProps extends SliderRange {
  value: number;
  onChange: (value: number) => void;
  /** Text for the readout and aria-valuetext, e.g. (v) => `${v} %`. */
  format?: (value: number) => string;
  'aria-label'?: string;
  disabled?: boolean;
  /** Hide the readout (when the caller shows its own). */
  hideValue?: boolean;
  id?: string;
  class?: string;
  forceState?: 'hover' | 'active' | 'focus';
}

export function Slider(p: SliderProps) {
  const a11y = useFieldA11y(p['aria-label']);
  const track = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const range: SliderRange = { min: p.min, max: p.max, step: p.step };
  const text = p.format ? p.format(p.value) : String(p.value);

  const fromPointer = (e: PointerEvent) => {
    const el = track.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    p.onChange(sliderFromFraction((e.clientX - r.left) / r.width, range));
  };

  return (
    <div class={cx('ui-slider', p.disabled && 'is-disabled', dragging && 'is-active', p.forceState && `is-${p.forceState}`, p.class)}>
      <div
        ref={track} id={p.id} class="ui-slider-track" role="slider" tabIndex={p.disabled ? -1 : 0}
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
        onPointerDown={(e: PointerEvent) => {
          if (p.disabled) return;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          setDragging(true);
          fromPointer(e);
          (e.currentTarget as HTMLElement).focus();
        }}
        onPointerMove={(e: PointerEvent) => { if (dragging) fromPointer(e); }}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
      >
        <div class="ui-slider-rail" aria-hidden="true">
          <div class="ui-slider-fill" style={{ width: `${sliderFraction(p.value, range) * 100}%` }} />
        </div>
        <div class="ui-slider-thumb" aria-hidden="true" style={{ left: `${sliderFraction(p.value, range) * 100}%` }} />
      </div>
      {!p.hideValue && <span class="ui-slider-value" aria-hidden="true">{text}</span>}
    </div>
  );
}
