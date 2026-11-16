// The epitaph's history graph (GDD 06 §13.5): workers, brood by stage and stores over the colony's life, with season
// bands under the axis, milestone ticks and the queen's death mark. A small inline SVG, no chart library.
import type { EpitaphGraph } from './store';

const W = 640, H = 200, PAD_L = 34, PAD_B = 22, PAD_T = 8;
/** Room the 'queen died' label needs right of its mark, px (viewBox units). */
const LABEL_W = 80;
const SEASON_FILL = ['#7fa36b', '#c9b25a', '#b9774a', '#8fa2b3'];

function path(values: number[], max: number, n: number): string {
  if (values.length === 0 || max <= 0) return '';
  const x = (i: number) => PAD_L + (i / Math.max(1, n - 1)) * (W - PAD_L - 6);
  const y = (v: number) => PAD_T + (1 - v / max) * (H - PAD_T - PAD_B);
  return values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
}

export function HistoryGraph({ g }: { g: EpitaphGraph }) {
  const n = Math.max(2, g.days);
  const brood = g.series.eggs.map((e, i) => e + (g.series.larvae[i] ?? 0) + (g.series.pupae[i] ?? 0));
  const maxPop = Math.max(1, ...g.series.workers, ...brood);
  const maxStore = Math.max(1, ...g.series.storesC, ...g.series.storesP);
  const x = (i: number) => PAD_L + (i / Math.max(1, n - 1)) * (W - PAD_L - 6);
  const bands = [];
  for (let i = 0; i < n; i++) {
    const day = g.sampleDays?.[i] ?? g.startDay + i; // the calendar jumps over the winter: samples carry their day
    const season = Math.floor((day % (4 * g.seasonLength)) / g.seasonLength);
    bands.push(<rect key={i} x={x(i)} y={H - PAD_B + 4} width={(W - PAD_L - 6) / n + 0.5} height="6" fill={SEASON_FILL[season]} />);
  }
  return (
    <svg class="ep-graph" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Colony history" data-testid="epitaph-graph">
      <line x1={PAD_L} y1={H - PAD_B} x2={W - 6} y2={H - PAD_B} class="ep-axis" />
      <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} class="ep-axis" />
      <text x={PAD_L - 4} y={PAD_T + 8} class="ep-tick" text-anchor="end">{Math.round(maxPop)}</text>
      <text x={PAD_L - 4} y={H - PAD_B} class="ep-tick" text-anchor="end">0</text>
      {bands}
      <path d={path(g.series.storesC, maxStore, n)} class="ep-line ep-c" />
      <path d={path(g.series.storesP, maxStore, n)} class="ep-line ep-p" />
      <path d={path(brood, maxPop, n)} class="ep-line ep-brood" />
      <path d={path(g.series.workers, maxPop, n)} class="ep-line ep-workers" />
      {g.milestones.map((m) => <line key={m.id} x1={x(m.day)} x2={x(m.day)} y1={H - PAD_B} y2={H - PAD_B - 6} class="ep-mark" />)}
      {g.queenDeathDay !== null && (
        <g>
          <line x1={x(g.queenDeathDay)} x2={x(g.queenDeathDay)} y1={PAD_T} y2={H - PAD_B} class="ep-queen" />
          {/* the label sits left of the mark near the right edge so it is not clipped */}
          {x(g.queenDeathDay) > W - LABEL_W
            ? <text x={x(g.queenDeathDay) - 3} y={PAD_T + 10} class="ep-tick" text-anchor="end">queen died</text>
            : <text x={x(g.queenDeathDay) + 3} y={PAD_T + 10} class="ep-tick">queen died</text>}
        </g>
      )}
    </svg>
  );
}
