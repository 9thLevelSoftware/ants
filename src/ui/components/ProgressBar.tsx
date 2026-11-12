// ProgressBar (GDD 08 2.7): determinate or staged (loading, founding readiness). Staged bars show segment
// boundaries at the stage weights and tint the finished stages; the numeric value is always available as text.
import { cx } from './cx';
import { useFieldA11y } from './Field';

export interface ProgressBarProps {
  /** 0..1 */
  value: number;
  /** Stage weights (any positive numbers); draws one segment per stage. */
  stages?: readonly number[];
  'aria-label'?: string;
  /** Text for assistive tech, e.g. "Heightfield, 34 %". */
  valueText?: string;
  class?: string;
  /** Thin variant (the 2 dp boot line). */
  thin?: boolean;
}

export function ProgressBar(p: ProgressBarProps) {
  const a11y = useFieldA11y(p['aria-label']);
  const v = Math.min(1, Math.max(0, p.value));
  const total = p.stages ? p.stages.reduce((a, b) => a + b, 0) : 0;
  return (
    <div
      class={cx('ui-progress', p.thin && 'is-thin', p.stages && 'is-staged', p.class)} role="progressbar"
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)} aria-valuetext={p.valueText ?? `${Math.round(v * 100)} %`} {...a11y}
    >
      <div class="ui-progress-fill" style={{ width: `${v * 100}%` }} />
      {p.stages && (
        <div class="ui-progress-ticks" aria-hidden="true">
          {p.stages.map((w, i) => <span key={i} style={{ width: `${(w / total) * 100}%` }} />)}
        </div>
      )}
    </div>
  );
}
