// Meter (GDD 08 2.7): single, stacked (C / P crop) and reserve (queen) forms, with an optional trend arrow. Colour
// is never the only carrier: tones come with the letter (C / P) or the label, trends with an arrow shape and word.
import { Icon } from '../icons';
import { cx } from './cx';
import { TREND_WORDS, trendIcon, type Trend } from './logic/trend';

export type MeterTone = 'neutral' | 'c' | 'p' | 'ok' | 'warn' | 'bad';

export interface MeterSegment {
  value: number;
  tone: MeterTone;
  /** Short mark drawn inside / beside the segment: the letter C or P. */
  mark?: string;
}

export interface MeterProps {
  label: string;
  /** Single meter: value 0..max. */
  value?: number;
  max?: number;
  tone?: MeterTone;
  /** Stacked meter: segments adding up to at most `max`. */
  segments?: readonly MeterSegment[];
  trend?: Trend;
  /** Readout beside the bar, e.g. "7.4". */
  text?: string;
  class?: string;
  /** Reserve form: a thin bar with a low-reserve notch. */
  reserve?: boolean;
}

export function Meter(p: MeterProps) {
  const max = p.max ?? 1;
  const segs: readonly MeterSegment[] = p.segments ?? [{ value: p.value ?? 0, tone: p.tone ?? 'neutral' }];
  const total = segs.reduce((a, s) => a + s.value, 0);
  return (
    <div
      class={cx('ui-meter', p.reserve && 'is-reserve', p.class)} role="meter" aria-label={p.label}
      aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(max, total)}
      aria-valuetext={`${p.text ?? Math.round((total / max) * 100) + ' %'}${p.trend ? `, ${TREND_WORDS[p.trend]}` : ''}`}
    >
      <span class="ui-meter-label" aria-hidden="true">{p.label}</span>
      <div class="ui-meter-bar" aria-hidden="true">
        {segs.map((s, i) => (
          <div key={i} class={cx('ui-meter-seg', `tone-${s.tone}`)} style={{ width: `${Math.min(100, (s.value / max) * 100)}%` }}>
            {s.mark && <span class="ui-meter-mark">{s.mark}</span>}
          </div>
        ))}
        {p.reserve && <span class="ui-meter-notch" />}
      </div>
      {(p.text !== undefined || p.trend) && (
        <span class="ui-meter-text" aria-hidden="true">
          {p.text}
          {p.trend && <Icon name={trendIcon(p.trend)} size={16} decorative class={`trend-${p.trend}`} />}
        </span>
      )}
    </div>
  );
}
