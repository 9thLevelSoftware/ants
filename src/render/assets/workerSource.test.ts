import { describe, expect, it } from 'vitest';
import { AssetLoader } from './assetLoader';
import { EmbeddedBackend, FetchBackend } from './backends';
import { loadWorkerSource, WORLDGEN_WORKER_PATH } from './workerSource';

const b64 = (s: string) => btoa(s);

describe('loadWorkerSource', () => {
  it('reads the worker text from an embedded pack', async () => {
    const g = { __FOUNDRESS_ASSETS__: { [WORLDGEN_WORKER_PATH]: b64('self.onmessage=()=>{}') } };
    const loader = new AssetLoader({ backends: [new EmbeddedBackend(g, async () => {})] });
    expect(await loadWorkerSource(loader)).toBe('self.onmessage=()=>{}');
  });

  it('returns null without any request when no pack holds it (dev, plain hosting)', async () => {
    let requests = 0;
    const fetchBackend = new FetchBackend('http://x/', async () => { requests++; return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }; });
    const loader = new AssetLoader({ backends: [new EmbeddedBackend({ __FOUNDRESS_ASSETS__: {} }, async () => {}), fetchBackend] });
    expect(await loadWorkerSource(loader)).toBeNull();
    expect(requests).toBe(0);
  });

  it('returns null when the pack fails to load', async () => {
    const g = { __FOUNDRESS_ASSET_INDEX__: { version: 1 as const, packs: [{ src: 'packs/core.js', paths: [WORLDGEN_WORKER_PATH] }] } };
    const loader = new AssetLoader({ backends: [new EmbeddedBackend(g, async () => { throw new Error('blocked'); })] });
    expect(await loadWorkerSource(loader)).toBeNull();
  });
});
