// Look pass 3 review: the leaf's contact shadow is a blended soft term, not a dithered discard (black pepper between the lobes),
// and it is cheap and stable (no texture read inside a branch: the software rasteriser flickered).
import { CustomBlending, DataTexture, SrcAlphaFactor, OneMinusSrcAlphaFactor, type WebGLProgramParametersWithUniforms } from 'three';
import { describe, expect, it } from 'vitest';
import { createWorldUniforms } from '../materials/uniforms';
import { createDrapedMaterial } from './drapedMaterial';
import { createDecorShared } from './shared';
import { DECOR_LEAF } from './tuning';

const tex = () => new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);

function compiled() {
  const shared = createDecorShared(createWorldUniforms());
  const mat = createDrapedMaterial(shared, { freshAlbedo: tex(), freshAlpha: tex(), dryAlbedo: tex(), dryAlpha: tex(), moss: tex() });
  const shader = {
    uniforms: {},
    vertexShader: '#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>\n#include <project_vertex>',
    fragmentShader: '#include <common>\n#include <clipping_planes_fragment>\n#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>\n#include <lights_fragment_begin>',
  } as unknown as WebGLProgramParametersWithUniforms;
  mat.onBeforeCompile(shader, undefined as never);
  return { mat, frag: shader.fragmentShader };
}

describe('draped leaf contact shadow', () => {
  const { mat, frag } = compiled();
  it('is blended over the ground (plain alpha blending, kept in the opaque pass), not dithered away', () => {
    expect(mat.blending).toBe(CustomBlending);
    expect(mat.blendSrc).toBe(SrcAlphaFactor);
    expect(mat.blendDst).toBe(OneMinusSrcAlphaFactor);
    expect(mat.transparent, 'no sorting and no second side pass').toBe(false);
    expect(frag).toContain('diffuseColor.a = dcShade');
    expect(frag).not.toMatch(/dcShade\s*<=\s*wrHash12/);
  });
  it('is soft: a low peak opacity, a short reach and a smooth eight-tap falloff, all from DECOR_LEAF', () => {
    expect(DECOR_LEAF.shadowAlpha).toBeLessThanOrEqual(0.6);
    expect(DECOR_LEAF.shadowReachUv).toBeLessThanOrEqual(0.1);
    expect((frag.match(/dcLeafAlpha\(ra, fresh, uv/g) ?? []).length).toBe(8);
  });
  it('reads every texel unconditionally (a read inside a per-pixel branch has undefined derivatives)', () => {
    const at = frag.indexOf('float dcRing');
    const before = frag.slice(Math.max(0, at - 400), at);
    expect(before).not.toMatch(/if\s*\(\s*a\s*<\s*0\.5/);
  });
  it('is drawn after the ground it is blended over (a blend is order dependent: before the terrain it showed the clear colour as a white halo)', () => {
    expect(DECOR_LEAF.renderOrder).toBeGreaterThan(0);
  });
  it('dry leaves go dark at night, fresh ones less (the cream leaf was the brightest thing in a night frame)', () => {
    expect(DECOR_LEAF.nightAlbedo.dry).toBeLessThan(DECOR_LEAF.nightAlbedo.fresh);
    expect(DECOR_LEAF.nightAlbedo.dry).toBeLessThanOrEqual(0.5);
  });
});
