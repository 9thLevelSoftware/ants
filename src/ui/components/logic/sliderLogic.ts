// Slider keyboard and pointer maths (GDD 08 2.7: arrow = 1 step, PageUp/PageDown = 10 steps, Home/End = ends).
export interface SliderRange {
  min: number;
  max: number;
  step: number;
}

export const PAGE_STEPS = 10;

/** Rounds to the step grid anchored at `min`, clamped to the range, free of floating-point dust. */
export function snapToStep(v: number, r: SliderRange): number {
  const n = Math.round((v - r.min) / r.step);
  const snapped = r.min + n * r.step;
  const decimals = Math.max(0, Math.ceil(-Math.log10(r.step)) + 1);
  return Math.min(r.max, Math.max(r.min, Number(snapped.toFixed(Math.min(decimals, 8)))));
}

/** New value for a key press, or null when the key does nothing for a slider. */
export function sliderKey(value: number, key: string, r: SliderRange): number | null {
  switch (key) {
    case 'ArrowRight': case 'ArrowUp': return snapToStep(value + r.step, r);
    case 'ArrowLeft': case 'ArrowDown': return snapToStep(value - r.step, r);
    case 'PageUp': return snapToStep(value + r.step * PAGE_STEPS, r);
    case 'PageDown': return snapToStep(value - r.step * PAGE_STEPS, r);
    case 'Home': return r.min;
    case 'End': return r.max;
    default: return null;
  }
}

/** Value under a pointer at `fraction` (0..1) along the track. */
export function sliderFromFraction(fraction: number, r: SliderRange): number {
  return snapToStep(r.min + Math.min(1, Math.max(0, fraction)) * (r.max - r.min), r);
}

export function sliderFraction(value: number, r: SliderRange): number {
  return r.max === r.min ? 0 : Math.min(1, Math.max(0, (value - r.min) / (r.max - r.min)));
}
