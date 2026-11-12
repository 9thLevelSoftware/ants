#!/usr/bin/env node
/**
 * FOUNDRESS headless visual-test harness.
 *
 * Starts its OWN web server on an ephemeral port (so any number of engineers/agents can run
 * it concurrently), launches headless Chromium with software WebGL2 (SwiftShader), opens the
 * page, waits for `window.__ready === true`, runs an optional script, takes screenshots,
 * tears everything down, and prints ONE JSON summary line as the LAST line of stdout.
 *
 * USAGE
 *   node tools/harness/play.mjs --root <dir containing index.html>
 *        [--query "test=1&seed=7"] [--script <file.mjs>] [--out <dir>]
 *        [--width 1280] [--height 720] [--timeout 60000] [--static]
 *   extras:
 *        [--mount /sub/dir/]   (--static only) serve --root under that URL prefix, to prove the
 *                              build works from a sub-path (absolute URLs 404 in this mode)
 *        [--no-ready]          do not wait for window.__ready (page without the flag)
 *        [--script-timeout ms] hard limit for the script (default 300000)
 *        [--ignore <regex>]    console/request errors matching this are not counted (repeatable)
 *        [--channel chromium]  use full Chromium ("new headless") instead of the headless shell
 *        [--dpr 1]             device scale factor (default 1)
 *        [--verbose]           echo page console output to stderr
 *
 * SERVER MODES
 *   default   Vite dev server created programmatically for --root (TypeScript / TSX / bare
 *             `import "three"` work with no build). If <root>/vite.config.* exists it is used,
 *             otherwise a built-in config (TSX -> preact automatic JSX runtime, base "/") is used.
 *   --static  plain static file server for the directory (use it on `vite build` output).
 *
 * SCRIPT CONTRACT (--script file.mjs)
 *   export default async ({ page, shot, log, wait, url, context, browser, out, query }) => { ... }
 *     shot(name)     saves <out>/<name>.png, returns the absolute path
 *     log(...args)   goes to stderr and into summary.logs
 *     wait(ms)       sleep;  wait(fn|string) -> page.waitForFunction;  wait.frames(n) -> n rAFs
 *     A script may `return` a JSON-serialisable value; it appears as summary.result.
 *   Without --script a single screenshot "page" is taken.
 *
 * OUTPUT / EXIT
 *   stdout last line: {"ok":bool,"errors":[...],"screenshots":[...],"timings":{...},...}
 *   exit code 1 if any page error / console error / failed request (not ignored), the ready
 *   flag never appeared, or the script threw. The browser and server are ALWAYS shut down
 *   (finally block + SIGINT/SIGTERM/SIGHUP handlers + watchdog).
 *
 * Playwright is NOT a project dependency: it is resolved from the global install
 * (project node_modules -> NODE_PATH -> /opt/node-tools -> `npm root -g`).
 */
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import { createServer as createHttpServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(HERE, '..', '..');

/** Chromium flags that give working WebGL2 in the no-GPU container (see docs/research/tech-stack.md). */
export const CHROMIUM_ARGS = [
  '--use-angle=swiftshader',
  '--use-gl=angle',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--enable-webgl',
  // keep rAF / timers running at full rate in a headless, never-focused page:
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  '--disable-dev-shm-usage',
];

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.map': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8', '.glb': 'model/gltf-binary',
  '.bin': 'application/octet-stream', '.woff2': 'font/woff2', '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
};

function resolvePlaywright() {
  const candidates = [PROJECT, ...(process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean),
    '/opt/node-tools/node_modules'];
  try { candidates.push(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()); } catch { /* ignore */ }
  for (const base of candidates) {
    try {
      const req = createRequire(path.join(base, 'noop.js'));
      return req('playwright');
    } catch { /* try next */ }
  }
  throw new Error('Cannot resolve global "playwright" (tried project, NODE_PATH, /opt/node-tools, npm root -g)');
}

async function startStaticServer(dir, mount) {
  const prefix = mount ? '/' + mount.replace(/^\/+|\/+$/g, '') + '/' : '/';
  const server = createHttpServer((req, res) => {
    try {
      const u = new URL(req.url, 'http://x');
      let p = decodeURIComponent(u.pathname);
      if (prefix !== '/' && p === prefix.slice(0, -1)) p = prefix;
      if (!p.startsWith(prefix)) { res.writeHead(404); res.end('not under mount ' + prefix); return; }
      p = p.slice(prefix.length);
      let file = path.resolve(dir, p);
      if (file !== dir && !file.startsWith(dir + path.sep)) { res.writeHead(403); res.end('forbidden'); return; }
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      fs.createReadStream(file).pipe(res);
    } catch (e) { res.writeHead(500); res.end(String(e)); }
  });
  await new Promise((r, j) => { server.once('error', j); server.listen(0, '127.0.0.1', r); });
  const port = server.address().port;
  return {
    url: `http://127.0.0.1:${port}${prefix}`,
    close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }),
  };
}

async function startViteServer(root) {
  const vite = await import(pathToFileURL(path.join(PROJECT, 'node_modules/vite/dist/node/index.js')).href);
  const hasConfig = ['vite.config.ts', 'vite.config.js', 'vite.config.mjs'].some((f) => fs.existsSync(path.join(root, f)));
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'foundress-vite-')); // per-run: no cross-process cache races
  const server = await vite.createServer({
    root,
    configFile: hasConfig ? undefined : false,
    // Built-in config (no @preact/preset-vite: it injects `preact/debug` into every file and only adds HMR we disable).
    ...(hasConfig ? {} : { oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } } }),
    logLevel: 'error',
    clearScreen: false,
    cacheDir,
    resolve: { dedupe: ['three'] },
    server: {
      host: '127.0.0.1', port: 0, strictPort: false, open: false,
      hmr: false, watch: null, // no HMR socket, no file watchers: fewer handles, no reloads mid-test
      fs: { allow: [PROJECT, root] },
    },
  });
  await server.listen();
  const addr = server.httpServer.address();
  return {
    url: `http://127.0.0.1:${addr.port}/`,
    close: async () => { try { await server.close(); } finally { fs.rmSync(cacheDir, { recursive: true, force: true }); } },
  };
}

/** SIGKILL every descendant process of this node process (chromium + helpers). */
function killDescendants() {
  const walk = (pid) => {
    let kids = [];
    try { kids = execFileSync('pgrep', ['-P', String(pid)], { encoding: 'utf8' }).split('\n').filter(Boolean).map(Number); } catch { /* none */ }
    return kids.flatMap((k) => [...walk(k), k]);
  };
  for (const pid of walk(process.pid)) { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
}

async function main() {
  const { values: a } = parseArgs({
    options: {
      root: { type: 'string' }, query: { type: 'string', default: '' }, script: { type: 'string' },
      out: { type: 'string' }, width: { type: 'string', default: '1280' }, height: { type: 'string', default: '720' },
      timeout: { type: 'string', default: '60000' }, static: { type: 'boolean', default: false },
      mount: { type: 'string' }, 'no-ready': { type: 'boolean', default: false },
      'script-timeout': { type: 'string', default: '300000' }, ignore: { type: 'string', multiple: true },
      channel: { type: 'string' }, dpr: { type: 'string', default: '1' }, verbose: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
  if (a.help || !a.root) {
    process.stderr.write(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0] + '*/\n');
    process.exit(a.help ? 0 : 2);
  }

  const t0 = Date.now();
  const timings = {};
  const errors = [];
  const logs = [];
  const screenshots = [];
  let result;
  let ready = false;
  let scriptError = null;
  let browser = null;
  let srv = null;
  let cleaned = false;
  const ignore = (a.ignore || []).map((s) => new RegExp(s));
  const timeout = Number(a.timeout);
  const root = path.resolve(a.root);
  const out = path.resolve(a.out || path.join(PROJECT, 'test-output', `play-${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`));
  fs.mkdirSync(out, { recursive: true });
  const say = (...m) => process.stderr.write(m.join(' ') + '\n');
  const addError = (kind, text) => {
    if (ignore.some((r) => r.test(text))) return;
    errors.push({ kind, text: String(text).slice(0, 2000) });
    say(`[${kind}]`, String(text).slice(0, 500));
  };

  const cleanup = async () => {
    if (cleaned) return; cleaned = true;
    const t = Date.now();
    // Under software GL a page that was rendering leaves a GPU-process backlog; browser.close() (and even
    // navigating away) can then take 3-15 s. Nothing needs a graceful exit, so give close() 2 s then SIGKILL
    // every descendant of this process (also what guarantees no orphan chromium).
    const killer = setTimeout(() => killDescendants(), 2000);
    killer.unref();
    await Promise.race([
      (async () => {
        let tt = Date.now();
        try { await browser?.close(); } catch { /* ignore */ }
        timings.browserCloseMs = Date.now() - tt; tt = Date.now();
        try { await srv?.close(); } catch { /* ignore */ }
        timings.serverCloseMs = Date.now() - tt;
      })(),
      new Promise((r) => setTimeout(r, 10000).unref()),
    ]);
    clearTimeout(killer);
    killDescendants(); // belt and braces: nothing of ours may survive
    timings.cleanupMs = Date.now() - t;
  };
  let exiting = false;
  const onSignal = async (sig) => {
    if (exiting) return; exiting = true;
    say(`[harness] ${sig}: shutting down`);
    await cleanup();
    process.stdout.write(JSON.stringify({ ok: false, ready, errors: [...errors, { kind: 'signal', text: sig }], screenshots, timings, out, logs }) + '\n', () => process.exit(130));
  };
  for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, () => onSignal(s));
  // watchdog: guarantees we never hang forever
  const watchdog = setTimeout(async () => { say('[harness] watchdog expired'); await cleanup(); process.exit(124); },
    timeout + Number(a['script-timeout']) + 60000);
  watchdog.unref();

  try {
    // ---- server
    let t = Date.now();
    if (!fs.existsSync(root)) throw new Error(`--root not found: ${root}`);
    srv = a.static ? await startStaticServer(root, a.mount) : await startViteServer(root);
    timings.serverMs = Date.now() - t;
    const query = (a.query || '').replace(/^\?/, '');
    const url = srv.url + (query ? '?' + query : '');
    say(`[harness] serving ${root} at ${srv.url}`);

    // ---- browser
    t = Date.now();
    const { chromium } = resolvePlaywright();
    browser = await chromium.launch({
      args: CHROMIUM_ARGS, channel: a.channel, handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false,
    });
    const context = await browser.newContext({
      viewport: { width: Number(a.width), height: Number(a.height) },
      deviceScaleFactor: Number(a.dpr),
    });
    const page = await context.newPage();
    timings.launchMs = Date.now() - t;

    page.on('console', (m) => {
      if (m.type() === 'error') addError('console.error', m.text() + (m.location()?.url ? ` (${m.location().url}:${m.location().lineNumber})` : ''));
      else if (a.verbose) say(`[page:${m.type()}]`, m.text());
    });
    page.on('pageerror', (e) => addError('pageerror', e.stack || e.message || e));
    page.on('requestfailed', (r) => { if (!/favicon\.ico/.test(r.url())) addError('requestfailed', `${r.method()} ${r.url()} ${r.failure()?.errorText}`); });
    page.on('response', (r) => { if (r.status() >= 400 && !/favicon\.ico/.test(r.url())) addError('http', `${r.status()} ${r.url()}`); });
    page.on('crash', () => addError('crash', 'page crashed'));
    // fail-fast bookkeeping (see ready wait below)
    let fatalSeen = false;
    let onFatal = () => {};
    const fatal = () => { fatalSeen = true; onFatal(); };
    page.on('pageerror', fatal);
    page.on('response', (r) => { if (r.status() >= 500) fatal(); });
    page.on('requestfailed', (r) => { if (/\.(m?js|ts|tsx|css)(\?|$)/.test(r.url())) fatal(); });

    // ---- load + ready
    t = Date.now();
    await page.goto(url, { waitUntil: 'load', timeout });
    timings.loadMs = Date.now() - t;
    t = Date.now();
    if (a['no-ready']) ready = true;
    else {
      // fail fast: an uncaught page error / 5xx / failed script load means the page will almost
      // certainly never become ready; give it 5 s of grace instead of burning the whole timeout.
      let abort;
      const aborted = new Promise((r) => { abort = r; });
      let graceTimer = null;
      const arm = () => { graceTimer ??= setTimeout(() => abort('aborted'), 5000); };
      onFatal = arm; // later fatals arm it too
      if (fatalSeen) arm(); // fatal happened during page.goto
      try {
        const r = await Promise.race([
          page.waitForFunction(() => window.__ready === true, null, { timeout, polling: 100 }).then(() => 'ready'),
          aborted,
        ]);
        if (r === 'ready') ready = true;
        else addError('ready', 'window.__ready not set 5 s after a fatal page error (aborting early)');
      } catch (e) { addError('ready', `window.__ready never became true within ${timeout} ms`); }
      clearTimeout(graceTimer);
    }
    timings.readyMs = Date.now() - t;

    // ---- script / default screenshot
    const shot = async (name) => {
      const file = path.join(out, `${String(name).replace(/[^\w.-]+/g, '_')}.png`);
      await page.screenshot({ path: file });
      screenshots.push(file);
      return file;
    };
    const log = (...m) => { const s = m.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '); logs.push(s); say('[script]', s); };
    const wait = (arg, opts) => (typeof arg === 'number' ? new Promise((r) => setTimeout(r, arg))
      : page.waitForFunction(arg, opts?.arg, { timeout, polling: 100, ...opts }));
    wait.frames = (n = 1) => page.evaluate((n) => new Promise((res) => { let i = 0; const f = () => (++i >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

    t = Date.now();
    if (ready) {
      if (a.script) {
        const mod = await import(pathToFileURL(path.resolve(a.script)).href);
        if (typeof mod.default !== 'function') throw new Error('--script must default-export an async function');
        try {
          result = await Promise.race([
            mod.default({ page, shot, log, wait, url: srv.url, query, context, browser, out, root }),
            new Promise((_, rej) => setTimeout(() => rej(new Error('script timeout')), Number(a['script-timeout'])).unref()),
          ]);
        } catch (e) { scriptError = e; addError('script', e.stack || e.message); }
      } else {
        await shot('page');
      }
    } else {
      // ready never appeared: still grab a screenshot to help debugging
      try { await shot('not-ready'); } catch { /* ignore */ }
    }
    timings.scriptMs = Date.now() - t;
  } catch (e) {
    addError('harness', e.stack || e.message);
  } finally {
    await cleanup();
    timings.totalMs = Date.now() - t0;
    const ok = errors.length === 0 && ready && !scriptError;
    const summary = { ok, ready, errors, screenshots, timings, out, url: srv?.url, logs, result };
    process.stdout.write(JSON.stringify(summary) + '\n', () => process.exit(ok ? 0 : 1));
  }
}

main().catch((e) => { process.stderr.write(String(e.stack || e) + '\n'); process.stdout.write(JSON.stringify({ ok: false, errors: [{ kind: 'fatal', text: String(e) }], screenshots: [], timings: {} }) + '\n', () => process.exit(1)); });
