// Judges one rendered sound against what its job calls for, without listening. Used by the provenance test (a few cheap
// sounds always, all 36 under FOUNDRESS_LONG=1) and by hand: node tools/audio/check.mjs [substring ...]
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeRng } from './lib/rng.mjs';
import { renderMp3, renderPcm } from './lib/pipeline.mjs';
import { decodeMp3 } from './lib/finish.mjs';
import { correlation, loopSeam, spectralSummary } from './lib/analysis.mjs';
import { integratedLufs, meanLufs, truePeakDb } from './lib/lufs.mjs';
import { SOUNDS } from './sounds/index.mjs';

const OLD = JSON.parse(fs.readFileSync(new URL('./sounds/old-levels.json', import.meta.url), 'utf8')).files;
const FS = 44100, ENCODER_DELAY = 1105;
const PUBLIC_ASSETS = fileURLToPath(new URL('../../public/assets/', import.meta.url));

/** True when the file in public/assets is exactly what a fresh render of the spec gives (nobody edited it, the seeds are current). */
export function shippedMatchesRender(spec) {
  const shipped = fs.readFileSync(`${PUBLIC_ASSETS}${spec.id}.mp3`);
  return Buffer.compare(shipped, renderMp3(spec, makeRng).bytes) === 0;
}

/** Limits chosen for the sound classes (stated in the report): a smooth wrap is jump <= 3.5 steps, kink <= 4.5, energy <= 1 dB. */
export const LIMITS = { seamJump: 3.5, seamKink: 4.5, seamEnergyDb: 1, truePeakDb: -1, loopLufsTol: 0.3, peakSlackDb: 0.6, matchSlackLu: 0.3 };

/** @returns {{ id: string, problems: string[], metrics: object }} */
export function checkSpec(spec, { encode = true } = {}) {
  const problems = [], m = {};
  const pcm = renderPcm(spec, makeRng);
  const sp = spectralSummary(pcm);
  m.centroidHz = sp.centroidHz; m.above2k = sp.above2k;
  const [lo, hi] = spec.expect.centroidHz;
  if (sp.centroidHz < lo || sp.centroidHz > hi) problems.push(`centroid ${sp.centroidHz.toFixed(0)} Hz outside ${lo}-${hi}`);
  if (spec.loop) {
    const seam = loopSeam(pcm[0]);
    m.seam = seam;
    if (seam.jump > LIMITS.seamJump) problems.push(`seam jump ${seam.jump.toFixed(1)} steps`);
    if (seam.kink > LIMITS.seamKink) problems.push(`seam kink ${seam.kink.toFixed(1)}`);
    if (seam.energyDb > LIMITS.seamEnergyDb) problems.push(`seam energy step ${seam.energyDb.toFixed(2)} dB`);
  }
  if (pcm.length === 2) {
    m.correlation = correlation(pcm[0], pcm[1]);
    if (m.correlation < 0.5 || m.correlation > 0.95) problems.push(`stereo correlation ${m.correlation.toFixed(2)}`);
  }
  let chs = pcm;
  if (encode) {
    const { bytes } = renderMp3(spec, makeRng);
    m.bytes = bytes.length;
    const dec = decodeMp3(bytes, pcm.length);
    chs = spec.loop ? dec.map((c) => c.subarray(ENCODER_DELAY, ENCODER_DELAY + pcm[0].length)) : dec;
    m.decodedSeconds = dec[0].length / FS;
  }
  m.truePeakDb = truePeakDb(chs);
  if (m.truePeakDb > LIMITS.truePeakDb) problems.push(`true peak ${m.truePeakDb.toFixed(1)} dBFS`);
  if (spec.loop) {
    m.lufs = integratedLufs(chs, FS);
    if (Math.abs(m.lufs - spec.lufs) > LIMITS.loopLufsTol) problems.push(`${m.lufs.toFixed(2)} LUFS, target ${spec.lufs}`);
  } else {
    m.meanLufs = meanLufs(chs, FS);
    const old = OLD[spec.id].meanLufs;
    if (m.meanLufs > old + LIMITS.matchSlackLu) problems.push(`mean ${m.meanLufs.toFixed(1)} LUFS louder than the file it replaces (${old})`);
    if (m.truePeakDb > (spec.peakDb ?? -3) + LIMITS.peakSlackDb) problems.push(`peak ${m.truePeakDb.toFixed(1)} dBFS above ${(spec.peakDb ?? -3)} + slack`);
  }
  return { id: spec.id, problems, metrics: m };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pick = process.argv.slice(2);
  let bad = 0;
  for (const s of SOUNDS) {
    if (pick.length && !pick.some((p) => s.id.includes(p))) continue;
    const r = checkSpec(s);
    bad += r.problems.length;
    console.log(r.id.slice(6).padEnd(32), r.problems.length ? `PROBLEMS: ${r.problems.join('; ')}` : 'ok', JSON.stringify(r.metrics, (k, v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v)));
  }
  process.exitCode = bad ? 1 : 0;
}
