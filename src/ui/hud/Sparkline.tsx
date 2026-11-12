// Sparkline (GDD 08 2.7): 72 x 20 dp, no axis; the accessible name carries the minimum and maximum. Drawn as one
// SVG polyline in the nutrient colour; pairs with a letter next to it, so colour is never the only carrier.
import { loads } from './format';

export interface SparklineProps {
  values: readonly number[];
  label: string;
  tone: 'c' | 'p';
}

const W = 72, H = 20;

export function Sparkline({ values, label, tone }: SparklineProps) {
  if (values.length < 2) return <span class="fd-spark is-empty" role="img" aria-label={`${label}: no history yet`} />;
  const lo = Math.min(...values), hi = Math.max(...values);
  const span = hi - lo || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * (W - 2) + 1).toFixed(1)},${(H - 2 - ((v - lo) / span) * (H - 4)).toFixed(1)}`).join(' ');
  return (
    <span class="fd-spark" role="img" aria-label={`${label}: from ${loads(lo)} to ${loads(hi)}`}>
      <span class={`fd-stat-letter tone-${tone}`} aria-hidden="true">{tone === 'c' ? 'C' : 'P'}</span>
      <svg viewBox={`0 0 ${W} ${H}`} width={`${W / 16}rem`} height={`${H / 16}rem`} class={`tone-${tone}`} aria-hidden="true">
        <polyline points={pts} fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />
      </svg>
    </span>
  );
}
