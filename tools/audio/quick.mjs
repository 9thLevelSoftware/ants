#!/usr/bin/env node
// Fast design loop: renders sounds to PCM only (no encoder) and prints the numbers that matter next to the file they replace.
//   node tools/audio/quick.mjs [substring ...]
import { makeRng } from './lib/rng.mjs';
import { renderPcm } from './lib/pipeline.mjs';
import { spectralSummary } from './lib/analysis.mjs';
import { meanLufs, truePeakDb } from './lib/lufs.mjs';
import { SOUNDS } from './sounds/index.mjs';
import fs from 'node:fs';

const OLD = JSON.parse(fs.readFileSync(new URL('./sounds/old-levels.json', import.meta.url), 'utf8')).files;
const pick = process.argv.slice(2);
for (const s of SOUNDS) {
  if (pick.length && !pick.some((p) => s.id.includes(p))) continue;
  const chs = renderPcm(s, makeRng), sp = spectralSummary(chs), o = OLD[s.id];
  const e = s.expect.centroidHz, flag = sp.centroidHz < e[0] || sp.centroidHz > e[1] ? ' <-- centroid outside expected' : '';
  console.log(s.id.slice(6).padEnd(32), `mean ${meanLufs(chs, 44100).toFixed(1)} (old ${o.meanLufs.toFixed(1)})  tp ${truePeakDb(chs).toFixed(1)}  centroid ${sp.centroidHz.toFixed(0)} (old ${o.centroidHz.toFixed(0)})  bands ${sp.bands.map((b) => b.toFixed(2)).join(' ')}${flag}`);
}
