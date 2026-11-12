// UI scaling (GDD 08 2.3): root font = 16 px x autoScale x uiScale, type tokens additionally x textScale, and the
// layout mode (standard / compact / too-small) from the scaled viewport in dp. Pure; the DOM part is applyScale.
import { SCALE } from './tokens';

export type LayoutMode = 'standard' | 'compact' | 'too-small';

export interface ScaleInput {
  viewportW: number;
  viewportH: number;
  /** 0.80 .. 1.50 */
  uiScale: number;
  /** 1.00 / 1.15 / 1.30 */
  textScale: number;
}

export interface ScaleResult {
  autoScale: number;
  uiScale: number;
  textScale: number;
  /** Root font size in CSS px. */
  rootPx: number;
  /** Viewport size in dp (1 dp = rootPx / 16 CSS px). */
  dpW: number;
  dpH: number;
  layout: LayoutMode;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Snap to the 0.10 steps the setting offers. */
export function snapUiScale(v: number): number {
  return Math.round(clamp(v, SCALE.uiMin, SCALE.uiMax) * 10) / 10;
}

export function computeScale(i: ScaleInput): ScaleResult {
  const autoScale = clamp(Math.min(i.viewportW / SCALE.referenceW, i.viewportH / SCALE.referenceH), SCALE.autoMin, SCALE.autoMax);
  const uiScale = snapUiScale(i.uiScale);
  const textScale = SCALE.textScales.includes(i.textScale) ? i.textScale : 1;
  const rootPx = SCALE.baseRootPx * autoScale * uiScale;
  const k = rootPx / SCALE.baseRootPx;
  const dpW = i.viewportW / k;
  const dpH = i.viewportH / k;
  let layout: LayoutMode = 'standard';
  if (dpW < SCALE.tooSmallW || dpH < SCALE.tooSmallH) layout = 'too-small';
  else if (dpW < SCALE.standardW || dpH < SCALE.standardH) layout = 'compact';
  return { autoScale, uiScale, textScale, rootPx, dpW, dpH, layout };
}

/** Writes the scale result onto the document element (font size, text scale, layout mode). */
export function applyScale(root: HTMLElement, s: ScaleResult): void {
  root.style.fontSize = `${s.rootPx}px`;
  root.style.setProperty('--text-scale', String(s.textScale));
  root.dataset.layout = s.layout;
}
