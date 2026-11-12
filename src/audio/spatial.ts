// Where a sound is heard from (GDD 08 §13.3), pure: distance attenuation by class, culling beyond max distance,
// stereo pan, surface/underground occlusion and line-of-sight occlusion through solid (budgeted traces).
import type { Vec3 } from '@/core/math/vec3';
import { audibleAt, combineOcclusion, dbToGain, inverseDistanceGain, panFor, surfaceOcclusion, type FilterGain } from './mix';
import { depthBelowGround, distBu, type Listener } from './listener';
import { AIR, DISTANCE, LOS_OCCLUSION, OPEN_CUTOFF_HZ } from './tuning';
import type { SpaceClass } from './cueTable';

export interface Spatial {
  audible: boolean;
  distBu: number;
  /** Linear gain from distance and occlusion together. */
  gain: number;
  pan: number;
  cutoffHz: number;
  occlusionDb: number;
  /** A line-of-sight trace was used (counts against the per-frame budget). */
  traced: boolean;
}

/** Per-frame line-of-sight trace budget (§13.3: at most 8 per frame). */
export class TraceBudget {
  used = 0;
  constructor(readonly perFrame = LOS_OCCLUSION.maxTracesPerFrame) {}
  reset(): void { this.used = 0; }
  take(): boolean { if (this.used >= this.perFrame) return false; this.used++; return true; }
}

const _surf: FilterGain = { cutoffHz: 0, gainDb: 0 };
const _los: FilterGain = { cutoffHz: 0, gainDb: 0 };
const _sum: FilterGain = { cutoffHz: 0, gainDb: 0 };

/**
 * Hearing of a source at `pos` (null = non-positional). Ant-scale foley is measured from `listener.hear` (the camera
 * focus in observer views), creatures and giants from the listener itself.
 */
export function spatialize(l: Listener, space: SpaceClass, pos: Vec3 | null, budget: TraceBudget | null, out: Spatial): Spatial {
  out.traced = false;
  if (space === 'flat' || pos === null) {
    out.audible = true; out.distBu = 0; out.gain = 1; out.pan = 0; out.cutoffHz = OPEN_CUTOFF_HZ; out.occlusionDb = 0;
    return out;
  }
  const dc = DISTANCE[space];
  const from = space === 'foley' ? l.hear : l.pos;
  const d = distBu(from, pos, l.bu);
  out.distBu = d;
  out.audible = audibleAt(d, dc);
  if (!out.audible) { out.gain = 0; out.pan = 0; out.cutoffHz = OPEN_CUTOFF_HZ; out.occlusionDb = 0; return out; }
  out.pan = panFor(pos.x - l.pos.x, pos.y - l.pos.y, pos.z - l.pos.z, l.right.x, l.right.y, l.right.z);
  // surface <-> underground: one of the two below ground filters by that depth
  const srcDepth = depthBelowGround(l, pos);
  const srcUnder = srcDepth > 0.5;
  _surf.cutoffHz = OPEN_CUTOFF_HZ; _surf.gainDb = 0;
  if (l.underground !== srcUnder) surfaceOcclusion(l.underground ? l.depthBu : srcDepth, true, _surf);
  // line of sight across solid, when both are on the same side (budgeted)
  _los.cutoffHz = OPEN_CUTOFF_HZ; _los.gainDb = 0;
  if (l.underground === srcUnder && l.solidBetween && budget && d > 1 && budget.take()) {
    out.traced = true;
    if (l.solidBetween(l.pos, pos)) { _los.cutoffHz = LOS_OCCLUSION.cutoffHz; _los.gainDb = LOS_OCCLUSION.gainDb; }
  }
  combineOcclusion(_surf, _los, _sum);
  out.cutoffHz = space === 'giant' ? Math.min(_sum.cutoffHz, airCutoff(d)) : _sum.cutoffHz;
  out.occlusionDb = _sum.gainDb;
  out.gain = inverseDistanceGain(d, dc) * dbToGain(_sum.gainDb);
  return out;
}

/** Air absorption low-pass for a giant source `d` BU away. */
export function airCutoff(d: number): number {
  return d <= AIR.refBu ? OPEN_CUTOFF_HZ : Math.max(AIR.minHz, AIR.maxHz * Math.pow(AIR.refBu / d, AIR.exp));
}

export function newSpatial(): Spatial {
  return { audible: true, distBu: 0, gain: 1, pan: 0, cutoffHz: OPEN_CUTOFF_HZ, occlusionDb: 0, traced: false };
}
