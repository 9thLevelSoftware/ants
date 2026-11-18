#!/usr/bin/env node
// Renders every replaced sound to public/assets/audio (deterministic: same seeds, same bytes).
//   node tools/audio/render.mjs [--out <dir>] [--only id,id] [--wav-dir <dir>]
// --wav-dir also writes float32 WAVs of the final channels (for listening tools; not used by the game).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRng } from './lib/rng.mjs';
import { renderMp3 } from './lib/pipeline.mjs';
import { SOUNDS } from './sounds/index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function renderAll({ outDir = path.join(ROOT, 'public/assets'), only = null, log = () => {} } = {}) {
  const done = [];
  for (const spec of SOUNDS) {
    if (only && !only.includes(spec.id)) continue;
    const t0 = Date.now();
    const { bytes } = renderMp3(spec, makeRng);
    const file = path.join(outDir, `${spec.id}.mp3`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
    done.push({ id: spec.id, file, bytes: bytes.length });
    log(`${spec.id}: ${bytes.length} bytes (${Date.now() - t0} ms)`);
  }
  return done;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const only = arg('--only')?.split(',').map((s) => (s.startsWith('audio/') ? s : `audio/${s}`)) ?? null;
  renderAll({ outDir: arg('--out') ? path.resolve(arg('--out')) : undefined, only, log: console.log });
}
