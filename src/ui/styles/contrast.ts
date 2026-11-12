// WCAG 2.x contrast maths and the computed check over the token pairs (GDD 08 2.1 and Appendix E check 3).
// Worst case = the semi-opaque panel composited over pure white (a bright sky behind it).
import { COLORS, HIGH_CONTRAST, type ColorToken, type Rgba } from './tokens';

export type Rgb = [number, number, number];

export function parseHex(hex: string): Rgb {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Colour `fg` (with its alpha) painted over the opaque colour `bg`. */
export function compositeOver(fg: Rgba, bg: Rgb): Rgb {
  const [r, g, b] = parseHex(fg.hex);
  const al = fg.alpha;
  return [r * al + bg[0] * (1 - al), g * al + bg[1] * (1 - al), b * al + bg[2] * (1 - al)];
}

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function luminance(c: Rgb): number {
  return 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a), lb = luminance(b);
  const hi = Math.max(la, lb), lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

export interface ContrastRow {
  /** Human-readable pair, e.g. "text on panel". */
  pair: string;
  fg: ColorToken;
  bg: ColorToken | 'accent-fill';
  ratio: number;
  /** Required ratio: 4.5 for text, 3 for large text and component boundaries. */
  min: number;
  pass: boolean;
}

const WHITE: Rgb = [255, 255, 255];
const TEXT_MIN = 4.5;
const UI_MIN = 3;

const TEXT_ON_PANEL: ColorToken[] = [
  'text', 'text-2', 'text-3', 'link', 'accent', 'status-ok', 'status-watch', 'status-warn', 'status-bad', 'info', 'nutrient-c', 'nutrient-p',
];
const TEXT_ON_SCRIM: ColorToken[] = ['text', 'text-2'];
/**
 * Status colours on the scrim are the status SHAPES (graphical objects, 3:1); the words beside them use --c-text.
 * Over pure white the scrim (alpha 0.80) only gives warn 3.97 and bad 3.28, so these two cannot carry text there:
 * the chapter's table computes panels (alpha 0.90) only. Recorded as a deviation note in the task report.
 */
const SHAPES_ON_SCRIM: ColorToken[] = ['status-ok', 'status-watch', 'status-warn', 'status-bad'];
const TEXT_ON_RAISED: ColorToken[] = ['text', 'text-2', 'text-3', 'link'];
const BOUNDARIES: ColorToken[] = ['border-strong', 'focus'];

/** The effective colour of a token in the given mode (high contrast overrides some). */
export function tokenColor(token: ColorToken, highContrast = false): Rgba {
  return (highContrast ? HIGH_CONTRAST[token] : undefined) ?? COLORS[token];
}

/**
 * Computes every contrast pair the UI relies on. Text tokens must reach 4.5:1 over the worst-case panel (and the
 * worst-case scrim, for text that floats over the scene); component boundaries and the focus ring 3:1.
 */
export function contrastReport(highContrast = false): ContrastRow[] {
  const col = (t: ColorToken) => tokenColor(t, highContrast);
  const panel = compositeOver(col('panel'), WHITE);
  const raised = compositeOver(col('panel-raised'), WHITE);
  const scrim = compositeOver(col('scrim'), WHITE);
  const rows: ContrastRow[] = [];
  const add = (fg: ColorToken, bg: ColorToken | 'accent-fill', bgRgb: Rgb, label: string, min: number) => {
    const fgRgb = compositeOver(col(fg), bgRgb);
    const ratio = contrastRatio(fgRgb, bgRgb);
    rows.push({ pair: `${fg} on ${label}`, fg, bg, ratio, min, pass: ratio >= min });
  };
  for (const t of TEXT_ON_PANEL) add(t, 'panel', panel, 'panel', TEXT_MIN);
  for (const t of TEXT_ON_RAISED) add(t, 'panel-raised', raised, 'panel-raised', TEXT_MIN);
  for (const t of TEXT_ON_SCRIM) add(t, 'scrim', scrim, 'scrim', TEXT_MIN);
  for (const t of SHAPES_ON_SCRIM) add(t, 'scrim', scrim, 'scrim (shape)', UI_MIN);
  for (const t of BOUNDARIES) add(t, 'panel', panel, 'panel', UI_MIN);
  add('on-accent', 'accent-fill', parseHex(col('accent').hex), 'accent fill', TEXT_MIN);
  return rows;
}
