#!/usr/bin/env node
// FOUNDRESS portable build: `npm run build:portable` -> dist-portable/
//
// WHAT IT PRODUCES
//   dist-portable/
//     index.html              inline pack index + ONE deferred classic <script> (no type="module", no crossorigin)
//     foundress.<hash>.js     the whole game: one IIFE bundle, no code splitting, UI fonts inlined as data URIs in
//                             the style element it injects (so there is no CSS file and no font request)
//     packs/<name>.<hash>.js  asset packs: classic scripts that register base64 payloads in
//                             window.__FOUNDRESS_ASSETS__[path]; pack 0 ("core") holds the asset manifest, the
//                             world-generation worker source and the ground / vegetation textures a first game needs;
//                             the other packs (zone textures, audio) are injected lazily by the asset loader on first use
//     CREDITS.md              asset credits + licences of the bundled software and fonts
//   Only assets the game's code references are packed (see assetPlan.mjs); the rest is reported as left out.
//
// WHY IT LOOKS LIKE THIS (architecture section 8)
//   The game may run inside <iframe sandbox="allow-scripts"> with an opaque origin and no CORS headers. There module
//   scripts, import(), fetch() of our own files, module workers and image URLs all fail. Classic scripts and
//   <script src> injection work. The AssetLoader (src/render/assets) reads packs through the pack index and falls back
//   to relative fetch in dev and on normal static hosting, so the same code runs everywhere.
//
// WORKER
//   src/worldgen/worker/entry.ts is built as a classic IIFE bundle and shipped as the pack asset
//   `workers/worldgen.js`. Read it with loadWorkerSource(loader) (src/render/assets/workerSource.ts) and start it with
//   blobWorkerFactory(source) (src/worldgen/worker): a Blob URL needs no network and works in the opaque origin. If
//   Blob, createObjectURL or Worker are unavailable the factory returns null and generation runs on the main thread.
//
// HOW TO PUBLISH
//   Upload the whole folder dist-portable/ to any static host under any sub-path (all URLs are relative), for example
//   https://host/games/foundress/v1/ (open .../v1/index.html), or embed it: <iframe src=".../index.html"
//   sandbox="allow-scripts allow-pointer-lock"> (add allow-same-origin if the host allows it: saves then persist).
//   No special headers, no server code. Cache index.html briefly; every other file name contains a content hash.
//   Verify before publishing: `npm run verify:portable`.
//
// LIMITS (fail the build): total 60 MB, any file 18 MB, any pack 15 MB, 250 files; forbidden patterns (forbidden.mjs).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { OUT_DIR, MANIFEST_ASSET_PATH, WORLDGEN_WORKER_ASSET_PATH } from './config.mjs';
import { buildGame, buildWorker } from './bundles.mjs';
import { planAssets } from './assetPlan.mjs';
import { writePacks } from './packs.mjs';
import { buildCredits } from './credits.mjs';
import { sizeReport } from './sizeReport.mjs';
import { formatFindings, scanClassicSyntax, scanDist, scanJs, scanSources } from './forbidden.mjs';
import { formatBytes, mkdirp, sha8 } from './util.mjs';

const log = (...a) => console.log(...a);

/** A build failure: thrown so main()'s finally removes the temporary folder before the process exits. */
class BuildFailure extends Error {}

function fail(title, body) {
  throw new BuildFailure(`${title}\n${body}`);
}

async function main() {
  const t0 = Date.now();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'foundress-portable-'));
  try {
    log('[1/5] sources: no direct loads outside the asset loader');
    const src = scanSources();
    if (src.findings.length) fail('direct loads in source files', formatFindings(src.findings));

    log('[2/5] game bundle (vite --mode classic)');
    const game = await buildGame(tmp);
    log('[3/5] world-generation worker bundle');
    const worker = await buildWorker(tmp);
    const workerFindings = [...scanJs('worldgen worker', worker), ...scanClassicSyntax('worldgen worker', worker)];
    if (workerFindings.length) fail('forbidden patterns in the worker bundle', formatFindings(workerFindings));

    log('[4/5] asset packs');
    const plan = planAssets();
    fs.rmSync(OUT_DIR, { recursive: true, force: true });
    mkdirp(OUT_DIR);
    const index = writePacks(OUT_DIR, plan, [
      [MANIFEST_ASSET_PATH, Buffer.from(JSON.stringify(plan.manifest))],
      [WORLDGEN_WORKER_ASSET_PATH, Buffer.from(worker)],
    ]);

    const jsName = `foundress.${sha8(game.js)}.js`;
    fs.writeFileSync(path.join(OUT_DIR, jsName), game.js);
    const html = game.html
      .replace(/<script defer src="[^"]+"><\/script>/, `<script>window.__FOUNDRESS_ASSET_INDEX__=${JSON.stringify(index)};</script>\n  <script defer src="./${jsName}"></script>`)
      .replace(/\n\s*<!-- relative URL on purpose[^>]*-->/, '');
    if (!html.includes(jsName)) fail('index.html', 'the game script tag was not found in the Vite output');
    fs.writeFileSync(path.join(OUT_DIR, 'index.html'), html);
    fs.writeFileSync(path.join(OUT_DIR, 'CREDITS.md'), buildCredits());

    log('[5/5] checks');
    const findings = scanDist(OUT_DIR, { loaderFetchCalls: src.loaderFetchCalls });
    const report = sizeReport(OUT_DIR);
    log('\nportable build: dist-portable/');
    log(report.lines.join('\n'));
    const packBytes = (p) => fs.statSync(path.join(OUT_DIR, p.src)).size;
    log('\npacks (load order):');
    for (const p of index.packs) log(`  ${p.src}  ${formatBytes(packBytes(p))}  ${p.paths.length} assets`);
    log(`\nshipped: ${plan.included.materials.length} texture sets, ${plan.included.audio} audio files`);
    const leftBytes = plan.leftOut.reduce((s, a) => s + a.bytes, 0);
    log(`left out (not referenced by the game): ${plan.leftOut.length} files, ${formatBytes(leftBytes)}`);
    log(`  ${[...new Set(plan.leftOut.map((a) => a.id.split('/')[1]))].join(', ') || '(none)'}`);
    log(`built in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

    const problems = [];
    if (findings.length) problems.push(`forbidden patterns:\n${formatFindings(findings)}`);
    if (report.failures.length) problems.push(`size limits:\n  ${report.failures.join('\n  ')}`);
    if (problems.length) fail('checks', problems.join('\n'));
    log('OK');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(`\nbuild:portable FAILED: ${e instanceof BuildFailure ? e.message : `unexpected error\n${e?.stack ?? String(e)}`}`);
  process.exit(1);
});
