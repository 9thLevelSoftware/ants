// Sparkline of a diagnostic (GDD 08 2.7): 72 x 20 dp, 3 game days, no axis. The accessible name carries the first and
// the last value and the minimum / maximum, the tooltip-less equivalent of "tooltip shows min/max".
import { loads } from '../../hud/format';

const W = 72, H = 20;

export interface DiagSparkProps {
  values: readonly number[];
  /** What the series is ("Carbohydrate intake"). */
  label: string;
  tone?: 'ok' | 'info' | 'warn' | 'bad';
}

export function DiagSpark({ values, label, tone = 'ok' }: DiagSparkProps) {
  if (values.length < 2) return <span class="pn-spark is-empty" role="img" aria-label={`${label}: no history yet`} />;
  const lo = Math.min(...values), hi = Math.max(...values);
  const span = hi - lo || 1;
  const x = (i: number): number => (i / (values.length - 1)) * (W - 4) + 2;
  const y = (v: number): number => H - 3 - ((v - lo) / span) * (H - 6);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = values[values.length - 1];
  return (
    <span class={`pn-spark tone-${tone}`} role="img" aria-label={`${label}, last 3 game days: from ${loads(values[0])} to ${loads(last)}, lowest ${loads(lo)}, highest ${loads(hi)}`}>
      <svg viewBox={`0 0 ${W} ${H}`} width={`${W / 16}rem`} height={`${H / 16}rem`} aria-hidden="true">
        <polyline points={pts} fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />
        <circle cx={x(values.length - 1)} cy={y(last)} r="2" fill="currentColor" />
      </svg>
    </span>
  );
}
