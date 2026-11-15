// Pattern swatches of the overlay legends (GDD 08 10.1: "every channel also has a unique pattern and motion so hue is never
// required"). Each swatch is a 36 x 16 dp drawing in `currentColor`; the pattern id is also the `data-pattern` attribute, so a
// check can read which patterns a legend uses independent of colour (GDD 08 App. E check 19).
import { useId } from 'preact/hooks';
import type { PatternId } from './catalogue';

const TILE = 10;

function PatternBody({ id }: { id: PatternId }) {
  switch (id) {
    case 'chevron': return <path d="M1 1.5 L5 5 L1 8.5 M6 1.5 L10 5 L6 8.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />;
    case 'stipple': return <><circle cx="2.5" cy="2.5" r="1" fill="currentColor" /><circle cx="7.5" cy="7.5" r="1" fill="currentColor" /></>;
    case 'zigzag': return <path d="M0 7 L2.5 2.5 L5 7 L7.5 2.5 L10 7" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />;
    case 'rings': return <><circle cx="5" cy="5" r="1.6" fill="none" stroke="currentColor" stroke-width="1" /><circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" stroke-width="1" /></>;
    case 'hatch': return <path d="M-1 9 L9 -1 M1 11 L11 1" stroke="currentColor" stroke-width="1.4" />;
    case 'cross-hatch': return <path d="M-1 9 L9 -1 M1 11 L11 1 M-1 1 L9 11 M1 -1 L11 9" stroke="currentColor" stroke-width="1.2" />;
    case 'waves': return <path d="M0 3 Q2.5 0 5 3 T10 3 M0 8 Q2.5 5 5 8 T10 8" fill="none" stroke="currentColor" stroke-width="1.2" />;
    default: return null;
  }
}

const FILLED: readonly PatternId[] = ['chevron', 'stipple', 'zigzag', 'rings', 'hatch', 'cross-hatch', 'waves'];
const OUTLINE_DASH: Partial<Record<PatternId, string>> = { dashed: '5 3', dotted: '1.5 2.5', 'grey-dash': '3 3', solid: '' };

export interface SwatchProps {
  pattern: PatternId;
  ink: string;
  label: string;
}

export function Swatch({ pattern, ink, label }: SwatchProps) {
  const uid = useId().replace(/[^a-z0-9]/gi, '');
  const filled = FILLED.includes(pattern);
  return (
    <svg class="ov-swatch" width="36" height="16" viewBox="0 0 36 16" role="img" aria-label={`${label} pattern: ${pattern.replace('-', ' ')}`} data-pattern={pattern} style={{ color: ink }}>
      {filled && (
        <defs>
          <pattern id={`p${uid}`} width={TILE} height={TILE} patternUnits="userSpaceOnUse"><PatternBody id={pattern} /></pattern>
        </defs>
      )}
      {filled
        ? <rect x="1" y="1" width="34" height="14" rx="3" fill={`url(#p${uid})`} stroke="currentColor" stroke-width="1" stroke-opacity="0.55" />
        : <rect x="1.5" y="1.5" width="33" height="13" rx="3" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray={OUTLINE_DASH[pattern] ?? ''} />}
    </svg>
  );
}
