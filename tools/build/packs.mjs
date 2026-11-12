// Writes the asset pack scripts and builds the pack index. A pack is a classic script:
//   (function(r){ r["assets/textures/x/albedo.jpg"]="<base64>"; ... })(window.__FOUNDRESS_ASSETS__=window.__FOUNDRESS_ASSETS__||{});
// which is the format src/render/assets/backends.ts reads. The index (inlined in index.html) maps each path to the
// pack that holds it; packs after the first are injected lazily by the loader.
import fs from 'node:fs';
import path from 'node:path';
import { PUBLIC_ASSETS } from './config.mjs';
import { mkdirp, sha8 } from './util.mjs';

function packSource(entries) {
  const lines = ['(function(r){'];
  for (const [assetPath, bytes] of entries) lines.push(`r[${JSON.stringify(assetPath)}]=${JSON.stringify(Buffer.from(bytes).toString('base64'))};`);
  lines.push('})(window.__FOUNDRESS_ASSETS__=window.__FOUNDRESS_ASSETS__||{});', '');
  return lines.join('\n');
}

/**
 * @param plan result of planAssets()
 * @param extraCore extra [path, Buffer] entries for pack 0 (manifest, worker source)
 * @returns pack index plus the files written (relative to outDir)
 */
export function writePacks(outDir, plan, extraCore) {
  mkdirp(path.join(outDir, 'packs'));
  const index = { version: 1, packs: [] };
  for (const pack of plan.packs) {
    const entries = pack.name === 'core' ? [...extraCore] : [];
    for (const a of pack.assets) entries.push([a.path, fs.readFileSync(path.join(PUBLIC_ASSETS, '..', a.path))]);
    const text = packSource(entries);
    const src = `packs/${pack.name}.${sha8(text)}.js`;
    fs.writeFileSync(path.join(outDir, src), text);
    index.packs.push({ src, paths: entries.map(([p]) => p) });
  }
  return index;
}
