// Axis maths of the journal graphs (GDD 08 7.2, dataviz rules): "nice" tick values, linear scales and number words.
// Pure functions; the chart component only draws what they return.

export interface NiceScale {
  /** Axis end values (the data range widened to tick steps). */
  min: number;
  max: number;
  step: number;
  ticks: number[];
}

/** A step of 1, 2, 2.5, 5 times a power of ten that is close to `raw`. */
export function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return n * pow;
}

/** Ticks for the value range [lo, hi] with about `target` steps; the axis starts at 0 when `fromZero` and the data is non-negative. */
export function niceScale(lo: number, hi: number, target = 4, fromZero = true): NiceScale {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { min: 0, max: 1, step: 0.25, ticks: [0, 0.25, 0.5, 0.75, 1] };
  let a = fromZero && lo >= 0 ? 0 : lo;
  let b = hi;
  if (b - a < 1e-9) b = a + 1;
  const step = niceStep((b - a) / Math.max(1, target));
  const min = Math.floor(a / step + 1e-9) * step;
  const max = Math.ceil(b / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = min; v <= max + step * 1e-6; v += step) ticks.push(Math.round(v / step) * step);
  a = min;
  return { min: a, max, step, ticks };
}

/** Maps [d0, d1] onto [r0, r1]; a flat domain maps to the middle of the range. */
export function linear(d0: number, d1: number, r0: number, r1: number): (v: number) => number {
  const span = d1 - d0;
  if (Math.abs(span) < 1e-12) return () => (r0 + r1) / 2;
  return (v) => r0 + ((v - d0) / span) * (r1 - r0);
}

/** A tick label: integers plainly, small values with the digits the step needs ("0.5", "0.25", "2.5"), thousands as "12k". */
export function tickLabel(v: number, step: number): string {
  if (Math.abs(v) >= 10000) return `${Math.round(v / 100) / 10}k`;
  if (Number.isInteger(step)) return String(Math.round(v));
  let digits = 0;
  while (digits < 3 && Math.abs(step * 10 ** digits - Math.round(step * 10 ** digits)) > 1e-6) digits++;
  return v.toFixed(Math.max(1, digits));
}

/** Index of the sample whose x is nearest to `x` (xs ascending); -1 for no samples. */
export function nearestIndex(xs: readonly number[], x: number): number {
  if (xs.length === 0) return -1;
  let lo = 0, hi = xs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] < x) lo = mid + 1; else hi = mid;
  }
  if (lo > 0 && Math.abs(xs[lo - 1] - x) <= Math.abs(xs[lo] - x)) return lo - 1;
  return lo;
}

/** Value text for the cursor table: a whole number when the series is counts, else one or two decimals. */
export function valueText(v: number): string {
  if (!Number.isFinite(v)) return '0';
  if (Math.abs(v) >= 100) return String(Math.round(v));
  if (Math.abs(v) >= 10) return (Math.round(v * 10) / 10).toString();
  return (Math.round(v * 100) / 100).toString();
}
