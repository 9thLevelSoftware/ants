// A field-notebook plate: a line sketch of a worker ant seen from above, with a caption. Used on the New Game
// species cards and on the Loading screen. Original line work; proportions follow the genus (head size, number
// of waist nodes, spines) so the four species read apart. Pure SVG, no assets.
import type { SpeciesId } from '@/sim/types';

interface Build {
  /** head half-width / half-height, thorax length, gaster half-width / half-height */
  hw: number; hh: number; thorax: number; gw: number; gh: number;
  nodes: 1 | 2;
  spines: boolean;
  /** mandible length */
  mand: number;
  /** overall scale of the whole animal */
  scale: number;
}

const BUILDS: Record<SpeciesId, Build> = {
  'lasius-niger': { hw: 9, hh: 10, thorax: 24, gw: 15, gh: 20, nodes: 1, spines: false, mand: 5, scale: 1 },
  'camponotus-pennsylvanicus': { hw: 12, hh: 13, thorax: 30, gw: 19, gh: 25, nodes: 1, spines: false, mand: 8, scale: 1.08 },
  'messor-barbarus': { hw: 12, hh: 12, thorax: 27, gw: 17, gh: 22, nodes: 2, spines: false, mand: 7, scale: 1 },
  'atta-texana': { hw: 10, hh: 11, thorax: 28, gw: 15, gh: 22, nodes: 2, spines: true, mand: 6, scale: 1.02 },
};

/** Standard worker length in mm (the species' body unit, design seed section 3). */
const BU_MM: Record<SpeciesId, number> = { 'lasius-niger': 4, 'camponotus-pennsylvanicus': 9, 'messor-barbarus': 7, 'atta-texana': 7 };

/** Head-top to gaster-tip length of the sketch in its own units (excluding antennae and mandibles). */
function bodyLength(b: Build): number {
  const headY = 24, thBot = headY + b.hh - 1 + b.thorax, nodeY = thBot + 3;
  const gasterY = nodeY + (b.nodes === 2 ? 11 : 7) + b.gh;
  return gasterY + b.gh - (headY - b.hh);
}

export interface AntPlateProps {
  species: SpeciesId;
  /** Draw the plate frame, caption and scale bar (Loading); cards use the bare sketch. */
  framed?: boolean;
  caption?: string;
  class?: string;
}

function Sketch({ b }: { b: Build }) {
  // vertical layout in a 100 x 150 box, head at the top
  const cx = 50;
  const headY = 24;
  const thTop = headY + b.hh - 1;
  const thBot = thTop + b.thorax;
  const nodeY = thBot + 3;
  const gasterY = nodeY + (b.nodes === 2 ? 11 : 7) + b.gh;
  const leg = (side: 1 | -1, y: number, reach: number, drop: number) => {
    const x0 = cx + side * 6;
    const kx = cx + side * (6 + reach), ky = y - 10 + drop;
    const fx = cx + side * (12 + reach * 1.5), fy = y + 12 + drop * 1.6;
    return `M${x0} ${y} L${kx} ${ky} L${fx} ${fy} l${side * 3} 7`;
  };
  const ly = [thTop + b.thorax * 0.18, thTop + b.thorax * 0.5, thTop + b.thorax * 0.82];
  return (
    <g fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" transform={`translate(0 16) translate(50 66) scale(${b.scale}) translate(-50 -66)`}>
      {/* legs first so the body overlaps them */}
      {[1, -1].map((s) => (
        <g key={s} stroke-width="0.9">
          <path d={leg(s as 1 | -1, ly[0], 16, -6)} />
          <path d={leg(s as 1 | -1, ly[1], 20, 2)} />
          <path d={leg(s as 1 | -1, ly[2], 17, 10)} />
        </g>
      ))}
      {/* antennae: scape, elbow, funiculus */}
      {[1, -1].map((s) => (
        <path key={s} d={`M${cx + s * 4} ${headY - b.hh + 3} L${cx + s * 14} ${headY - b.hh - 10} L${cx + s * 8} ${headY - b.hh - 26} q${s * 3} -6 ${s * 10} -9`} stroke-width="0.9" />
      ))}
      {/* mandibles */}
      {[1, -1].map((s) => <path key={s} d={`M${cx + s * 3} ${headY - b.hh + 1} q${s * 4} -${b.mand} ${s * b.mand * 0.55} -${b.mand + 1}`} />)}
      {/* head */}
      <ellipse cx={cx} cy={headY} rx={b.hw} ry={b.hh} />
      <circle cx={cx - b.hw + 2} cy={headY - 2} r="2.1" />
      <circle cx={cx + b.hw - 2} cy={headY - 2} r="2.1" />
      <path d={`M${cx - b.hw * 0.5} ${headY + 3} q${b.hw * 0.5} 4 ${b.hw} 0`} stroke-width="0.7" />
      {/* thorax: pronotum, mesonotum, propodeum */}
      <ellipse cx={cx} cy={thTop + b.thorax * 0.17} rx="6.6" ry={b.thorax * 0.2} />
      <ellipse cx={cx} cy={thTop + b.thorax * 0.5} rx="5.6" ry={b.thorax * 0.17} />
      <ellipse cx={cx} cy={thTop + b.thorax * 0.82} rx="5" ry={b.thorax * 0.2} />
      {b.spines && (
        <g stroke-width="0.9">
          <path d={`M${cx - 4} ${thBot - 4} l-6 6M${cx + 4} ${thBot - 4} l6 6`} />
          <path d={`M${cx - 7} ${thTop + b.thorax * 0.34} l-5 -3M${cx + 7} ${thTop + b.thorax * 0.34} l5 -3`} />
        </g>
      )}
      {/* waist */}
      <circle cx={cx} cy={nodeY + 2} r="2.6" />
      {b.nodes === 2 && <circle cx={cx} cy={nodeY + 9} r="2.4" />}
      {/* gaster with banding */}
      <ellipse cx={cx} cy={gasterY} rx={b.gw} ry={b.gh} />
      <path d={`M${cx - b.gw * 0.8} ${gasterY - b.gh * 0.35} q${b.gw * 0.8} 5 ${b.gw * 1.6} 0M${cx - b.gw * 0.95} ${gasterY} q${b.gw * 0.95} 6 ${b.gw * 1.9} 0M${cx - b.gw * 0.8} ${gasterY + b.gh * 0.38} q${b.gw * 0.8} 5 ${b.gw * 1.6} 0`} stroke-width="0.7" />
      {/* a little hatching along the shaded side, as in an engraving */}
      <path d={`M${cx + b.gw * 0.55} ${gasterY - 6} l3 -3M${cx + b.gw * 0.62} ${gasterY} l3 -3M${cx + b.gw * 0.55} ${gasterY + 6} l3 -3M${cx + b.hw * 0.6} ${headY + 2} l3 -3M${cx + b.hw * 0.62} ${headY + 7} l3 -3`} stroke-width="0.6" />
    </g>
  );
}

export function AntPlate({ species, framed, caption, class: cls }: AntPlateProps) {
  const b = BUILDS[species];
  if (!framed) {
    return (
      <svg class={`ui-plate ${cls ?? ''}`} viewBox="0 0 100 135" role="img" aria-label={caption ?? 'Line sketch of a worker ant seen from above'}>
        <Sketch b={b} />
      </svg>
    );
  }
  const k = 2.0; // framed plate magnification
  const mmPx = (bodyLength(b) / BU_MM[species]) * b.scale * k; // svg units per millimetre
  return (
    <svg class={`ui-plate is-framed ${cls ?? ''}`} viewBox="0 0 480 320" role="img" aria-label={caption ?? 'Line sketch of a worker ant seen from above'}>
      <rect x="1" y="1" width="478" height="318" rx="4" fill="none" stroke="var(--c-border-strong)" />
      <rect x="9" y="9" width="462" height="302" rx="2" fill="none" stroke="var(--c-border)" />
      <g transform={`translate(${240 - 50 * k} 36) scale(${k})`} style={{ color: 'var(--c-text-2)' }}>
        <Sketch b={b} />
      </g>
      <g stroke="var(--c-text-2)" stroke-width="1.4" fill="none" transform="translate(412 284)">
        <path d={`M${-mmPx} 0h${mmPx}M${-mmPx} -4v8M0 -4v8`} />
      </g>
      <text x="412" y="272" text-anchor="end" fill="var(--c-text-3)" font-family="var(--font-sans)" font-size="12">1 mm</text>
      <text x="32" y="294" fill="var(--c-text-2)" font-family="var(--font-serif)" font-size="15" font-style="italic">{caption ?? ''}</text>
    </svg>
  );
}
