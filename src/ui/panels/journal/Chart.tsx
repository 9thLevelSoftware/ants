// A journal graph (GDD 08 7.2 "Graph rules"): x axis in game days with season bands (glyph and word, not colour alone), y axis
// with its unit, series in Okabe-Ito colours each with its own dash pattern, a vertical cursor with a value table, and the
// arrow keys move the cursor by one sample. Stacked areas, lines and per-day stacked bars share one drawing routine.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { ICON_PATHS } from '../../icons/paths';
import { SEASON_ICON } from '../../hud/format';
import { CHART_DASHES, OKABE_ITO } from '../balance';
import { cursorAt, dayLabel, type ChartModel } from './charts';
import { linear, tickLabel, valueText } from './scales';

const W = 840, H = 312;
const M = { l: 58, r: 14, t: 10, b: 66 };
const BAND_H = 18;

export interface ChartProps {
  model: ChartModel;
  /** Days per season: day labels count the day of the season, like the date lines. */
  seasonLength: number;
}

/** Steps (in days) an x axis may use: 1, 2, 3, 6, 12 hours, then whole days. */
const X_STEPS = [1 / 24, 2 / 24, 3 / 24, 6 / 24, 12 / 24, 1, 2, 5, 10, 20, 50, 100];

/** x ticks at round hours or whole days, about 6 of them. */
function xTicks(x0: number, x1: number): { ticks: number[]; step: number } {
  const span = x1 - x0;
  const step = X_STEPS.find((s) => span / s <= 7) ?? 365;
  const ticks: number[] = [];
  for (let v = Math.ceil(x0 / step - 1e-9) * step; v <= x1 + 1e-9; v += step) ticks.push(Math.round(v / step) * step);
  return { ticks, step };
}

/** "Day 12" for a day tick; "06:00" (with the day at midnight and at the first tick) for an hour tick. */
function tickText(j: { seasonLength: number }, t: number, step: number, first: boolean): string {
  if (step >= 1) return dayLabel(j, t);
  const hours = Math.round((t % 1) * 24) % 24;
  const clock = `${String(hours).padStart(2, '0')}:00`;
  return hours === 0 || first ? `${dayLabel(j, t)} ${clock}` : clock;
}

export function Chart({ model, seasonLength }: ChartProps) {
  const [cursor, setCursor] = useState<number>(-1);
  const ref = useRef<SVGSVGElement>(null);
  const m = model;
  const px = useMemo(() => linear(m.x0, m.x1, M.l, W - M.r), [m.x0, m.x1]);
  const py = useMemo(() => linear(m.y.min, m.y.max, H - M.b, M.t), [m.y.min, m.y.max]);
  useEffect(() => { setCursor(-1); }, [m.def.id, m.scale, m.xs.length]);
  if (m.empty) {
    return <p class="pn-empty" data-testid="chart-empty">There are no readings for this graph yet. The colony is sampled once every game hour.</p>;
  }
  const labelJ = { seasonLength };
  const cur = cursor >= 0 ? cursorAt(m, m.xs[Math.min(cursor, m.xs.length - 1)]) : null;
  const onMove = (e: MouseEvent): void => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    const x = ((e.clientX - r.left) / r.width) * W;
    const t = (x - M.l) / (W - M.l - M.r);
    const day = m.x0 + Math.max(0, Math.min(1, t)) * (m.x1 - m.x0);
    const c = cursorAt(m, day);
    setCursor(c ? c.index : -1);
  };
  const onKey = (e: KeyboardEvent): void => {
    const n = m.xs.length;
    if (e.key === 'ArrowLeft') { e.preventDefault(); setCursor((c) => (c < 0 ? n - 1 : Math.max(0, c - 1))); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); setCursor((c) => (c < 0 ? n - 1 : Math.min(n - 1, c + 1))); }
    else if (e.key === 'Home') { e.preventDefault(); setCursor(0); }
    else if (e.key === 'End') { e.preventDefault(); setCursor(n - 1); }
    else if (e.key === 'Escape' && cursor >= 0) { e.preventDefault(); e.stopPropagation(); setCursor(-1); }
  };
  const barW = m.scale === 'daily' ? Math.max(2, (px(m.x0 + 1) - px(m.x0)) * 0.78) : 3;
  const colour = (i: number): string => OKABE_ITO[i % OKABE_ITO.length];
  const stacked = m.def.kind !== 'line';
  const { ticks, step: xStep } = xTicks(m.x0, m.x1);
  const bandY = H - M.b + 30;
  return (
    <div class="pn-chart" data-testid="chart" data-chart={m.def.id} data-kind={m.def.kind} data-scale={m.scale}>
      <div
        class="pn-chart-focus" tabIndex={0} role="group" onKeyDown={onKey}
        aria-label={`${m.def.label}, ${m.def.unit}. Use the left and right arrow keys to move along the graph.`}
        data-testid="chart-focus"
      >
        <svg ref={ref} viewBox={`0 0 ${W} ${H}`} class="pn-chart-svg" role="img" aria-label={`${m.def.label} (${m.def.unit}) over game days`} onMouseMove={onMove} onMouseLeave={() => setCursor(-1)}>
          {m.bands.map((b, i) => (
            <rect key={`b${i}`} x={px(b.from)} y={M.t} width={Math.max(0, px(b.to) - px(b.from))} height={H - M.b - M.t} class={`pn-band is-${b.season % 2}`} />
          ))}
          {m.y.ticks.map((t) => (
            <g key={`y${t}`}>
              <line x1={M.l} x2={W - M.r} y1={py(t)} y2={py(t)} class="pn-grid" />
              <text x={M.l - 8} y={py(t) + 4} text-anchor="end" class="pn-axis-text">{tickLabel(t, m.y.step)}</text>
            </g>
          ))}
          <text transform={`translate(14 ${(M.t + H - M.b) / 2}) rotate(-90)`} text-anchor="middle" class="pn-axis-title">{m.def.unit}</text>
          <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} class="pn-axis" />
          <line x1={M.l} x2={M.l} y1={M.t} y2={H - M.b} class="pn-axis" />
          {ticks.map((t, ti) => (
            <g key={`x${t}`}>
              <line x1={px(t)} x2={px(t)} y1={H - M.b} y2={H - M.b + 4} class="pn-axis" />
              <text x={px(t)} y={H - M.b + 16} text-anchor="middle" class="pn-axis-text">{tickText(labelJ, t, xStep, ti === 0)}</text>
            </g>
          ))}
          {m.bands.map((b, i) => {
            const x0 = Math.max(M.l, px(b.from)), x1 = Math.min(W - M.r, px(b.to));
            if (x1 - x0 < 4) return null;
            const ic = SEASON_ICON[b.label.toLowerCase()];
            return (
              <g key={`s${i}`} class={`pn-season-strip is-${b.season % 2}`}>
                <rect x={x0} y={bandY - BAND_H / 2} width={x1 - x0} height={BAND_H} />
                {x1 - x0 > 70 && <g transform={`translate(${x0 + 4} ${bandY - 7}) scale(0.58)`} fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" dangerouslySetInnerHTML={{ __html: ICON_PATHS[ic] ?? '' }} />}
                {x1 - x0 > 70 && <text x={x0 + 22} y={bandY + 4} class="pn-axis-text">{b.label}</text>}
              </g>
            );
          })}
          <g clip-path="url(#pn-plot)">
            <defs><clipPath id="pn-plot"><rect x={M.l} y={M.t} width={W - M.l - M.r} height={H - M.b - M.t} /></clipPath></defs>
            {m.def.kind === 'stacked-bars' && m.series.map((s, k) => s.ys.map((v, i) => (
              v > 0 ? <rect key={`${s.id}${i}`} x={px(m.xs[i]) - barW / 2} y={py(s.top[i])} width={barW} height={Math.max(0, py(s.base[i]) - py(s.top[i]))} fill={colour(k)} stroke="#16130F" stroke-width="0.6" /> : null
            )))}
            {m.def.kind === 'stacked-area' && [...m.series].reverse().map((s) => {
              const k = m.series.indexOf(s);
              const top = s.top.map((v, i) => `${px(m.xs[i]).toFixed(1)},${py(v).toFixed(1)}`);
              const base = s.base.map((v, i) => `${px(m.xs[i]).toFixed(1)},${py(v).toFixed(1)}`).reverse();
              return <polygon key={s.id} points={[...top, ...base].join(' ')} fill={colour(k)} fill-opacity="0.5" stroke={colour(k)} stroke-width="1.5" stroke-dasharray={CHART_DASHES[k % CHART_DASHES.length]} />;
            })}
            {m.def.kind === 'line' && m.series.map((s, k) => (
              <polyline key={s.id} points={s.ys.map((v, i) => `${px(m.xs[i]).toFixed(1)},${py(v).toFixed(1)}`).join(' ')} fill="none" stroke={colour(k)} stroke-width="2" stroke-linejoin="round" stroke-dasharray={CHART_DASHES[k % CHART_DASHES.length]} />
            ))}
          </g>
          {cur && <line x1={px(cur.x)} x2={px(cur.x)} y1={M.t} y2={H - M.b} class="pn-cursor" />}
          {cur && !stacked && m.series.map((s, k) => <circle key={s.id} cx={px(cur.x)} cy={py(s.ys[cur.index] ?? 0)} r="3.5" fill={colour(k)} stroke="#16130F" stroke-width="1" />)}
        </svg>
      </div>
      <ul class="pn-legend" aria-label="Series">
        {m.series.map((s, k) => (
          <li key={s.id} data-series={s.id}>
            <svg width="30" height="12" viewBox="0 0 30 12" aria-hidden="true"><line x1="1" y1="6" x2="29" y2="6" stroke={colour(k)} stroke-width="3" stroke-dasharray={CHART_DASHES[k % CHART_DASHES.length]} /></svg>
            {s.mark && <b class="pn-mark">{s.mark}</b>}
            <span>{s.label}</span>
            <span class="pn-legend-now">{valueText(cur ? (s.ys[cur.index] ?? 0) : (s.ys[s.ys.length - 1] ?? 0))}</span>
          </li>
        ))}
      </ul>
      <p class="pn-cursor-line" role="status" aria-live="polite" data-testid="chart-cursor">
        {cur ? `${dayLabel(labelJ, cur.x)}${m.scale === 'hourly' ? `, ${String(Math.floor((cur.x % 1) * 24)).padStart(2, '0')}:00` : ''}` : 'Latest reading shown. Move over the graph or use the arrow keys for a day.'}
      </p>
    </div>
  );
}
