// Face detail on big flat faces by material kind (look pass 4): the defines each material gets, the shared fog exemption, no per-object case.
import { MeshStandardMaterial, Uniform, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { FACE, FACE_DETAIL_FRAG, faceKindOf } from './faceDetail';
import { materialDef } from './materialDefs';
import { applySurfacePatch } from './surfacePatch';
import type { WorldUniforms } from './uniforms';

function patched(id: string, prim: 'rounded' | null, space: 'instance' | 'world') {
  const mat = new MeshStandardMaterial();
  const u = new Proxy({}, { get: () => new Uniform(new Vector3()) }) as unknown as WorldUniforms;
  applySurfacePatch(mat, { def: materialDef(id), set: { albedo: null, normal: null, rough: null, procedural: true } as never, uniforms: u, space, prim, looks: false });
  const shader = {
    uniforms: {} as Record<string, unknown>,
    vertexShader: '#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>\n#include <project_vertex>',
    fragmentShader: '#include <common>\n#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>\n#include <lights_fragment_begin>\n#include <fog_fragment>',
  };
  mat.onBeforeCompile(shader as never, null as never);
  return shader;
}

describe('face detail by material kind', () => {
  it('brick, render, concrete, stone and mortar get masonry detail, metal gets seams, wood keeps its boards', () => {
    expect(faceKindOf(materialDef('brick'))).toBe('brick');
    for (const id of ['plaster', 'concrete', 'stone', 'mortar']) expect(faceKindOf(materialDef(id)), id).toBe('panel');
    expect(faceKindOf(materialDef('metal'))).toBe('metal');
    for (const id of ['wood-sound', 'loam', 'plastic', 'glass', 'asphalt', 'rubber']) expect(faceKindOf(materialDef(id)), id).toBeNull();
  });
  it('the patch is on instanced primitives only and carries the prim size to the fragment stage', () => {
    for (const id of ['brick', 'concrete', 'metal']) {
      const s = patched(id, 'rounded', 'instance');
      expect(s.vertexShader, id).toContain('#define WR_FACE');
      expect(s.vertexShader, id).toContain('vWrSz = iSize.xyz;');
      expect(s.fragmentShader, id).toContain(FACE_DETAIL_FRAG.trim());
      expect(s.fragmentShader, id).toContain('gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, wrFogF * ( 1.0 - wrFogKeep ) );');
    }
    expect(patched('brick', 'rounded', 'instance').vertexShader).toContain('#define WR_FACE_BRICK');
    expect(patched('metal', 'rounded', 'instance').vertexShader).toContain('#define WR_FACE_METAL');
    expect(patched('concrete', 'rounded', 'instance').vertexShader).not.toContain('WR_FACE_BRICK');
    for (const [id, prim, space] of [['concrete', null, 'world'], ['loam', 'rounded', 'instance'], ['wood-sound', 'rounded', 'instance']] as const) {
      expect(patched(id, prim, space).vertexShader, id).not.toContain('#define WR_FACE');
    }
  });
  it('the numbers are sane: lines fade before they alias, some colour survives the fog, a kerb is not a wall', () => {
    expect(FACE.fadeFrom).toBeLessThan(FACE.fadeTo);
    expect(FACE.fogKeep).toBeGreaterThan(0);
    expect(FACE.fogKeep).toBeLessThan(1);
    expect(FACE.minFaceMm).toBeGreaterThan(150);
    expect(FACE.plinthMm).toBeLessThan(FACE.plinthMinHeightMm);
  });
});
