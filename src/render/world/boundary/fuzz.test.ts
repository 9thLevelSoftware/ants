// Look pass 5 item 2: the hashed-alpha silhouette fuzz sprinkled white dots over every large flat backdrop face seen at a grazing
// angle (raised and ant-height views of the parked cars, the fence and the house). It now acts only on vertices flagged as curved.
import { Color } from 'three';
import { describe, expect, it } from 'vitest';
import { MeshBuilder } from './meshBuilder';
import { MeshStandardMaterial } from 'three';
import { createEdgeHazeUniforms, patchEdgeHaze } from './edgeHaze';
import { Uniform } from 'three';

const c = new Color('#808080');

describe('backdrop silhouette fuzz flags', () => {
  it('a box (wall, car body, fence board) carries no fuzz on any vertex', () => {
    const mb = new MeshBuilder();
    mb.box(0, 0, 0, 4000, 1500, 100, 0.3, c);
    expect(mb.fuzz.length).toBe(mb.vertexCount);
    expect(mb.fuzz.every((f) => f === 0)).toBe(true);
  });

  it('foliage and trunk sides are fuzzed, the flat top cap of a trunk is not', () => {
    const mb = new MeshBuilder();
    mb.ellipsoid(0, 0, 0, 500, 400, 500, 8, 5, c);
    expect(mb.fuzz.every((f) => f === 1)).toBe(true);
    const cyl = new MeshBuilder();
    cyl.cylinder(0, 0, 0, 100, 2000, 8, c);
    expect(cyl.fuzz.length).toBe(cyl.vertexCount);
    expect(cyl.fuzz.filter((f) => f === 1).length).toBe(2 * (8 + 1)); // the side ring
    expect(cyl.fuzz.filter((f) => f === 0).length).toBe(cyl.vertexCount - 2 * (8 + 1)); // the cap
  });

  it('the shader multiplies the fuzz by the vertex flag', () => {
    const m = new MeshStandardMaterial();
    patchEdgeHaze(m, createEdgeHazeUniforms(), { rim: new Uniform(0), minHaze: new Uniform(0), fuzz: new Uniform(1), blend: new Uniform(0) });
    const shader = { uniforms: {} as Record<string, unknown>, vertexShader: '#include <common>\n#include <project_vertex>', fragmentShader: '#include <common>\n#include <alphahash_fragment>\n#include <fog_fragment>' };
    (m.onBeforeCompile as unknown as (s: typeof shader) => void)(shader);
    expect(shader.fragmentShader).toContain('uBdFuzz * vBdFuzz');
    expect(shader.vertexShader).toContain('vBdFuzz = aBdFuzz');
  });
});
