// Constants of the portable build: where things live, the limits from architecture section 8, and how assets are
// grouped into packs. Plain data, no logic, so the build and the verification agree on one set of numbers.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const OUT_DIR = path.join(ROOT, 'dist-portable');
export const PUBLIC_ASSETS = path.join(ROOT, 'public/assets');
export const SRC_DIR = path.join(ROOT, 'src');
export const WORKER_ENTRY = path.join(SRC_DIR, 'worldgen/worker/entry.ts');

/** Hard limits (architecture section 8). The build fails when one is exceeded. */
export const LIMITS = {
  totalBytes: 60 * 1000 * 1000,
  fileBytes: 18 * 1000 * 1000,
  fileCount: 250,
  /** A pack script must stay under this (task spec: 15 MB); the packer fills packs only to PACK_TARGET_BYTES. */
  packBytes: 15 * 1000 * 1000,
};
export const PACK_TARGET_BYTES = 12 * 1000 * 1000;

/** Asset paths the pack index and the loader use (relative to the page, as in manifest.json). */
export const MANIFEST_ASSET_PATH = 'assets/manifest.json';
/** Worker source travels as a pack asset (read with AssetLoader.bytes), see src/render/assets/workerSource.ts. */
export const WORLDGEN_WORKER_ASSET_PATH = 'workers/worldgen.js';

/**
 * Pack groups, in load order. Pack 0 ("core") holds what the title screen and a first game need: the manifest, the
 * world-generation worker and the ground / vegetation textures every habitat zone shares. Later groups load lazily
 * the first time the loader asks for one of their paths. A texture set not named here goes to the "extras" group;
 * audio is grouped by manifest category after the texture groups (it only starts after a user gesture).
 */
export const TEXTURE_GROUPS = [
  {
    name: 'core',
    materials: ['soil_garden', 'humus_forest', 'gravel_fine', 'moss', 'bark_oak', 'wood_decayed',
      'leaf_atlas_maple', 'leaf_atlas_oak_dry', 'grass_blades_atlas'],
  },
  {
    name: 'zones',
    materials: ['asphalt', 'sand_playground', 'brick', 'plaster_wall', 'tile_ceramic', 'wood_floor', 'wood_furniture', 'rubber_playground', 'metal_painted'],
  },
];

/**
 * Source folders searched for texture-set ids. Simulation and world generation talk in sim material ids, which
 * overlap with texture-set names ('brick', 'asphalt'), so only code that may touch assets is searched.
 */
export const REFERENCE_SCAN_DIRS = ['render', 'ui', 'game', 'input', 'audio'];
export const REFERENCE_SCAN_FILES = ['main.ts'];

/**
 * Audio: shipped by the same reference scan as textures (src/audio/assetIds.ts names every file it plays as a quoted
 * manifest id; gate 1B). Set to true to ship every manifest audio file regardless.
 */
export const INCLUDE_ALL_AUDIO = false;

/** Third-party code and fonts that end up in the bundle, for the licence section of CREDITS.md. */
export const SOFTWARE_LICENCES = [
  { name: 'three', file: 'three/LICENSE', licence: 'MIT' },
  { name: 'preact', file: 'preact/LICENSE', licence: 'MIT' },
  { name: '@preact/signals', file: '@preact/signals/LICENSE', licence: 'MIT' },
  { name: '@preact/signals-core', file: '@preact/signals-core/LICENSE', licence: 'MIT' },
  { name: 'fflate', file: 'fflate/LICENSE', licence: 'MIT' },
  { name: 'postprocessing', file: 'postprocessing/LICENSE.md', licence: 'Zlib' },
  { name: 'Inter (fontsource)', file: '@fontsource-variable/inter/LICENSE', licence: 'SIL OFL 1.1' },
  { name: 'Source Serif 4 (fontsource)', file: '@fontsource-variable/source-serif-4/LICENSE', licence: 'SIL OFL 1.1' },
  { name: 'Atkinson Hyperlegible (fontsource)', file: '@fontsource/atkinson-hyperlegible/LICENSE', licence: 'SIL OFL 1.1' },
  { name: 'JetBrains Mono (fontsource)', file: '@fontsource/jetbrains-mono/LICENSE', licence: 'SIL OFL 1.1' },
];
