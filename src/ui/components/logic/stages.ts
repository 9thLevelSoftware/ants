// Which stage of a staged progress bar a 0..1 value falls in (loading: GDD 08 3.6 weights).
/** Index of the stage a progress value 0..1 falls in, for staged bars. */
export function stageIndex(value: number, weights: readonly number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  const v = Math.min(1, Math.max(0, value)) * total;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i];
    if (v < acc - 1e-9) return i;
  }
  return weights.length - 1;
}
