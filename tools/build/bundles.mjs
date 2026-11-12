// The two Vite builds of the portable output: the game (classic IIFE bundle, vite.config.ts --mode classic) and the
// world-generation worker (a classic IIFE bundle of worldgen/worker/entry.ts whose text is shipped as a pack asset and
// started from a Blob URL).
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'vite';
import { ROOT, SRC_DIR, WORKER_ENTRY } from './config.mjs';

/** Builds the game; returns { html, js } texts. `publicDir` is off: assets travel in packs, not as copies. */
export async function buildGame(tmpDir) {
  const outDir = path.join(tmpDir, 'app');
  await build({
    root: ROOT, configFile: path.join(ROOT, 'vite.config.ts'), mode: 'classic', logLevel: 'warn',
    publicDir: false,
    build: { outDir, emptyOutDir: true, sourcemap: false, reportCompressedSize: false, chunkSizeWarningLimit: 6000 },
  });
  const files = fs.readdirSync(path.join(outDir, 'assets')).filter((f) => f.endsWith('.js'));
  if (files.length !== 1) throw new Error(`expected one game bundle, found ${files.length}: ${files.join(', ')}`);
  return {
    html: fs.readFileSync(path.join(outDir, 'index.html'), 'utf8'),
    js: fs.readFileSync(path.join(outDir, 'assets', files[0]), 'utf8'),
    jsName: files[0],
  };
}

/** Builds the worker as one classic script; returns its text. */
export async function buildWorker(tmpDir) {
  const outDir = path.join(tmpDir, 'worker');
  await build({
    root: ROOT, configFile: false, logLevel: 'warn', publicDir: false,
    resolve: { alias: [{ find: /^@\//, replacement: SRC_DIR + '/' }] },
    build: {
      target: 'es2022', outDir, emptyOutDir: true, sourcemap: false, minify: true, reportCompressedSize: false,
      lib: { entry: WORKER_ENTRY, formats: ['iife'], name: 'FoundressWorldgenWorker', fileName: () => 'worldgen-worker.js' },
      rolldownOptions: { output: { codeSplitting: false } },
    },
  });
  return fs.readFileSync(path.join(outDir, 'worldgen-worker.js'), 'utf8');
}
