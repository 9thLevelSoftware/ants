// From a sound spec to final channels: render, shape the ends, normalise to the level the old file had.
import { SR, fade, hp, hp4, squash } from './dsp.mjs';
import { decodeMp3, encodeMp3, integratedLufs, normalizeLufs, normalizePeak } from './finish.mjs';
import { meanLufs } from './lufs.mjs';

/**
 * Spec fields: id ('audio/sfx/name'), seed, render({ rng }) -> Float64Array[] (1 or 2 channels), and one of
 *   loop: true  - periodic by construction, left untouched, normalised to `lufs` integrated
 *   oneShot: true - high-passed, faded at both ends, peak-normalised to `peakDb` (-3 dBFS like the files before), then
 *     lowered if it is louder than `matchMeanLufs` (the mean K-weighted level of the file it replaces)
 * `lowCutHz` overrides the one-shot high-pass (default 35 Hz, the old files' value); `squash` is a tanh drive (see dsp.squash).
 */
export function renderPcm(spec, makeRng) {
  const chs = spec.render({ rng: makeRng(spec.seed) });
  for (const c of chs) for (let i = 0; i < c.length; i++) if (!Number.isFinite(c[i])) throw new Error(`${spec.id}: non-finite sample at ${i}`);
  if (spec.oneShot) {
    for (let c = 0; c < chs.length; c++) {
      chs[c] = hp4(chs[c], spec.lowCutHz ?? 35);
      if (spec.squash) chs[c] = squash(chs[c], spec.squash); // lowers the crest of a peaky sound so it keeps the old file's loudness
      fade(chs[c], spec.fadeInS ?? 0.003, spec.fadeOutS ?? 0.02);
    }
    normalizePeak(chs, spec.peakDb ?? -3);
    // keep the loudness of the file this replaces (the cue gains were tuned against it); never above the -3 dBFS peak
    if (spec.matchMeanLufs !== undefined) {
      const over = meanLufs(chs, SR) - spec.matchMeanLufs;
      if (over > 0) for (const c of chs) for (let i = 0; i < c.length; i++) c[i] *= Math.pow(10, -over / 20);
    }
  } else {
    normalizeLufs(chs, spec.lufs);
  }
  return chs;
}

export const secondsOf = (chs) => chs[0].length / SR;
export { hp };

/**
 * Final MP3 bytes of a spec. A loudness-normalised bed is encoded, decoded again and nudged by the encoder's own
 * level change (about -0.45 dB at 96 kbps), so the file as the browser decodes it reads its target.
 */
export function renderMp3(spec, makeRng) {
  const chs = renderPcm(spec, makeRng);
  let bytes = encodeMp3(chs);
  if (spec.loop) {
    const trim = chs[0].length;
    const dec = decodeMp3(bytes, chs.length).map((c) => c.subarray(1105, 1105 + trim));
    const off = spec.lufs - integratedLufs(dec, SR);
    for (const c of chs) for (let i = 0; i < c.length; i++) c[i] *= Math.pow(10, off / 20);
    bytes = encodeMp3(chs);
  }
  return { bytes, chs };
}
