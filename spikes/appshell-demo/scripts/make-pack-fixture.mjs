// Builds a test fixture for the embedded-pack back end from the classic build of the demo:
//   <out>/game/      copy of the classic build, textures REMOVED, the demo's assets moved into pack scripts
//                    (window.__FOUNDRESS_ASSETS__[path] = base64), the pack index inlined in index.html
//   <out>/index.html a host page embedding the game in <iframe sandbox="allow-scripts"> (opaque origin: fetch of
//                    our own files, module scripts and pointer lock are all refused there)
// Usage: node spikes/appshell-demo/scripts/make-pack-fixture.mjs <classic build dir> <out dir>
// (The real packer belongs to the packaging task; this only proves the loader's pack path end to end.)
import fs from 'node:fs';
import path from 'node:path';

const [src, out] = process.argv.slice(2);
if (!src || !out) { console.error('usage: make-pack-fixture.mjs <classic build> <out>'); process.exit(2); }
const game = path.join(out, 'game');
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(src, game, { recursive: true });
fs.rmSync(path.join(game, 'assets/textures'), { recursive: true, force: true });
fs.rmSync(path.join(game, 'assets/audio'), { recursive: true, force: true });
fs.rmSync(path.join(game, 'assets/manifest.json'), { force: true });

const manifest = JSON.parse(fs.readFileSync(path.join(src, 'assets/manifest.json'), 'utf8'));
const want = ['soil_garden', 'brick', 'concrete_paving', 'moss'];
const packs = [
  { src: 'packs/pack-0.js', paths: ['assets/manifest.json'] },
  { src: 'packs/pack-1.js', paths: want.slice(0, 2).flatMap((m) => Object.values(manifest.materials[m].maps)) },
  { src: 'packs/pack-2.js', paths: want.slice(2).flatMap((m) => Object.values(manifest.materials[m].maps)) },
];
fs.mkdirSync(path.join(game, 'packs'), { recursive: true });
for (const p of packs) {
  const lines = ['(function(r){'];
  for (const asset of p.paths) lines.push(`r[${JSON.stringify(asset)}]=${JSON.stringify(fs.readFileSync(path.join(src, asset)).toString('base64'))};`);
  lines.push('})(window.__FOUNDRESS_ASSETS__=window.__FOUNDRESS_ASSETS__||{});');
  fs.writeFileSync(path.join(game, p.src), lines.join('\n'));
}
const index = { version: 1, packs };
const html = fs.readFileSync(path.join(game, 'index.html'), 'utf8')
  .replace('<head>', `<head>\n  <script>window.__FOUNDRESS_ASSET_INDEX__=${JSON.stringify(index)};</script>`);
fs.writeFileSync(path.join(game, 'index.html'), html);
fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><title>sandboxed host</title>
<style>html,body{margin:0;height:100%;background:#000}iframe{border:0;width:100vw;height:100vh;display:block}</style></head>
<body><iframe id="game" sandbox="allow-scripts" src="game/index.html?test=1&quality=low&t=2"></iframe></body></html>\n`);
console.log(JSON.stringify({ out, packs: packs.map((p) => ({ src: p.src, files: p.paths.length })) }));
