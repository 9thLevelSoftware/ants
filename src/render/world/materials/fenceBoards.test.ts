// Fence boards and the fog exemption on wooden panel prims (app-seams-2-fix, far blocks): a 20 mm panel prim at 3 to 6 m drew as one flat
// pale slab (the fog is ~100 % there on an ant's scale). The patch is only added to wooden instanced primitives.
import { MeshStandardMaterial, Uniform, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { materialDef } from './materialDefs';
import { applySurfacePatch, FENCE_BOARDS, FENCE_BOARDS_FRAG } from './surfacePatch';
import type { WorldUniforms } from './uniforms';

/** The patched shaders of a material for a def id (three's chunks reduced to the markers the patch replaces). */
function patched(id: string, prim: 'rounded' | null, space: 'instance' | 'world') {
  const mat = new MeshStandardMaterial();
  const u = new Proxy({}, { get: () => new Uniform(new Vector3()) }) as unknown as WorldUniforms;
  const set = { albedo: null, normal: null, rough: null, procedural: true } as never;
  applySurfacePatch(mat, { def: materialDef(id), set, uniforms: u, space, prim, looks: false });
  const shader = {
    uniforms: {} as Record<string, unknown>,
    vertexShader: '#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>\n#include <project_vertex>',
    fragmentShader: '#include <common>\n#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>\n#include <lights_fragment_begin>\n#include <fog_fragment>',
  };
  mat.onBeforeCompile(shader as never, null as never);
  return shader;
}

describe('fence boards on wooden panel prims', () => {
  it('a wooden instanced box gets the board pattern and keeps part of its colour through the fog', () => {
    const s = patched('wood-sound', 'rounded', 'instance');
    expect(s.vertexShader).toContain('#define WR_BOARDS');
    expect(s.vertexShader).toContain('vWrSz = iSize.xyz;');
    expect(s.fragmentShader).toContain(FENCE_BOARDS_FRAG.trim());
    expect(s.fragmentShader).toContain('gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, wrFogF * ( 1.0 - wrFogKeep ) );');
    expect(FENCE_BOARDS.fogKeep).toBeGreaterThan(0);
    expect(FENCE_BOARDS.fogKeep).toBeLessThan(1);
  });
  it('stone, ground and world-space wood do not', () => {
    for (const [id, prim, space] of [['concrete', 'rounded', 'instance'], ['wood-sound', null, 'world'], ['loam', null, 'world']] as const) {
      const s = patched(id, prim, space);
      expect(s.vertexShader, id).not.toContain('#define WR_BOARDS');
    }
  });
  it('the pattern needs a thin panel: boards across the two big axes only, from the prim size', () => {
    expect(FENCE_BOARDS_FRAG).toContain(`step(bsz.z, ${FENCE_BOARDS.thinMaxMm.toFixed(1)})`);
    expect(FENCE_BOARDS.thinMaxMm).toBeLessThan(FENCE_BOARDS.bigMinMm);
    expect(FENCE_BOARDS.boardMm).toBeGreaterThan(50);
  });
});
