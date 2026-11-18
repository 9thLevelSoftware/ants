// From a sound spec to final channels: render, shape the ends, normalise to the level the old file had.
import { SR, fade, hp, hp4, squash } from './dsp.mjs';
import { decodeMp3, encodeMp3, integratedLufs, normalizeLufs, normalizePeak } from './finish.mjs';
import { meanLufs } from './lufs.mjs';

/**
 * Where a level-matched one-shot is aimed above the old level before encoding: the 96 kbps encode lowers the decoded
 * level by about this much (measured on the decoded files, delay and padding trimmed by the Info frame), and
 * old-levels.json was measured on decoded files. renderMp3 then corrects the remainder on the decoded file.
 */
export const ENCODER_LOSS_DB = 0.45;

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
      const over = meanLufs(chs, SR) - (spec.matchMeanLufs + ENCODER_LOSS_DB);
      if (over > 0) for (const c of chs) for (let i = 0; i < c.length; i++) c[i] *= Math.pow(10, -over / 20);
    }
  } else {
    normalizeLufs(chs, spec.lufs);
  }
  return chs;
}

export const secondsOf = (chs) => chs[0].length / SR;
export { hp };

/** The file as a browser decodes it must have exactly the rendered length: the Info frame trims delay and padding. */
function decodeChecked(bytes, chs, id) {
  const dec = decodeMp3(bytes, chs.length);
  if (dec[0].length !== chs[0].length) throw new Error(`${id}: decodes to ${dec[0].length} samples, rendered ${chs[0].length} (no gapless header?)`);
  return dec;
}

const scale = (chs, dB) => { const g = Math.pow(10, dB / 20); for (const c of chs) for (let i = 0; i < c.length; i++) c[i] *= g; };

/**
 * Final MP3 bytes of a spec. The levels are judged on the file as the browser decodes it: a loudness-normalised bed is
 * encoded, decoded again and nudged by the encoder's own level change, so it reads its target; a level-matched one-shot
 * is nudged down if the decoded file is still louder than the file it replaces (never up: it stays under its peak).
 */
export function renderMp3(spec, makeRng) {
  const chs = renderPcm(spec, makeRng);
  let bytes = encodeMp3(chs);
  if (spec.loop) {
    scale(chs, spec.lufs - integratedLufs(decodeChecked(bytes, chs, spec.id), SR));
    bytes = encodeMp3(chs);
  } else if (spec.matchMeanLufs !== undefined) {
    const over = meanLufs(decodeChecked(bytes, chs, spec.id), SR) - spec.matchMeanLufs;
    if (over > 0) { scale(chs, -over); bytes = encodeMp3(chs); }
  }
  decodeChecked(bytes, chs, spec.id);
  return { bytes, chs };
}
