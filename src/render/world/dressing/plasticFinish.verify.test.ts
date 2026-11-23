// Review of look pass 5 (adversarial): the plastic finish reads vWrFoot, so every shader that carries the look code must declare it, and
// the `flat` qualifiers must match between the stages (GLSL ES 3.00 link error otherwise).
import { MeshStandardMaterial, Uniform, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { materialDef } from '../materials/materialDefs';
import { applySurfacePatch } from '../materials/surfacePatch';
import type { WorldUniforms } from '../materials/uniforms';

function patched(id: string, curved: boolean, looks: boolean) {
  const mat = new MeshStandardMaterial();
  const u = new Proxy({}, { get: () => new Uniform(new Vector3()) }) as unknown as WorldUniforms;
  applySurfacePatch(mat, { def: materialDef(id), set: { albedo: null, normal: null, rough: null, procedural: true } as never, uniforms: u, space: 'instance', prim: 'rounded', curved, looks });
  const shader = {
    uniforms: {} as Record<string, unknown>,
    vertexShader: '#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>\n#include <project_vertex>',
    fragmentShader: '#include <common>\n#include <map_fragment>\n#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <metalnessmap_fragment>\n#include <normal_fragment_maps>\n#include <lights_fragment_begin>\n#include <fog_fragment>',
  };
  mat.onBeforeCompile(shader as never, null as never);
  return shader;
}

describe('plastic finish wiring (review)', () => {
  it('every looks shader (flat, curved; plastic, brick, metal) defines WR_FOOT and declares the flat foot varying in both stages', () => {
    for (const id of ['plastic', 'brick', 'metal', 'rubber']) for (const curved of [false, true]) {
      const s = patched(id, curved, true);
      expect(s.fragmentShader, `${id} ${curved}`).toContain('wrPlastic(');
      expect(s.vertexShader, `${id} ${curved}`).toContain('#define WR_FOOT');
      expect(s.vertexShader).toContain('attribute float iFoot; flat varying float vWrFoot;');
      expect(s.fragmentShader).toContain('flat varying float vWrFoot;');
    }
  });

  it('a shader without looks and without face detail neither needs nor declares the foot', () => {
    const s = patched('plastic', true, false);
    expect(s.vertexShader).not.toContain('#define WR_FOOT');
    expect(s.fragmentShader).not.toContain('wrPlastic(');
  });

  it('no varying is declared flat in one stage and smooth in the other', () => {
    for (const id of ['plastic', 'brick', 'wood-sound']) for (const looks of [false, true]) {
      const s = patched(id, false, looks);
      const decl = (src: string) => new Map([...src.matchAll(/(flat\s+)?varying\s+\w+\s+(\w+)/g)].map((m) => [m[2], !!m[1]]));
      const v = decl(s.vertexShader), f = decl(s.fragmentShader);
      for (const [name, flat] of f) if (v.has(name)) expect(v.get(name), `${id} ${looks} ${name}`).toBe(flat);
    }
  });
});
