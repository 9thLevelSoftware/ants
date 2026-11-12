// Adversarial review tests for the portable build tooling (tools/build). Plain Node test runner, no browser:
//   node --test tools/build/portable.verify.test.mjs
// (vitest only collects src/** and tests/**, so these .mjs build tools are tested with node:test.)
// Tests marked "REVIEW FINDING" fail on purpose until the defect they demonstrate is fixed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LIMITS, OUT_DIR, PACK_TARGET_BYTES, PUBLIC_ASSETS, ROOT } from './config.mjs';
import { scanClassicSyntax, scanDist, scanHtml, scanJs, scanSources } from './forbidden.mjs';
import { planAssets } from './assetPlan.mjs';
import { writePacks } from './packs.mjs';
import { sizeReport } from './sizeReport.mjs';
import { buildCredits } from './credits.mjs';

const tmpDir = (tag) => fs.mkdtempSync(path.join(os.tmpdir(), `foundress-verify-${tag}-`));
const rules = (findings) => findings.map((f) => f.rule).join(' | ');
const GOOD_HTML = '<!doctype html><html><head><script>window.__FOUNDRESS_ASSET_INDEX__={"version":1,"packs":[]};</script>\n'
  + '<script defer src="./foundress.abc.js"></script></head><body></body></html>';

// ---------------------------------------------------------------- forbidden patterns: regression checks

test('scanHtml: the good shape is clean', () => {
  assert.deepEqual(scanHtml('index.html', GOOD_HTML), []);
});

test('scanHtml: module scripts, preloads, protocol-relative and root URLs, non-deferred script are caught', () => {
  const cases = {
    unquotedModule: GOOD_HTML.replace('<script defer', '<script type=module defer'),
    upperCase: GOOD_HTML.replace('<script defer src', '<SCRIPT TYPE="MODULE" defer SRC'),
    modulepreload: GOOD_HTML.replace('</head>', '<link rel=modulepreload href="./x.js"></head>'),
    protocolRelative: GOOD_HTML.replace('./foundress.abc.js', '//cdn.example.com/foundress.abc.js'),
    rootRelativeCss: GOOD_HTML.replace('</head>', '<link rel="stylesheet" href="/style.css"></head>'),
    notDeferred: GOOD_HTML.replace('<script defer src', '<script src'),
    noScript: GOOD_HTML.replace('<script defer src="./foundress.abc.js"></script>', ''),
  };
  for (const [name, html] of Object.entries(cases)) assert.ok(scanHtml('index.html', html).length > 0, `${name} was not caught`);
});

test('scanHtml: data: URLs are allowed', () => {
  assert.deepEqual(scanHtml('index.html', GOOD_HTML.replace('</head>', '<link rel="icon" href="data:,"></head>')), []);
});

test('scanJs: dynamic import, import.meta workers, importScripts, XHR are caught; w3.org namespaces allowed', () => {
  assert.deepEqual(scanJs('a.js', 'document.createElementNS("http://www.w3.org/2000/svg","svg")'), []);
  const bad = {
    importSpace: 'import ("./x.js")',
    workerUrl: 'new Worker(new URL("./w.js", import.meta.url))',
    importScripts: 'importScripts("x.js")',
    xhr: 'new XMLHttpRequest()',
    audio: 'new Audio("x.mp3")',
    cdn: 'const u = "https://cdn.example.com/x.png"',
  };
  for (const [name, js] of Object.entries(bad)) assert.ok(scanJs('a.js', js).length > 0, `${name} was not caught`);
});

test('scanJs: fetch( count is limited to the loader\'s', () => {
  assert.deepEqual(scanJs('a.js', 'w.fetch(u)', { allowFetchCalls: 1 }), []);
  assert.equal(scanJs('a.js', 'w.fetch(u); fetch("./assets/x.jpg")', { allowFetchCalls: 1 }).length, 1);
});

test('scanClassicSyntax: ESM syntax is rejected, a classic IIFE accepted', () => {
  assert.deepEqual(scanClassicSyntax('a.js', '(function(){var a=1;})();'), []);
  assert.equal(scanClassicSyntax('a.js', 'export default 1;').length, 1);
  assert.equal(scanClassicSyntax('a.js', 'import x from "y";').length, 1);
});

test('scanSources: direct loads outside the loader are flagged, tests are skipped, loader fetch is counted', () => {
  const dir = tmpDir('src');
  try {
    fs.mkdirSync(path.join(dir, 'render/assets'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'ui'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'render/assets/backends.ts'), 'export const f = (w: any, u: string) => w.fetch(u);\n');
    fs.writeFileSync(path.join(dir, 'ui/a.test.ts'), 'fetch("x"); new Audio("y");\n');
    fs.writeFileSync(path.join(dir, 'ui/b.verify.test.ts'), 'fetch("x");\n');
    fs.writeFileSync(path.join(dir, 'ui/c.tsx'), '// fetch("in a comment") is fine\nexport const i = new Image();\n');
    const r = scanSources(dir);
    assert.equal(r.loaderFetchCalls, 1);
    assert.deepEqual(r.findings.map((f) => f.file), ['src/ui/c.tsx']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------- asset plan and packs

test('planAssets: core first, packs under the target, every shipped manifest path is packed exactly once', () => {
  const plan = planAssets();
  assert.equal(plan.packs[0].name, 'core');
  const packed = new Map();
  for (const p of plan.packs) {
    const size = p.assets.reduce((s, a) => s + a.size, 0);
    assert.ok(size <= PACK_TARGET_BYTES, `pack ${p.name} is ${size} bytes`);
    for (const a of p.assets) {
      assert.ok(!packed.has(a.path), `${a.path} is in two packs`);
      packed.set(a.path, p.name);
    }
  }
  // A path the shipped manifest names but no pack holds would be fetched over the network: fatal in the opaque origin.
  for (const a of plan.manifest.assets) assert.ok(packed.has(a.path), `${a.path} is in the shipped manifest but in no pack`);
  for (const [id, m] of Object.entries(plan.manifest.materials)) {
    for (const p of Object.values(m.maps)) assert.ok(packed.has(p), `material ${id} map ${p} is in no pack`);
  }
  // nothing is both shipped and reported as left out
  const shippedIds = new Set(plan.manifest.assets.map((a) => a.id));
  for (const l of plan.leftOut) assert.ok(!shippedIds.has(l.id), `${l.id} shipped and left out`);
  assert.equal(plan.manifest.assets.length + plan.leftOut.length, JSON.parse(fs.readFileSync(path.join(PUBLIC_ASSETS, 'manifest.json'), 'utf8')).assets.length);
});

test('planAssets: a texture set named only in a test file or in sim code is left out', () => {
  // sources = what readReferenceSources returns (render/ui/game/input/audio, tests excluded); an unquoted name is no reference
  const plan = planAssets({ sources: "const a = 'soil_garden'; const b = brick;" });
  assert.deepEqual(plan.included.materials, ['soil_garden']);
  assert.ok(plan.leftOut.some((l) => l.id.startsWith('tex/brick/')) || plan.leftOut.some((l) => l.id.includes('brick')));
  const none = planAssets({ sources: '' });
  assert.equal(none.included.materials.length, 0);
  assert.equal(none.packs[0].name, 'core');
});

test('planAssets: the size estimate matches the bytes writePacks really writes', () => {
  const plan = planAssets({ sources: "'rubber_playground'" });
  const dir = tmpDir('packs');
  try {
    const small = { name: 'core', assets: plan.packs.find((p) => p.assets.length).assets.slice(0, 2) };
    const index = writePacks(dir, { packs: [small] }, []);
    const written = fs.statSync(path.join(dir, index.packs[0].src)).size;
    const estimated = small.assets.reduce((s, a) => s + a.size, 0);
    // wrapper head + tail are about 70 bytes; the estimate must be close and never far below the truth
    assert.ok(Math.abs(written - estimated) < 200, `written ${written}, estimated ${estimated}`);
    // the pack registers into the global the loader reads
    const g = {};
    new Function('window', fs.readFileSync(path.join(dir, index.packs[0].src), 'utf8'))(g);
    assert.deepEqual(Object.keys(g.__FOUNDRESS_ASSETS__).sort(), small.assets.map((a) => a.path).sort());
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------- size limits

test('sizeReport: file count, per-file and per-pack limits fail; an empty folder does not throw', () => {
  const dir = tmpDir('size');
  try {
    assert.deepEqual(sizeReport(dir).failures, []);
    for (let i = 0; i <= LIMITS.fileCount; i++) fs.writeFileSync(path.join(dir, `f${i}.txt`), 'x');
    assert.ok(sizeReport(dir).failures.some((f) => /files exceed/.test(f)));
    for (let i = 0; i <= LIMITS.fileCount; i++) fs.rmSync(path.join(dir, `f${i}.txt`));
    fs.mkdirSync(path.join(dir, 'packs'));
    const sparse = (rel, bytes) => { const fd = fs.openSync(path.join(dir, rel), 'w'); fs.ftruncateSync(fd, bytes); fs.closeSync(fd); };
    sparse('packs/p.js', LIMITS.packBytes + 1);
    assert.ok(sizeReport(dir).failures.some((f) => /pack limit/.test(f)));
    sparse('big.js', LIMITS.fileBytes + 1);
    assert.ok(sizeReport(dir).failures.some((f) => /per-file limit/.test(f)));
    for (let i = 0; i < 4; i++) sparse(`t${i}.bin`, 16 * 1000 * 1000);
    assert.ok(sizeReport(dir).failures.some((f) => /^total/.test(f)));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------- the built output (skipped when not built)

test('dist-portable: the pack index covers every asset the shipped manifest names', { skip: !fs.existsSync(path.join(OUT_DIR, 'index.html')) }, () => {
  const html = fs.readFileSync(path.join(OUT_DIR, 'index.html'), 'utf8');
  const index = JSON.parse(html.match(/__FOUNDRESS_ASSET_INDEX__=(\{.*?\});<\/script>/)[1]);
  const g = {};
  new Function('window', fs.readFileSync(path.join(OUT_DIR, index.packs[0].src), 'utf8'))(g);
  const manifest = JSON.parse(Buffer.from(g.__FOUNDRESS_ASSETS__['assets/manifest.json'], 'base64').toString('utf8'));
  const indexed = new Set(index.packs.flatMap((p) => p.paths));
  for (const a of manifest.assets) assert.ok(indexed.has(a.path), `${a.path} not in the pack index`);
  assert.ok(indexed.has('workers/worldgen.js'));
  for (const p of index.packs) assert.ok(fs.existsSync(path.join(OUT_DIR, p.src)), `${p.src} missing`);
  assert.deepEqual(scanDist(OUT_DIR, { loaderFetchCalls: scanSources().loaderFetchCalls }), []);
});

// ---------------------------------------------------------------- REVIEW FINDINGS (fail until fixed)

test('REVIEW FINDING: the absolute-URL allow-list is a prefix match, so look-alike hosts pass', () => {
  // public/assets/CREDITS.md contains the bare "https://ambientcg.com"; forbidden.mjs allows any URL that starts with it.
  const findings = scanJs('a.js', 's.src = "https://ambientcg.com.evil.example/payload.js";');
  assert.ok(findings.length > 0, 'an absolute URL on a different host was allowed because it starts with a credits URL');
});

test('REVIEW FINDING: inline <script> / <style> in index.html are not scanned for import(, fetch( or absolute URLs', () => {
  const cases = {
    inlineDynamicImport: GOOD_HTML.replace('</head>', '<script>import("./late.js")</script></head>'),
    inlineFetch: GOOD_HTML.replace('</head>', '<script>fetch("./assets/manifest.json")</script></head>'),
    inlineCssImport: GOOD_HTML.replace('</head>', '<style>@import url(https://fonts.example.com/css);</style></head>'),
  };
  const missed = Object.entries(cases).filter(([, html]) => scanHtml('index.html', html).length === 0).map(([n]) => n);
  assert.deepEqual(missed, [], `missed in index.html: ${missed.join(', ')}`);
});

test('REVIEW FINDING: CREDITS.md lacks the licence of @preact/signals-core, which is bundled (MIT notice required)', () => {
  const bundled = fs.readdirSync(path.join(ROOT, 'node_modules/@preact')).includes('signals-core');
  assert.ok(bundled);
  assert.match(buildCredits(), /signals-core/);
});
