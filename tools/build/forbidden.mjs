// Forbidden-pattern checks for the portable output (and the sources that feed it). Pure functions over text, so the
// build, the verification and the negative self-test share them.
//
// Why: a classic script bundle inside an opaque-origin iframe cannot use module scripts, dynamic import(), fetch()
// of its own files, worker URLs or cross-origin requests (architecture section 8). Each rule below is one way a
// build can silently stop being portable.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { PUBLIC_ASSETS, SRC_DIR } from './config.mjs';
import { listFiles } from './util.mjs';

/** Absolute URLs that are plain text, not requests: XML namespaces three.js and the DOM use for createElementNS. */
const URL_ALLOW = [/^https?:\/\/www\.w3\.org\//];

/** Source files that may call fetch / create workers / images directly: the asset loader and nothing else. */
const LOADER_DIR = 'render/assets/';
const DIRECT_LOAD_RULES = [
  { name: 'fetch(', re: /\bfetch\s*\(/ },
  { name: 'new Worker(', re: /\bnew\s+Worker\s*\(/ },
  { name: 'new Audio(', re: /\bnew\s+Audio\s*\(/ },
  { name: 'new Image(', re: /\bnew\s+Image\s*\(/ },
  { name: 'XMLHttpRequest', re: /\bXMLHttpRequest\b/ },
];

function creditsUrls() {
  const f = path.join(PUBLIC_ASSETS, 'CREDITS.md');
  const text = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
  return new Set(text.match(/https?:\/\/[^\s)>`'"|]+/g) ?? []);
}

function hostOf(url) {
  try { return new URL(url).host.toLowerCase(); } catch { return ''; }
}

function creditsHosts() {
  return new Set([...creditsUrls()].map(hostOf).filter(Boolean));
}

function excerpt(text, index, len = 70) {
  return text.slice(Math.max(0, index - 25), index + len).replace(/\s+/g, ' ');
}

function* matches(text, re) {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let m;
  while ((m = g.exec(text))) yield m;
}

/** Findings for one HTML file. */
export function scanHtml(file, html) {
  const out = [];
  const add = (rule, index) => out.push({ file, rule, excerpt: excerpt(html, index) });
  for (const m of matches(html, /type\s*=\s*["']?module/i)) add('type="module"', m.index);
  for (const m of matches(html, /\bcrossorigin\b/i)) add('crossorigin attribute', m.index);
  for (const m of matches(html, /rel\s*=\s*["']?modulepreload/i)) add('modulepreload link', m.index);
  for (const m of matches(html, /\b(?:src|href)\s*=\s*["']?(\/|[a-z][a-z0-9+.-]*:)/gi)) {
    if (/^(?:src|href)\s*=\s*["']?data:/i.test(m[0])) continue;
    add('absolute or root-relative URL in src/href', m.index);
  }
  // inline <script> bodies follow the bundle's rules (no import(, fetch(, absolute URLs); inline <style> may not
  // @import or load from an absolute / root URL
  for (const m of matches(html, /<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/i)) {
    for (const f of scanJs(file, m[1])) out.push({ ...f, rule: `inline <script>: ${f.rule}` });
  }
  for (const m of matches(html, /<style\b[^>]*>([\s\S]*?)<\/style>/i)) {
    const css = m[1], at = m.index + m[0].indexOf(css);
    for (const c of matches(css, /@import\b/i)) add('inline <style>: @import', at + c.index);
    for (const c of matches(css, /url\(\s*["']?(?:[a-z][a-z0-9+.-]*:|\/)/i)) {
      if (/url\(\s*["']?data:/i.test(c[0])) continue;
      add('inline <style>: absolute or root-relative url(', at + c.index);
    }
  }
  const external = [...matches(html, /<script\b[^>]*\bsrc\s*=/i)];
  if (external.length !== 1) out.push({ file, rule: `expected exactly one external <script src>, found ${external.length}`, excerpt: '' });
  else if (!/\bdefer\b/.test(external[0][0])) add('main script is not deferred', external[0].index);
  return out;
}

/** Findings for JavaScript text (the main bundle, a pack head, the worker bundle). */
export function scanJs(file, js, { allowFetchCalls = 0 } = {}) {
  const out = [];
  const add = (rule, index) => out.push({ file, rule, excerpt: excerpt(js, index) });
  for (const m of matches(js, /\bimport\s*\(/)) add('dynamic import(', m.index);
  for (const m of matches(js, /\bimport\.meta\b/)) add('import.meta', m.index);
  for (const m of matches(js, /\bnew\s+Worker\s*\(/)) add('new Worker( with a URL', m.index);
  for (const m of matches(js, /\bnew\s+Audio\s*\(/)) add('new Audio(', m.index);
  for (const m of matches(js, /\bXMLHttpRequest\b|\bimportScripts\s*\(/)) add('XMLHttpRequest / importScripts', m.index);
  const allowedHosts = creditsHosts();
  for (const m of matches(js, /https?:\/\/[^\s"'`)<>\\]+/)) {
    const url = m[0];
    // plain-text attribution links only: the URL's host must be exactly a host the credits name (not a prefix match)
    if (URL_ALLOW.some((re) => re.test(url)) || allowedHosts.has(hostOf(url))) continue;
    add(`absolute URL ${url.slice(0, 60)}`, m.index);
  }
  const fetchCalls = [...matches(js, /\bfetch\s*\(/)];
  if (fetchCalls.length > allowFetchCalls) {
    for (const m of fetchCalls.slice(allowFetchCalls)) add(`fetch( (${fetchCalls.length} found, ${allowFetchCalls} allowed: the asset loader's)`, m.index);
  }
  return out;
}

/** The bundle must parse as a classic script (no import/export statements). */
export function scanClassicSyntax(file, js) {
  try {
    new vm.Script(js, { filename: file });
    return [];
  } catch (e) {
    return [{ file, rule: `does not parse as a classic script: ${e.message}`, excerpt: '' }];
  }
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|\s)\/\/.*$/gm, '$1');
}

/** Direct loads in source files outside the asset loader (tests excluded). Also returns the loader's own fetch count. */
export function scanSources(srcDir = SRC_DIR) {
  const findings = [];
  let loaderFetchCalls = 0;
  for (const rel of listFiles(srcDir)) {
    if (!/\.(ts|tsx)$/.test(rel) || /\.(test|verify\.test)\.tsx?$/.test(rel)) continue;
    const text = stripComments(fs.readFileSync(path.join(srcDir, rel), 'utf8'));
    const inLoader = rel.startsWith(LOADER_DIR);
    const shadowsFetch = /\bfunction\s+fetch\s*\(/.test(text); // a local helper that happens to be called fetch
    for (const r of DIRECT_LOAD_RULES) {
      if (r.name === 'fetch(' && shadowsFetch) continue;
      for (const m of matches(text, r.re)) {
        if (inLoader) { if (r.name === 'fetch(') loaderFetchCalls++; continue; }
        findings.push({ file: `src/${rel}`, rule: `${r.name} outside the asset loader`, excerpt: excerpt(text, m.index) });
      }
    }
  }
  return { findings, loaderFetchCalls };
}

/** Scan a finished output folder. Returns findings (empty = clean). */
export function scanDist(dir, { loaderFetchCalls = 1 } = {}) {
  const findings = [];
  for (const rel of listFiles(dir)) {
    const text = fs.readFileSync(path.join(dir, rel), 'utf8');
    if (rel.endsWith('.html')) findings.push(...scanHtml(rel, text));
    else if (rel.endsWith('.js')) {
      const isPack = rel.startsWith('packs/');
      findings.push(...scanJs(rel, text, { allowFetchCalls: isPack ? 0 : loaderFetchCalls }));
      if (!isPack) findings.push(...scanClassicSyntax(rel, text));
    }
  }
  return findings;
}

export function formatFindings(findings) {
  return findings.map((f) => `  ${f.file}: ${f.rule}${f.excerpt ? `  ...${f.excerpt}...` : ''}`).join('\n');
}
