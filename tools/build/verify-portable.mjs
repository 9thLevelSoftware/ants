#!/usr/bin/env node
// `npm run verify:portable`: proves dist-portable/ is portable.
//   1. static checks: size limits and forbidden patterns in the output, direct loads in the sources
//   2. the build served by the harness (--static) from a sub-path, booted with ?test=1&autostart=1
//   3. the build inside <iframe sandbox="allow-scripts allow-pointer-lock"> (opaque origin) on a host page
// Stages 2 and 3 run tests/e2e/portable.mjs (steps the simulation, screenshots, audio, worker, fonts). The harness
// fails them on any console error, failed request or blocked resource; this script also fails on asset-loader
// warnings in the page console (a texture that fell back to a placeholder means a pack did not load).
// Screenshots: test-output/portable/{subpath,iframe}/ (world.png, title.png).
//
// Options: --dist <dir>   verify another folder (default dist-portable)
//          --scan-only    stage 1 only (no browser)
//          --self-test    negative test: inject each forbidden pattern into a copy of the output and require stage 1
//                         to fail for every one (no browser)
//          --skip-iframe  stage 2 only
//          --no-build     verify the folder as it is (default: rebuild first when it is missing or older than src/)
//          --lenient      tolerate the known defects of other modules listed in KNOWN_ISSUES (strict is the default)
// Exit code 0 = all passed, 1 = any failure.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { OUT_DIR, ROOT } from './config.mjs';
import { formatFindings, scanDist, scanSources } from './forbidden.mjs';
import { sizeReport } from './sizeReport.mjs';
import { listFiles, mkdirp } from './util.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const dist = path.resolve(opt('dist', OUT_DIR));
const outRoot = path.join(ROOT, 'test-output/portable');
const MOUNT = '/games/foundress/v1/';
const QUERY = 'test=1&autostart=1&seed=1';

// Known defects of OTHER modules that the harness would count as console errors. Each entry must be narrow and listed
// in the task report. Strict by default (gate 1B: the autofocus error is fixed, the list is empty); `--lenient`
// tolerates the entries while an owner fixes a new one.
const KNOWN_ISSUES = [];
const ignoreArgs = () => (!flag('lenient') ? [] : KNOWN_ISSUES.flatMap((k) => ['--ignore', k.match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')]));

const say = (...m) => console.log(...m);
const failures = [];
const stage = (name, ok, detail = '') => {
  say(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n${detail}` : ''}`);
  if (!ok) failures.push(name);
};

/** Stage 1. Returns the findings (empty when clean). */
function staticChecks(dir) {
  const src = scanSources();
  const findings = [...src.findings, ...scanDist(dir, { loaderFetchCalls: src.loaderFetchCalls })];
  const report = sizeReport(dir);
  return { findings, report };
}

function runHarness(label, harnessArgs, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'tools/harness/play.mjs'), ...harnessArgs, '--verbose'], {
      cwd: ROOT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => {
      let summary = null;
      try { summary = JSON.parse(out.trim().split('\n').pop()); } catch { /* no summary */ }
      resolve({ label, code, summary, err });
    });
  });
}

/** Lines the asset loader logged as warnings in the page console: a pack or texture did not load. */
function loaderWarnings(stderr) {
  return stderr.split('\n').filter((l) => /^\[page:(warning|error)\] \[assets\]/.test(l) || /asset pack failed|using a placeholder/.test(l));
}

function reportHarness(r, expectFile) {
  const warnings = loaderWarnings(r.err);
  const errors = r.summary?.errors ?? [{ kind: 'harness', text: 'no summary from the harness; stderr tail:\n' + r.err.split('\n').slice(-8).join('\n') }];
  const ok = r.code === 0 && r.summary?.ok === true && warnings.length === 0 && !!r.summary?.screenshots?.some((s) => s.endsWith(expectFile));
  const detail = [
    ...errors.map((e) => `  [${e.kind}] ${String(e.text).slice(0, 400)}`),
    ...warnings.map((w) => `  ${w.slice(0, 300)}`),
    r.summary?.result ? `  screenshots: ${r.summary.screenshots.join(', ')}` : '',
    r.summary?.result?.audio ? `  audio: ${JSON.stringify(r.summary.result.audio)}` : '',
    r.summary?.result?.worker ? `  worker: ${JSON.stringify(r.summary.result.worker)}` : '',
    r.summary?.result?.fonts ? `  fonts loaded: ${JSON.stringify(r.summary.result.fonts.faces)}` : '',
    r.summary?.result?.play ? `  short play: ${JSON.stringify(r.summary.result.play)}` : '',
  ].filter(Boolean).join('\n');
  stage(r.label, ok, detail);
}

/** Negative test: every forbidden pattern injected into a copy of the output must make stage 1 fail. */
function selfTest() {
  const cases = [
    ['type="module" script in index.html', (d) => edit(d, 'index.html', (t) => t.replace('<script defer', '<script type="module" defer'))],
    ['crossorigin attribute in index.html', (d) => edit(d, 'index.html', (t) => t.replace('<script defer', '<script crossorigin defer'))],
    ['dynamic import( in the game bundle', (d) => editJs(d, (t) => `${t}\nvoid import("./x.js");`)],
    ['import.meta in the game bundle', (d) => editJs(d, (t) => `${t}\nvoid import.meta.url;`)],
    ['absolute URL in the game bundle', (d) => editJs(d, (t) => `${t}\nvoid "https://example.com/a.png";`)],
    ['extra fetch( of an asset in the game bundle', (d) => editJs(d, (t) => `${t}\nvoid fetch("./assets/x.jpg");`)],
    ['absolute URL in a pack', (d) => editPack(d, (t) => `${t}\nvoid "http://cdn.example.com/a.js";`)],
    ['second external script in index.html', (d) => edit(d, 'index.html', (t) => t.replace('</head>', '<script src="./extra.js"></script></head>'))],
    ['root-absolute script URL in index.html', (d) => edit(d, 'index.html', (t) => t.replace(/src="\.\/foundress/, 'src="/foundress'))],
  ];
  let allFailed = true;
  for (const [name, mutate] of cases) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'foundress-neg-'));
    try {
      copyDir(dist, tmp);
      mutate(tmp);
      const { findings } = staticChecks(tmp);
      const caught = findings.length > 0;
      say(`${caught ? 'caught ' : 'MISSED '} ${name}${caught ? `  -> ${findings[0].rule}` : ''}`);
      if (!caught) allFailed = false;
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  // the source lint: a direct fetch / new Worker / new Audio outside the asset loader must be flagged
  const fakeSrc = fs.mkdtempSync(path.join(os.tmpdir(), 'foundress-neg-src-'));
  try {
    mkdirp(path.join(fakeSrc, 'render/assets'));
    fs.writeFileSync(path.join(fakeSrc, 'render/assets/loader.ts'), 'export const ok = (u: string) => fetch(u);\n');
    fs.writeFileSync(path.join(fakeSrc, 'render/fx.ts'), 'export const a = new Audio("x.mp3");\nexport const b = fetch("./assets/x.jpg");\nexport const w = new Worker("w.js");\n');
    const lint = scanSources(fakeSrc);
    const flagged = lint.findings.map((f) => f.rule);
    const ok = flagged.length === 3 && lint.loaderFetchCalls === 1;
    say(`${ok ? 'caught ' : 'MISSED '} direct Audio / fetch / Worker in a source file (${flagged.length} flagged, loader fetch calls ${lint.loaderFetchCalls})`);
    if (!ok) allFailed = false;
  } finally { fs.rmSync(fakeSrc, { recursive: true, force: true }); }
  // sanity: the unmodified copy passes
  const clean = staticChecks(dist);
  say(`${clean.findings.length === 0 ? 'clean  ' : 'DIRTY  '} unmodified output has no findings`);
  stage('negative test: every injected forbidden pattern is caught', allFailed && clean.findings.length === 0);
}

/** Newest modification time under src/, index.html and public/assets (a build older than this is stale). */
function newestSourceMs() {
  let newest = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else newest = Math.max(newest, fs.statSync(p).mtimeMs);
    }
  };
  for (const d of ['src', 'public/assets']) if (fs.existsSync(path.join(ROOT, d))) walk(path.join(ROOT, d));
  newest = Math.max(newest, fs.statSync(path.join(ROOT, 'index.html')).mtimeMs);
  return newest;
}

const copyDir = (from, to) => fs.cpSync(from, to, { recursive: true });
const edit = (d, rel, fn) => { const f = path.join(d, rel); fs.writeFileSync(f, fn(fs.readFileSync(f, 'utf8'))); };
const editJs = (d, fn) => edit(d, listFiles(d).find((f) => /^foundress\..*\.js$/.test(f)), fn);
const editPack = (d, fn) => edit(d, listFiles(d).find((f) => f.startsWith('packs/')), fn);

async function main() {
  const stale = fs.existsSync(path.join(dist, 'index.html')) && newestSourceMs() > fs.statSync(path.join(dist, 'index.html')).mtimeMs;
  if (!flag('no-build') && (!fs.existsSync(path.join(dist, 'index.html')) || stale)) {
    say(`${dist} is ${stale ? 'older than the sources' : 'missing'}: running build:portable first`);
    const b = spawnSync(process.execPath, [path.join(ROOT, 'tools/build/portable.mjs')], { cwd: ROOT, stdio: 'inherit' });
    if (b.status !== 0) { console.error('build:portable failed'); process.exit(1); }
  }

  if (flag('self-test')) { selfTest(); return finish(); }

  const { findings, report } = staticChecks(dist);
  stage('static: forbidden patterns and direct loads', findings.length === 0, formatFindings(findings));
  stage(`static: size limits (${report.lines[report.lines.length - 1].trim()})`, report.failures.length === 0, report.failures.join('\n'));
  if (flag('scan-only')) return finish();

  fs.rmSync(outRoot, { recursive: true, force: true });
  mkdirp(outRoot);
  say('\nbooting from a sub-path (harness --static --mount) ...');
  const sub = await runHarness('served from a sub-path, game boots, renders, packs load', [
    '--static', '--mount', MOUNT, '--root', dist, '--query', QUERY, '--script', path.join(ROOT, 'tests/e2e/portable.mjs'),
    ...ignoreArgs(), '--out', path.join(outRoot, 'subpath'), '--script-timeout', '400000', '--timeout', '180000',
  ], { PORTABLE_MODE: 'subpath' });
  reportHarness(sub, 'title.png');
  if (flag('skip-iframe')) return finish();

  say('\nbooting inside <iframe sandbox="allow-scripts allow-pointer-lock"> ...');
  const host = path.join(outRoot, 'host');
  copyDir(dist, path.join(host, 'game'));
  fs.writeFileSync(path.join(host, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><title>sandboxed host</title>
<style>html,body{margin:0;height:100%;background:#000}iframe{border:0;width:100vw;height:100vh;display:block}</style></head>
<body><iframe id="game" sandbox="allow-scripts allow-pointer-lock" src="game/index.html?${QUERY}"></iframe></body></html>\n`);
  const frame = await runHarness('inside a sandboxed iframe (opaque origin), game boots, renders, packs load', [
    '--static', '--root', host, '--no-ready', '--script', path.join(ROOT, 'tests/e2e/portable.mjs'),
    ...ignoreArgs(), '--out', path.join(outRoot, 'iframe'), '--script-timeout', '400000', '--timeout', '180000',
  ], { PORTABLE_MODE: 'iframe' });
  reportHarness(frame, 'title.png');
  fs.rmSync(host, { recursive: true, force: true }); // 25 MB copy, not needed afterwards
  finish();
}

function finish() {
  say(failures.length ? `\nverify:portable FAILED (${failures.length}): ${failures.join('; ')}` : '\nverify:portable OK');
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => { console.error(e?.stack ?? e); process.exit(1); });
