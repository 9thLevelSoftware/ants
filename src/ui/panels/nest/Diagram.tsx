// The schematic side elevation of the nest (GDD 08 4.6): 368 x 300 dp. Chambers are rounded rectangles with their type icon
// and a 4-step pattern shading for how full they are (pattern density, not colour); tunnels are 2 dp lines (dashed
// where the link is inferred); entrances are notches on the ground line; mounds are humps. It is a picture of the same data
// as the table below it, so it is a single labelled image for assistive technology.
import { ICON_PATHS } from '../../icons/paths';
import { NEST_OCCUPANCY_STEPS } from '../balance';
import { chamberWord, type Schematic } from './model';

const STEP_WORD = ['Empty', 'A little', 'About half', 'Full'];

function SvgIcon({ name, x, y, size }: { name: string; x: number; y: number; size: number }) {
  const k = size / 24;
  return <g transform={`translate(${x - size / 2} ${y - size / 2}) scale(${k})`} fill="none" stroke="currentColor" stroke-width={1.5 / k > 3 ? 3 : 1.5} stroke-linecap="round" stroke-linejoin="round" dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] ?? '' }} />;
}

/** Pattern definitions of the shading steps (density of dots); `prefix` keeps the ids of the diagram and of each key swatch unique. */
export function OccupancyDefs({ prefix }: { prefix: string }) {
  return (
    <defs>
      {[1, 2, 3].map((s) => {
        const gap = [0, 9, 6, 4][s];
        return (
          <pattern key={s} id={`${prefix}-${s}`} width={gap} height={gap} patternUnits="userSpaceOnUse">
            <circle cx={gap / 2} cy={gap / 2} r={s === 3 ? 1.5 : 1.1} fill="currentColor" />
          </pattern>
        );
      })}
    </defs>
  );
}

export function OccupancyKey() {
  return (
    <ul class="pn-occ-key" aria-label="How full a chamber is">
      {Array.from({ length: NEST_OCCUPANCY_STEPS }, (_, s) => (
        <li key={s}>
          <svg width="28" height="16" viewBox="0 0 28 16" aria-hidden="true">
            <OccupancyDefs prefix={`pn-occ-key${s}`} />
            <rect x="1" y="1" width="26" height="14" rx="5" fill={s === 0 ? 'none' : `url(#pn-occ-key${s}-${s})`} stroke="currentColor" stroke-width="1.2" />
          </svg>
          <span>{STEP_WORD[s]}</span>
        </li>
      ))}
    </ul>
  );
}

export interface DiagramProps {
  layout: Schematic;
  selected: number;
  onPick: (chamberId: number) => void;
  label: string;
}

export function NestDiagram({ layout: L, selected, onPick, label }: DiagramProps) {
  return (
    <svg class="pn-diagram" viewBox={`0 0 ${L.w} ${L.h}`} role="img" aria-label={label} data-testid="nest-diagram" data-chambers={L.chambers.length}>
      <OccupancyDefs prefix="pn-occ" />
      <rect x="0" y="0" width={L.w} height={L.ground} class="pn-sky" />
      <rect x="0" y={L.ground} width={L.w} height={L.h - L.ground} class="pn-soil" />
      <line x1="0" y1={L.ground} x2={L.w} y2={L.ground} class="pn-ground" />
      {L.entrances.map((e) => (
        <g key={`e${e.id}`} data-entrance={e.id}>
          {e.mound > 0 && <path d={`M${e.x - e.mound * 1.8} ${L.ground} Q${e.x} ${L.ground - e.mound * 1.7} ${e.x + e.mound * 1.8} ${L.ground}`} class="pn-mound" />}
          <rect x={e.x - 3} y={L.ground - 1} width="6" height="7" class={`pn-notch${e.status === 'open' ? '' : ' is-closed'}`} />
          {e.status !== 'open' && <line x1={e.x - 5} y1={L.ground + 8} x2={e.x + 5} y2={L.ground + 8} class="pn-plug" />}
        </g>
      ))}
      {L.links.map((k, i) => (
        <polyline key={i} points={k.pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} class={`pn-tunnel${k.kind === 'inferred' ? ' is-inferred' : ''}`} fill="none" />
      ))}
      {L.chambers.map((c) => (
        <g key={c.id} class={`pn-chamber${selected === c.id ? ' is-selected' : ''}`} data-chamber={c.id} data-step={c.step} onClick={() => onPick(c.id)}>
          <title>{`${chamberWord(c.type)} ${c.id}: ${STEP_WORD[c.step].toLowerCase()}`}</title>
          <rect x={c.x - c.rx} y={c.y - c.ry} width={c.rx * 2} height={c.ry * 2} rx={Math.min(c.ry, 9)} class="pn-room" />
          {c.step > 0 && <rect x={c.x - c.rx} y={c.y - c.ry} width={c.rx * 2} height={c.ry * 2} rx={Math.min(c.ry, 9)} fill={`url(#pn-occ-${c.step})`} class="pn-room-fill" />}
          <SvgIcon name={`chamber-${c.type}`} x={c.x} y={c.y} size={Math.min(18, c.ry * 1.6)} />
        </g>
      ))}
      <text x="8" y="14" class="pn-diagram-cap">Surface</text>
      <g class="pn-scale" transform={`translate(${L.w - 8} ${L.h - 8})`}>
        <line x1={-L.scale * 10} y1="0" x2="0" y2="0" />
        <text x="-4" y="-4" text-anchor="end">10 BU</text>
      </g>
    </svg>
  );
}
