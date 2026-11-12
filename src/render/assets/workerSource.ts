// The world-generation worker's source text, read through the asset loader. The portable build (tools/build) ships
// the classic worker bundle as the pack asset `workers/worldgen.js`; in dev and on normal static hosting the path does
// not exist, the read fails and the caller keeps generating on the main thread (blobWorkerFactory(null) is not called).
import type { AssetLoader } from './assetLoader';

export const WORLDGEN_WORKER_PATH = 'workers/worldgen.js';

/** Source text of the worker bundle, or null when this build does not ship one. Never rejects. */
export async function loadWorkerSource(loader: Pick<AssetLoader, 'bytes'>, path: string = WORLDGEN_WORKER_PATH): Promise<string | null> {
  try {
    return new TextDecoder().decode(await loader.bytes(path));
  } catch {
    return null;
  }
}
