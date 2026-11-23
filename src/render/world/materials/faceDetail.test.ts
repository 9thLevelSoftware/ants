// Face detail on big flat faces by material kind (look pass 4): the defines each material gets, the shared fog exemption, no per-object case.
import { MeshStandardMaterial, Uniform, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { FACE, FACE_DETAIL_FRAG, faceKindOf } from './faceDetail';
import { materialDef } from './materialDefs';
import { applySurfacePatch } from './surfacePatch';
import type { WorldUniforms } from './uniforms';

function patched(id: string, prim: 'rounded' | null, space: 'instance' | 'world', curved = false) {
  const mat = new MeshStandardMaterial();
  const u = new Proxy({}, { get: () => new Uniform(new Vector3()) }) as unknown as WorldUniforms;
  applySurfacePatch(mat, { def: materialDef(id), set: { albedo: null, normal: null, rough: null, procedural: true } as never, uniforms: u, space, prim, curved, looks: false });
  const shader = {
    uniforms: {} as Record<string, unknown>,
    vertexShader: '#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>\n#include <project_vertex>',
    fragmentShader: '#include <common>\n#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>\n#include <lights_fragment_begin>\n#include <fog_fragment>',
  };
  mat.onBeforeCompile(shader as never, null as never);
  return shader;
}

describe('face detail by material kind', () => {
  it('brick, render, concrete, stone and mortar get masonry detail, metal gets seams, sawn wood gets boards, natural wood nothing', () => {
    expect(faceKindOf(materialDef('brick'))).toBe('brick');
    for (const id of ['plaster', 'concrete', 'stone', 'mortar']) expect(faceKindOf(materialDef(id)), id).toBe('panel');
    expect(faceKindOf(materialDef('metal'))).toBe('metal');
    expect(faceKindOf(materialDef('wood-sound'))).toBe('wood');
    for (const id of ['wood-decayed', 'bark', 'loam', 'plastic', 'glass', 'asphalt', 'rubber']) expect(faceKindOf(materialDef(id)), id).toBeNull();
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
    expect(patched('wood-sound', 'rounded', 'instance').vertexShader).toContain('#define WR_FACE_WOOD');
    for (const [id, prim, space] of [['concrete', null, 'world'], ['loam', 'rounded', 'instance'], ['wood-decayed', 'rounded', 'instance']] as const) {
      expect(patched(id, prim, space).vertexShader, id).not.toContain('#define WR_FACE');
    }
  });
  it('the object foot reaches the fragment stage, and the patterns are laid out from it and from the world, not from the prim', () => {
    const s = patched('brick', 'rounded', 'instance');
    expect(s.vertexShader).toContain('attribute float iFoot;');
    expect(s.vertexShader).toContain('vWrFoot = iFoot;');
    expect(FACE_DETAIL_FRAG).toContain('vWrW.y - vWrFoot');
    expect(FACE_DETAIL_FRAG).toContain('dot(vWrW.xz, tg)');
    // the procedural bricks fade in as the scan's own bricks fade out: never both
    expect(FACE_DETAIL_FRAG).toContain('own = smoothstep(');
    expect(FACE.scanFadeFrom).toBeGreaterThanOrEqual(1.5);
    expect(FACE.scanFadeTo).toBeLessThanOrEqual(7);
  });
  it('cylinders and capsules (round logs, stumps, posts) get no flat-face pattern whatever the material', () => {
    for (const id of ['wood-sound', 'wood-decayed', 'brick', 'concrete', 'metal']) {
      const s = patched(id, 'rounded', 'instance', true);
      expect(s.vertexShader, id).not.toContain('#define WR_FACE');
      expect(s.vertexShader, id).not.toContain('#define WR_BOARDS');
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

describe('wall foot (look pass 5)', () => {
  it('the per-instance size and foot are flat varyings: a 250 mm face must not interpolate to 249.99998 and fail the 250 mm test in streaks', () => {
    const s = patched('concrete', 'rounded', 'instance');
    expect(s.vertexShader).toContain('flat varying vec3 vWrSz;');
    expect(s.vertexShader).toContain('flat varying float vWrFoot;');
    expect(s.fragmentShader).toContain('flat varying vec3 vWrSz;');
    expect(s.fragmentShader).toContain('flat varying float vWrFoot;');
    expect(s.fragmentShader).not.toMatch(/(^|[^t] )varying vec3 vWrSz/m);
  });
  it('a thin band of a tall wall (the 65 mm vent course) keeps its colour through the haze, judged by its top above the object foot', () => {
    expect(FACE_DETAIL_FRAG).toContain('vWrW.y - vWrP.y + vWrSz.y - vWrFoot >= ' + FACE.minFaceMm.toFixed(3));
    const bandBranch = FACE_DETAIL_FRAG.slice(FACE_DETAIL_FRAG.indexOf('} else if ('));
    expect(bandBranch).toContain('wrFogKeep = ' + FACE.fogKeep.toFixed(3));
    // the foundation course is 250 mm: it is a face, not a band (it equals the minimum)
    expect(FACE.minFaceMm).toBe(250);
  });
});
