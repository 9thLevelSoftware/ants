// Review finding (int-1B-app): the preset's anisotropy never reached the asset loader's textures, so every scanned
// texture set sampled with anisotropy 1 at every preset. The wiring helper Game uses at boot and on every switch.
import { describe, expect, it } from 'vitest';
import { AssetLoader } from '@/render/assets/assetLoader';
import { EmbeddedBackend } from '@/render/assets/backends';
import { getPreset, type QualityPreset } from '@/render/app/quality';
import { applyQualityToServices } from './qualityWiring';

const MANIFEST = {
  root: 'public/',
  materials: { bark: { title: 'Bark', atlas: false, maps: { albedo: 'assets/t/bark/albedo.jpg' }, size: [4, 4] } },
  assets: [{ id: 'tex/bark/albedo', path: 'assets/t/bark/albedo.jpg', kind: 'texture', map: 'albedo', material: 'bark', bytes: 3 }],
};

function loader(): AssetLoader {
  const pack = { 'assets/manifest.json': btoa(JSON.stringify(MANIFEST)), 'assets/t/bark/albedo.jpg': btoa('JPG') };
  return new AssetLoader({
    backends: [new EmbeddedBackend({ __FOUNDRESS_ASSETS__: pack }, async () => {})],
    decodeImage: async () => ({ width: 4, height: 4 }),
    makeImage: async (_r, w, h) => ({ width: w, height: h }),
    warn: () => {},
  });
}

describe('applyQualityToServices', () => {
  it('gives loader textures the preset anisotropy, before and after they load, on every switch', async () => {
    const assets = loader();
    const seen: QualityPreset[] = [];
    const registry = { setQuality: (q: QualityPreset) => { seen.push(q); } };
    applyQualityToServices(getPreset('high'), { registry, assets });
    const tex = await assets.textureAsync('bark', 'albedo');
    expect(tex.anisotropy).toBe(getPreset('high').anisotropy);
    expect(getPreset('high').anisotropy).toBeGreaterThan(1);
    applyQualityToServices(getPreset('low'), { registry, assets });
    expect(tex.anisotropy).toBe(getPreset('low').anisotropy);
    expect(seen.map((q) => q.id)).toEqual(['high', 'low']);
  });

  it('works before the registry exists (title boot)', () => {
    const assets = loader();
    expect(() => applyQualityToServices(getPreset('medium'), { registry: null, assets })).not.toThrow();
  });
});
