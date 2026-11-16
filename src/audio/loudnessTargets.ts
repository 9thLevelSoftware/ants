// Loudness targets of offline scene renders (design directions §K ruling: the calm-scene target wins over the
// §13.2 bus table). Presentation data only; the demo page renders each scene and checks it against its row, the
// unit tests check the table itself and the retune constants in tuning.ts.

export type LoudnessMeasure = 'integrated' | 'short-term-max';

export interface LoudnessTarget {
  id: string;
  label: string;
  /** Centre of the accepted band, LUFS. */
  lufs: number;
  /** Accepted band is lufs ± tol, LU. */
  tol: number;
  measure: LoudnessMeasure;
  /** Highest accepted true peak, dBFS (only where the ruling names one). */
  truePeakMaxDb?: number;
}

export const LOUDNESS_TARGETS: LoudnessTarget[] = [
  { id: 'calm-surface-day', label: 'calm surface day (garden, clear, noon, no events)', lufs: -27, tol: 2, measure: 'integrated' },
  { id: 'calm-underground', label: 'calm underground (brood chamber)', lufs: -30, tol: 3, measure: 'integrated' },
  { id: 'rain-surface', label: 'rain (downpour, surface)', lufs: -22, tol: 2, measure: 'integrated' },
  { id: 'human-footstep-peak', label: 'human event at its peak (footstep impact beside the listener)', lufs: -14, tol: 3, measure: 'short-term-max', truePeakMaxDb: -1 },
  { id: 'night-surface', label: 'night surface', lufs: -30, tol: 3, measure: 'integrated' },
];

/** Quiet foley of the possessed ant (step, pick-up, dig bite): short-term level within this many LU of the calm bed. */
export const FOLEY_WITHIN_LU = 8;

export function targetById(id: string): LoudnessTarget | undefined {
  return LOUDNESS_TARGETS.find((t) => t.id === id);
}

export interface TargetVerdict { ok: boolean; deltaLu: number; problems: string[] }

/** Compares a measured scene with its target. */
export function judge(t: LoudnessTarget, lufs: number, truePeakDb: number): TargetVerdict {
  const problems: string[] = [];
  const deltaLu = lufs - t.lufs;
  if (!(Math.abs(deltaLu) <= t.tol)) problems.push(`${lufs.toFixed(1)} LUFS is ${deltaLu.toFixed(1)} LU from ${t.lufs} (± ${t.tol})`);
  if (t.truePeakMaxDb !== undefined && !(truePeakDb <= t.truePeakMaxDb)) problems.push(`true peak ${truePeakDb.toFixed(1)} dBFS above ${t.truePeakMaxDb}`);
  return { ok: problems.length === 0, deltaLu, problems };
}
