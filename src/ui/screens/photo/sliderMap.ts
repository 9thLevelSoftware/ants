// Slider mappings of the photo panel (pure): focus distance and aperture span a wide range, so their sliders are
// logarithmic (equal steps are equal ratios); the others are linear. Positions are integers 0..STEPS.
export const SLIDER_STEPS = 1000;

/** Position (0..STEPS) of `v` on a log scale between `lo` and `hi`. */
export function logToPos(v: number, lo: number, hi: number): number {
  if (!(lo > 0) || !(hi > lo)) return 0;
  const x = Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
  return Math.round((Math.log(x / lo) / Math.log(hi / lo)) * SLIDER_STEPS);
}

/** Value at a slider position on the same scale. */
export function posToLog(pos: number, lo: number, hi: number): number {
  const t = Math.min(1, Math.max(0, (Number.isFinite(pos) ? pos : 0) / SLIDER_STEPS));
  return lo * Math.pow(hi / lo, t);
}

export function formatFNumber(n: number): string {
  return `f/${n < 10 ? n.toFixed(1) : n.toFixed(0)}`;
}

export function formatFocus(bu: number): string {
  return `${bu < 10 ? bu.toFixed(1) : bu.toFixed(0)} BU`;
}

export function formatEV(ev: number): string {
  const mag = String(Number(Math.abs(ev).toFixed(2)));
  return `${ev > 0 ? '+' : ev < 0 ? '−' : ''}${mag} EV`;
}
