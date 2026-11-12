// Seamless looping by crossfade (pure planning part). The delivered loop files start with ~5 ms of near-silence
// and carry MP3 encoder delay (assets-src/MANIFEST.md), so sample-accurate `loop = true` would click or drop out
// at every wrap. Instead each pass skips `trimStart`/`trimEnd` and overlaps the next pass by an equal-power
// crossfade, so the defect region is never heard.

export interface LoopOptions {
  trimStartS: number;
  trimEndS: number;
  crossfadeS: number;
}

export interface LoopSegment {
  /** Context time the segment starts. */
  when: number;
  /** Buffer offset it starts reading at, s. */
  offset: number;
  /** Seconds it plays (fades included). */
  duration: number;
  fadeInS: number;
  fadeOutS: number;
}

/** The usable region and the crossfade, clamped so that two crossfades always fit in one pass. */
export function loopRegion(bufferS: number, o: LoopOptions): { start: number; end: number; xfade: number } {
  const start = Math.min(o.trimStartS, bufferS * 0.1);
  const end = Math.max(start + 1e-3, bufferS - Math.min(o.trimEndS, bufferS * 0.1));
  const xfade = Math.max(0.005, Math.min(o.crossfadeS, (end - start) / 3));
  return { start, end, xfade };
}

/** First segment: starts at `when` from `offset01` (0..1 of the usable region) with a `fadeInS` fade-in. */
export function firstSegment(bufferS: number, o: LoopOptions, when: number, offset01: number, fadeInS: number): LoopSegment {
  const r = loopRegion(bufferS, o);
  const latest = r.end - 2 * r.xfade;
  const offset = r.start + Math.min(1, Math.max(0, offset01)) * Math.max(0, latest - r.start);
  return { when, offset, duration: r.end - offset, fadeInS: Math.min(fadeInS, (r.end - offset) / 2), fadeOutS: r.xfade };
}

/** The segment that follows `prev`: starts `xfade` before prev ends, from the start of the usable region. */
export function nextSegment(bufferS: number, o: LoopOptions, prev: LoopSegment): LoopSegment {
  const r = loopRegion(bufferS, o);
  return { when: prev.when + prev.duration - prev.fadeOutS, offset: r.start, duration: r.end - r.start, fadeInS: r.xfade, fadeOutS: r.xfade };
}

/** Equal-power fade curve (sin for in, cos for out), `n` points. */
export function equalPowerCurve(n: number, fadeIn: boolean): Float32Array {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * (Math.PI / 2);
    c[i] = fadeIn ? Math.sin(x) : Math.cos(x);
  }
  return c;
}

/** Gain of a segment at time t (pure mirror of the Web Audio envelope, used by the offline tests). */
export function segmentGainAt(s: LoopSegment, t: number): number {
  const u = t - s.when;
  if (u < 0 || u >= s.duration) return 0;
  let g = 1;
  if (u < s.fadeInS) g *= Math.sin((u / s.fadeInS) * (Math.PI / 2));
  const v = s.duration - u;
  if (v < s.fadeOutS) g *= Math.sin((v / s.fadeOutS) * (Math.PI / 2));
  return g;
}
