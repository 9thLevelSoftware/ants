// Material library data: every MaterialId has a look, every scan it names exists in the asset manifest, and the
// procedural sets tile seamlessly and deterministically.
import { describe, expect, it } from 'vitest';
import manifestRaw from '../../../../public/assets/manifest.json?raw';
import { MATERIAL_IDS } from '@/sim/types';
import { MATERIAL_DEFS, materialDef, primMaterialDef } from './materialDefs';
import { proceduralPixels } from './procedural';

const manifest = JSON.parse(manifestRaw) as {
  materials: Record<string, { maps: Record<string, string> }>;
};

describe('material definitions', () => {
  it('cover every MaterialId with sane values', () => {
    for (const id of MATERIAL_IDS) {
      const d = MATERIAL_DEFS[id];
      expect(d.id).toBe(id);
      expect(d.scaleMm).toBeGreaterThan(5);
      expect(d.wetDarken).toBeGreaterThan(0.3);
      expect(d.wetDarken).toBeLessThanOrEqual(1);
      expect(d.texture !== null || d.procedural !== undefined).toBe(true);
    }
    expect(materialDef('not-a-material').id).toBe('loam');
  });
  it('only names texture sets the manifest has (albedo, normal, rough)', () => {
    for (const id of MATERIAL_IDS) {
      for (const d of [materialDef(id), primMaterialDef(id)]) {
        if (!d.texture) continue;
        const m = manifest.materials[d.texture];
        expect(m, `${id} -> ${d.texture}`).toBeDefined();
        for (const map of ['albedo', 'normal', 'rough']) expect(m.maps[map]).toBeTruthy();
      }
    }
  });
  it('soil stays rough when wet (no Fresnel mirror at grazing angles)', () => {
    for (const id of ['loam', 'humus', 'sand', 'clay'] as const) expect(MATERIAL_DEFS[id].wetRough).toBeGreaterThanOrEqual(0.5);
  });
});

describe('procedural textures', () => {
  const look = MATERIAL_DEFS.fabric.procedural!;
  it('are deterministic', () => {
    expect(proceduralPixels(look, 32, 3).albedo).toEqual(proceduralPixels(look, 32, 3).albedo);
  });
  it('wrap seamlessly (opposite edges differ no more than neighbouring texels)', () => {
    const N = 64, px = proceduralPixels(MATERIAL_DEFS.plant.procedural!, N, 5);
    let edge = 0, inner = 0;
    for (let y = 0; y < N; y++) {
      edge = Math.max(edge, Math.abs(px.albedo[(y * N + N - 1) * 4] - px.albedo[(y * N) * 4]));
      inner = Math.max(inner, Math.abs(px.albedo[(y * N + 31) * 4] - px.albedo[(y * N + 32) * 4]));
    }
    expect(edge).toBeLessThanOrEqual(Math.max(inner, 6) + 2);
  });
});
