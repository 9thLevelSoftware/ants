// Photo looks (GDD 08 7.9 "Look grade"): Natural / Warm / Cool / Plate. A look is a multiplier on top of the world's own
// colour grade (which follows the sun and the weather), so a warm photo at dusk is still dusk. Plate is a desaturated
// sepia with a slightly stronger vignette (GDD 08 11: LOOK_VIGNETTE darkness 0.62 in the photo "Plate"). Pure.
import { GRADE_GAIN_RANGE, GRADE_SAT_RANGE, type GradeParams } from '@/render/app/look';

export type LookId = 'natural' | 'warm' | 'cool' | 'plate';
export const LOOK_IDS: readonly LookId[] = ['natural', 'warm', 'cool', 'plate'];

export interface LookDef {
  id: LookId;
  label: string;
  /** Multiplies the world's saturation. */
  saturation: number;
  /** Multiplies the world's per-channel gain. */
  gain: readonly [number, number, number];
  /** Vignette override (post chain only); null keeps the preset's. */
  vignette: { offset: number; darkness: number } | null;
}

export const LOOKS: Record<LookId, LookDef> = {
  natural: { id: 'natural', label: 'Natural', saturation: 1, gain: [1, 1, 1], vignette: null },
  warm: { id: 'warm', label: 'Warm', saturation: 1.06, gain: [1.07, 1, 0.9], vignette: null },
  cool: { id: 'cool', label: 'Cool', saturation: 0.94, gain: [0.92, 1, 1.1], vignette: null },
  plate: { id: 'plate', label: 'Plate', saturation: 0.3, gain: [1.1, 0.97, 0.78], vignette: { offset: 0.28, darkness: 0.62 } },
};

export function isLookId(v: unknown): v is LookId {
  return typeof v === 'string' && (LOOK_IDS as readonly string[]).includes(v);
}

const clamp = (v: number, [lo, hi]: readonly [number, number]) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : 1);

/** The world's grade `base` with the look applied, written into `out` (which may be `base`). */
export function applyLook(out: GradeParams, base: GradeParams, id: LookId): GradeParams {
  const l = LOOKS[id];
  out.saturation = clamp(base.saturation * l.saturation, GRADE_SAT_RANGE);
  for (let i = 0; i < 3; i++) out.gain[i] = clamp(base.gain[i] * l.gain[i], GRADE_GAIN_RANGE);
  return out;
}
