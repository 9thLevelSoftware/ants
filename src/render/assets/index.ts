// The one place assets are loaded from (architecture section 8).
export { AssetLoader, type AssetLoaderOptions, type ImageSourceLike, type PreloadResult } from './assetLoader';
export {
  EmbeddedBackend, FetchBackend, decodeBase64, defaultBackends, domScriptInjector, type AssetBackend, type AssetGlobals, type AssetPackIndex,
  type FetchFn, type ScriptInjector,
} from './backends';
export { MANIFEST_PATH, parseManifest, textureAssetId, type AssetEntry, type Manifest, type MaterialEntry, type TextureMap } from './manifest';
export { placeholderPixels, PLACEHOLDER_SIZE } from './placeholder';

import { AssetLoader, type AssetLoaderOptions } from './assetLoader';
import { defaultBackends, type AssetGlobals } from './backends';

/** Browser convenience: embedded packs when present, else relative fetch. */
export function createBrowserAssetLoader(opts: Omit<AssetLoaderOptions, 'backends'> = {}): AssetLoader {
  return new AssetLoader({ ...opts, backends: defaultBackends(window as Window & AssetGlobals) });
}
export { loadWorkerSource, WORLDGEN_WORKER_PATH } from './workerSource';
