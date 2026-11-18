#!/usr/bin/env node
// Markdown tables for docs/design/tasks/audio-provenance-report.md from two measure.ts outputs (before, after).
//   node tools/audio/report-tables.mjs <old.json> <new.json>
import fs from 'node:fs';
import { SOUNDS } from './sounds/index.mjs';

const [oldPath, newPath] = process.argv.slice(2);
const old = new Map(JSON.parse(fs.readFileSync(oldPath, 'utf8')).map((r) => [r.id, r]));
const rows = JSON.parse(fs.readFileSync(newPath, 'utf8'));
const f = (v, d = 1) => (v === null || v === undefined ? '-' : Number.isFinite(v) ? v.toFixed(d) : String(v));
const lvl = (r) => (r.integratedLufs !== null ? r.integratedLufs : r.meanLufs);
const spec = new Map(SOUNDS.map((s) => [s.id, s]));
const short = (id) => id.replace('audio/', '');

console.log('### Loops and beds (before / after)\n');
console.log('| sound | target | length s | LUFS | true peak dBFS | centroid Hz | share > 2 kHz | wrap jump | wrap kink | wrap level step dB | join click (file max) | join dip dB | stereo corr |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  const s = spec.get(r.id);
  if (!s.loop) continue;
  const o = old.get(r.id);
  const pair = (a, b, d = 1) => `${f(a, d)} / ${f(b, d)}`;
  console.log(`| \`${short(r.id)}\` | ${s.lufs} LUFS | ${pair(o.seconds, r.seconds, 2)} | ${pair(lvl(o), lvl(r))} | ${pair(o.truePeakDb, r.truePeakDb)} | ${pair(o.centroidHz, r.centroidHz, 0)} | ${pair(o.above2k, r.above2k, 2)} | ${pair(o.seam.jump, r.seam.jump)} | ${pair(o.seam.kink, r.seam.kink)} | ${pair(o.seam.energyDb, r.seam.energyDb, 2)} | ${pair(o.join.click, r.join.click)} (${f(r.join.fileMaxStep)}) | ${pair(o.join.dipDb, r.join.dipDb, 2)} | ${r.correlation === null ? '-' : pair(o.correlation, r.correlation, 2)} |`);
}
console.log('\n### One-shots (before / after)\n');
console.log('| sound | length s | mean LUFS | true peak dBFS | centroid Hz | share > 2 kHz | expected centroid (reason) |');
console.log('|---|---|---|---|---|---|---|');
for (const r of rows) {
  const s = spec.get(r.id);
  if (s.loop) continue;
  const o = old.get(r.id);
  const pair = (a, b, d = 1) => `${f(a, d)} / ${f(b, d)}`;
  console.log(`| \`${short(r.id)}\` | ${pair(o.seconds, r.seconds, 2)} | ${pair(o.meanLufs, r.meanLufs)} | ${pair(o.truePeakDb, r.truePeakDb)} | ${pair(o.centroidHz, r.centroidHz, 0)} | ${pair(o.above2k, r.above2k, 2)} | ${s.expect.centroidHz[0]}-${s.expect.centroidHz[1]} (${s.expect.why}) |`);
}
