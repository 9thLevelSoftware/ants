// Classic single-file build of the audio demo with its audio served from asset packs (task AC5), the same pack
// format the portable game build uses (tools/build/packs.mjs). No public/ directory is copied, so any audio that
// does not come from a pack would 404. Also writes sandbox.html: the demo inside <iframe sandbox="allow-scripts">
// (opaque origin, where fetch of our own files fails).
//   node spikes/audio-demo/scripts/classic.mjs [outDir]      default test-output/audio-classic
//   node tools/harness/play.mjs --static --root test-output/audio-classic --script spikes/audio-demo/scripts/classic-check.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { writePacks } from '../../../tools/build/packs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DEMO = path.join(ROOT, 'spikes/audio-demo');
const OUT = path.resolve(ROOT, process.argv[2] ?? 'test-output/audio-classic');

await build({
  root: DEMO, configFile: path.join(DEMO, 'vite.config.ts'), mode: 'classic', publicDir: false, logLevel: 'warn',
  build: { outDir: OUT, emptyOutDir: true, sourcemap: false },
});

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/assets/manifest.json'), 'utf8'));
const audio = manifest.assets.filter((a) => a.kind === 'audio');
const shipped = { ...manifest, materials: {}, assets: audio };
const plan = {
  packs: [
    { name: 'core', assets: [] },
    ...['ambience', 'sfx'].map((cat) => ({ name: `audio-${cat}`, assets: audio.filter((a) => a.category === cat).map((a) => ({ path: a.path })) })),
  ],
};
const index = writePacks(OUT, plan, [['assets/manifest.json', Buffer.from(JSON.stringify(shipped))]]);

const htmlPath = path.join(OUT, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');
if (/type="module"/.test(html)) throw new Error('classic build still has a module script');
html = html.replace(/<script defer /, `<script>window.__FOUNDRESS_ASSET_INDEX__=${JSON.stringify(index)};</script>\n  <script defer `);
fs.writeFileSync(htmlPath, html);
fs.writeFileSync(path.join(OUT, 'sandbox.html'), `<!doctype html><html><head><meta charset="utf-8"><title>audio demo in a sandboxed iframe</title></head>
<body style="margin:0;background:#111"><iframe id="f" sandbox="allow-scripts" src="index.html" style="width:100vw;height:100vh;border:0"></iframe>
<script>document.getElementById('f').addEventListener('load', () => { window.__ready = true; });</script></body></html>
`);
const files = fs.readdirSync(OUT).concat(fs.readdirSync(path.join(OUT, 'packs')).map((f) => `packs/${f}`));
console.log(JSON.stringify({ out: OUT, files, packs: index.packs.map((p) => ({ src: p.src, n: p.paths.length })) }));
