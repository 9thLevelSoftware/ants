// Offline analysis of the shipped audio files (and of the old ones, for the before column), judged against each
// sound's role and level target. Nobody can listen here: these numbers are the check.
//   node tools/sim/run-ts.mjs tools/audio/measure.ts <dir with audio/ambience, audio/sfx> <out.json> [ids]
// Loudness and true peak come from src/audio/loudness.ts (the estimator the game's own tests use).
import fs from 'node:fs';
import { integratedLoudness, shortTermLoudness, truePeakDb } from '../../src/audio/loudness';
// @ts-ignore plain .mjs modules
import { engineJoin, loopSeam, correlation, spectralSummary, BAND_NAMES } from './lib/analysis.mjs';
// @ts-ignore
import { decodeMp3 } from './lib/finish.mjs';
// @ts-ignore
import { SOUNDS } from './sounds/index.mjs';

const FS = 44100;

export interface Row {
  id: string; channels: number; seconds: number; bytes: number;
  integratedLufs: number | null; shortTermMaxLufs: number | null; meanLufs: number; truePeakDb: number;
  centroidHz: number; above2k: number; rolloff95Hz: number; bands: Record<string, number>;
  correlation: number | null;
  seam: { jump: number; kink: number; energyDb: number } | null;
  join: { click: number; fileMaxStep: number; dipDb: number } | null;
}

export function measureFile(dir: string, id: string, channels: number, loop: boolean): Row {
  const bytes = fs.readFileSync(`${dir}/${id}.mp3`);
  const chs: Float32Array[] = decodeMp3(bytes, channels);
  const seconds = chs[0].length / FS;
  const st = shortTermLoudness(chs, FS);
  const long = seconds >= 1;
  const spec = spectralSummary(chs);
  const bands: Record<string, number> = {};
  BAND_NAMES.forEach((n: string, i: number) => { bands[n] = Math.round(spec.bands[i] * 1000) / 1000; });
  // Every file (old and new) carries an Info frame, so the decoder already trims the encoder delay and padding and the
  // decoded buffer is the content. The wrap is measured as a sample-accurate loop of the file would play it; the engine
  // itself skips 30 ms at both ends and crossfades, which hides any residue.
  const seam = loop ? loopSeam(chs[0]) : null;
  const join = loop ? engineJoin(chs[0]) : null;
  return {
    id, channels, seconds, bytes: bytes.length,
    integratedLufs: long ? integratedLoudness(chs, FS) : null,
    shortTermMaxLufs: long ? st.max : null,
    meanLufs: st.meanLufs,
    truePeakDb: truePeakDb(chs, { fs: FS }),
    centroidHz: spec.centroidHz, above2k: spec.above2k, rolloff95Hz: spec.rolloff95Hz, bands,
    correlation: channels === 2 ? correlation(chs[0], chs[1]) : null,
    seam, join,
  };
}

export default function main(args: string[]): void {
  const [dir, out, only] = args;
  const ids = only ? only.split(',') : null;
  const rows: Row[] = [];
  for (const s of SOUNDS) {
    if (ids && !ids.includes(s.id)) continue;
    rows.push(measureFile(dir, s.id, s.channels, !!s.loop));
  }
  fs.writeFileSync(out, JSON.stringify(rows, null, 1));
  const byId = new Map<string, any>(SOUNDS.map((x: any) => [x.id, x]));
  for (const r of rows) {
    const e = byId.get(r.id)?.expect;
    const ok = !e || (r.centroidHz >= e.centroidHz[0] && r.centroidHz <= e.centroidHz[1]);
    if (!ok) console.log('  OUT OF RANGE', r.id, r.centroidHz.toFixed(0), 'expected', e.centroidHz);
  }
  for (const r of rows) console.log(r.id.padEnd(40), r.seconds.toFixed(2).padStart(6), 's', (r.integratedLufs ?? r.meanLufs).toFixed(1).padStart(6), 'LUFS tp', r.truePeakDb.toFixed(1).padStart(6), 'cen', r.centroidHz.toFixed(0).padStart(5), 'a2k', r.above2k.toFixed(2), r.seam ? `seam j=${r.seam.jump.toFixed(1)} k=${r.seam.kink.toFixed(1)} e=${r.seam.energyDb.toFixed(2)} join click=${r.join.click.toFixed(1)}/${r.join.fileMaxStep.toFixed(1)} dip=${r.join.dipDb.toFixed(2)}` : '', r.correlation !== null ? `corr ${r.correlation.toFixed(2)}` : '');
}
