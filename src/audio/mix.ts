// Pure mix maths (GDD 08 §13.2-13.3): dB conversion, slider law, bus gains from settings, the inverse distance
// model and the surface-to-underground occlusion curve. No Web Audio here, so all of it is unit-tested in Node.
import { BUS_DEFAULT_DB, BUS_IDS, OPEN_CUTOFF_HZ, SURFACE_OCCLUSION, type BusId, type DistanceClass } from './tuning';

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export function gainToDb(g: number): number {
  return g <= 0 ? -Infinity : 20 * Math.log10(g);
}

/** Perceptual slider law: amplitude = (slider / 100)², with the slider given as 0..1. 0 = mute. */
export function sliderToGain(v01: number): number {
  const v = Math.min(1, Math.max(0, Number.isFinite(v01) ? v01 : 0));
  return v * v;
}

/** The audio part of the game settings that the mix reads (names as in src/game/settings/model.ts). */
export interface MixSettings {
  master: number;
  ambience: number;
  effects: number;
  giants: number;
  ui: number;
  music: number;
  muted: boolean;
  musicMode: 'off' | 'sparse' | 'frequent';
}

/** Linear gain of every bus: default dB times the slider law; master also carries the mute switch. */
export function busGains(s: MixSettings): Record<BusId, number> {
  const out = {} as Record<BusId, number>;
  for (const id of BUS_IDS) {
    const slider = id === 'master' ? (s.muted ? 0 : s.master) : s[id];
    out[id] = dbToGain(BUS_DEFAULT_DB[id]) * sliderToGain(slider);
  }
  if (s.musicMode === 'off') out.music = 0;
  return out;
}

/**
 * Web Audio `inverse` distance model: ref / (ref + rolloff · (clamp(d, ref, max) - ref)). Distances in any unit as
 * long as all three agree. Sources beyond max are culled by the caller (audibleAt), not attenuated further.
 */
export function inverseDistanceGain(d: number, c: DistanceClass): number {
  const dd = Math.min(c.maxBu, Math.max(c.refBu, d));
  return c.refBu / (c.refBu + c.rolloff * (dd - c.refBu));
}

export function audibleAt(d: number, c: DistanceClass): boolean {
  return d <= c.maxBu;
}

export interface FilterGain { cutoffHz: number; gainDb: number }

/**
 * Surface sounds heard from a cavity `depthBu` below local ground: low-pass cutoff and gain (§13.3). At the
 * surface (depth <= 0, or not underground) nothing is filtered.
 */
export function surfaceOcclusion(depthBu: number, underground: boolean, out: FilterGain = { cutoffHz: 0, gainDb: 0 }): FilterGain {
  if (!underground || !(depthBu > 0)) {
    out.cutoffHz = OPEN_CUTOFF_HZ;
    out.gainDb = 0;
    return out;
  }
  const o = SURFACE_OCCLUSION;
  out.cutoffHz = Math.max(o.minHz, o.maxHz * Math.pow(2, -depthBu / o.halfBu));
  out.gainDb = Math.max(o.minDb, o.dbPerBu * depthBu);
  return out;
}

/** Combines two filter stages in series: the lower cutoff wins, gains add in dB. */
export function combineOcclusion(a: FilterGain, b: FilterGain, out: FilterGain = { cutoffHz: 0, gainDb: 0 }): FilterGain {
  out.cutoffHz = Math.min(a.cutoffHz, b.cutoffHz);
  out.gainDb = a.gainDb + b.gainDb;
  return out;
}

/** Equal-power stereo pan -1..1 of a source seen from the listener with the camera's right vector. */
export function panFor(dx: number, dy: number, dz: number, rx: number, ry: number, rz: number): number {
  const d = Math.hypot(dx, dy, dz);
  if (d < 1e-6) return 0;
  const p = (dx * rx + dy * ry + dz * rz) / d;
  return Math.max(-1, Math.min(1, p * 0.85));
}

/** Semitones -> playback-rate factor. */
export function semis(n: number): number {
  return Math.pow(2, n / 12);
}
