// The world-generation worker's source text, read through the asset loader. The portable build (tools/build) ships
// the classic worker bundle as the pack asset `workers/worldgen.js`. In dev and on normal static hosting there is no
// such file, so only an embedded back end counts: no request is made (a 404 would show up as a failed request) and the
// caller keeps generating on the main thread.
import type { AssetLoader } from './assetLoader';

export const WORLDGEN_WORKER_PATH = 'workers/worldgen.js';

/** Source text of the worker bundle, or null when this build does not ship one. Never rejects. */
export async function loadWorkerSource(loader: Pick<AssetLoader, 'bytes' | 'backendFor'>, path: string = WORLDGEN_WORKER_PATH): Promise<string | null> {
  if (loader.backendFor(path) !== 'embedded') return null;
  try {
    return new TextDecoder().decode(await loader.bytes(path));
  } catch {
    return null;
  }
}
