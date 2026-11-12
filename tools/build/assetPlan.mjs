// Decides which manifest assets ship and in which pack each one lives.
//
// Textures: a texture set ships when its id appears as a quoted literal in code that may touch assets (render, ui,
// game, input, audio; see config.mjs). Sets nobody names are left out and reported. Audio: all of it (config.mjs).
// Grouping: configured texture groups first (pack 0 = "core"), then audio by category; a group that would exceed
// PACK_TARGET_BYTES is split. Sizes are the final pack-script bytes (base64 payload plus the wrapper line).
import fs from 'node:fs';
import path from 'node:path';
import {
  INCLUDE_ALL_AUDIO, MANIFEST_ASSET_PATH, PACK_TARGET_BYTES, PUBLIC_ASSETS, REFERENCE_SCAN_DIRS, REFERENCE_SCAN_FILES, SRC_DIR,
  TEXTURE_GROUPS, WORLDGEN_WORKER_ASSET_PATH,
} from './config.mjs';

const isTestFile = (name) => /\.(test|verify\.test)\.tsx?$/.test(name);

/** Source text of every non-test file in the directories that may reference assets. */
export function readReferenceSources(srcDir = SRC_DIR) {
  const texts = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx|css)$/.test(e.name) && !isTestFile(e.name)) texts.push(fs.readFileSync(p, 'utf8'));
    }
  };
  for (const d of REFERENCE_SCAN_DIRS) walk(path.join(srcDir, d));
  for (const f of REFERENCE_SCAN_FILES) {
    const p = path.join(srcDir, f);
    if (fs.existsSync(p)) texts.push(fs.readFileSync(p, 'utf8'));
  }
  return texts.join('\n');
}

/** Bytes of a pack-script line for one asset: `r["path"]="<base64>";\n`. */
function lineBytes(assetPath, fileBytes) {
  return JSON.stringify(assetPath).length + Math.ceil(fileBytes / 3) * 4 + 6;
}

/** Split items ({ path, bytes }) into chunks of at most `limit` bytes of pack text; an item is never split. */
function chunk(items, limit) {
  const chunks = [];
  let cur = [];
  let size = 0;
  for (const it of items) {
    if (cur.length && size + it.size > limit) { chunks.push(cur); cur = []; size = 0; }
    cur.push(it);
    size += it.size;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

/**
 * @returns {{ manifest: object, packs: {name:string, assets:{path:string,size:number}[]}[], leftOut: {id:string,bytes:number}[],
 *   included: {materials:string[], audio:number}}}
 * `manifest` is the filtered manifest.json that is shipped (same shape, only shipped materials and assets).
 */
export function planAssets({ manifestPath = path.join(PUBLIC_ASSETS, 'manifest.json'), sources = readReferenceSources() } = {}) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const referenced = (id) => new RegExp(`['"\`]${id}['"\`]`).test(sources);

  const shippedMaterials = Object.keys(manifest.materials).filter(referenced);
  const leftOut = [];
  const shipped = [];
  for (const a of manifest.assets) {
    const ship = a.kind === 'audio' ? INCLUDE_ALL_AUDIO : a.kind === 'texture' && shippedMaterials.includes(a.material);
    (ship ? shipped : leftOut).push(a);
  }

  const sizeOf = (a) => lineBytes(a.path, fs.statSync(path.join(PUBLIC_ASSETS, '..', a.path)).size);
  const textureGroupOf = (a) => TEXTURE_GROUPS.find((g) => g.materials.includes(a.material))?.name ?? 'extras';
  const groups = new Map(TEXTURE_GROUPS.map((g) => [g.name, []]));
  groups.set('extras', []);
  const audioGroups = new Map();
  for (const a of shipped) {
    const item = { path: a.path, size: sizeOf(a) };
    if (a.kind === 'audio') {
      const key = `audio-${a.category ?? 'misc'}`;
      if (!audioGroups.has(key)) audioGroups.set(key, []);
      audioGroups.get(key).push(item);
    } else groups.get(textureGroupOf(a)).push(item);
  }

  // The manifest and the worker source travel in pack 0; their sizes are added by the caller (packer) once known.
  const packs = [];
  for (const [name, items] of [...groups, ...audioGroups]) {
    if (!items.length) continue;
    const reserve = name === 'core' ? 1000 * 1000 : 0; // room for the manifest and the worker source
    const parts = chunk(items.sort((x, y) => x.path.localeCompare(y.path)), PACK_TARGET_BYTES - reserve);
    parts.forEach((assets, i) => packs.push({ name: i === 0 ? name : `${name}-${i + 1}`, assets }));
  }
  // Merge small audio groups so ambience, foley and the rest do not each cost a request.
  const merged = [];
  for (const p of packs) {
    const prev = merged[merged.length - 1];
    const size = (x) => x.assets.reduce((s, a) => s + a.size, 0);
    if (prev && p.name.startsWith('audio') && prev.name.startsWith('audio') && size(prev) + size(p) <= PACK_TARGET_BYTES) {
      prev.assets.push(...p.assets);
      prev.name = 'audio';
    } else merged.push(p);
  }
  if (!merged.length || merged[0].name !== 'core') merged.unshift({ name: 'core', assets: [] });

  const shippedIds = new Set(shipped.map((a) => a.id));
  const filtered = {
    ...manifest,
    notes: `${manifest.notes} Portable build: only assets referenced by the game are shipped.`,
    materials: Object.fromEntries(Object.entries(manifest.materials).filter(([id]) => shippedMaterials.includes(id))),
    assets: manifest.assets.filter((a) => shippedIds.has(a.id)),
  };
  filtered.total_bytes = filtered.assets.reduce((s, a) => s + a.bytes, 0);
  return {
    manifest: filtered,
    packs: merged,
    leftOut: leftOut.map((a) => ({ id: a.id, bytes: a.bytes })),
    included: { materials: shippedMaterials, audio: shipped.filter((a) => a.kind === 'audio').length },
    manifestAssetPath: MANIFEST_ASSET_PATH,
    workerAssetPath: WORLDGEN_WORKER_ASSET_PATH,
  };
}
