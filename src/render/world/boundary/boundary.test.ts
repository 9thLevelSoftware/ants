// Map boundary (GDD 04 §14, render-integration): the skirt continues the ground without a seam and never under the
// terrain's clamped continuation, nothing of it lies inside the map, the backdrop follows the edge treatment and
// stays outside, everything is deterministic, and the edge glyph hook fires only when pressing outward at the limit.
import { describe, expect, it } from 'vitest';
import { Color, Mesh, Scene, ShaderLib, Vector3 } from 'three';
import { terrainHeightAt } from '@/sim/entities/placement';
import { makeTestWorld } from '@/sim/testing';
import { buildTestWorld } from '../decor/testWorld';
import { buildWorld } from '@/sim/testing/worldBuilder';
import { defaultWorldParams } from '@/worldgen';
import type { WorldData } from '@/sim/types';
import {
  BoundaryRenderer, buildBackdrop, buildSkirt, edgeGlyphActive, edgeRuns, makeSkirtHeight, outsideDistance, reflectInto, rowLevels,
  skirtRows, terrainMaxInRect, terrainPlaneAt,
} from './index';
import { applyEdgeHazeLight, EDGE_FOG_FRAGMENT } from './edgeHaze';
import { SKIRT_WIDTH_L } from './tuning';

const decorWorld = buildTestWorld(); // lawn, forest, paving and car park quadrants
const noiseWorld = makeTestWorld({ sizeBu: 160, terrain: 'noise', seed: 3 });

describe('skirt', () => {
  it('reflects coordinates and measures distance outside the map', () => {
    expect(reflectInto(-10, 100)).toBe(10);
    expect(reflectInto(110, 100)).toBe(90);
    expect(reflectInto(250, 100)).toBe(50);
    expect(outsideDistance(50, 50, 100)).toBe(0);
    expect(outsideDistance(-3, 104, 100)).toBeCloseTo(5);
  });

  it('meets the terrain at the edge and never dips under its clamped continuation', () => {
    const w = noiseWorld, S = w.size, h = makeSkirtHeight(w);
    for (let u = 0; u <= S; u += S / 37) {
      expect(h(u, 0)).toBeCloseTo(terrainHeightAt(w.terrain, u, 0), 6);
      expect(h(S, u)).toBeCloseTo(terrainHeightAt(w.terrain, S, u), 6);
      for (const d of [1, 10, 100, 0.3 * S]) {
        expect(h(u, -d)).toBeGreaterThanOrEqual(terrainHeightAt(w.terrain, u, 0));
        expect(h(-d, u)).toBeGreaterThanOrEqual(terrainHeightAt(w.terrain, 0, u));
      }
      // continuous across the edge: a step of 1 mm outward changes the height by well under a millimetre
      expect(Math.abs(h(u, -1) - h(u, 0))).toBeLessThan(0.5);
    }
  });

  it('covers the band 0.5 L beyond every edge and nothing inside the map; deterministic', () => {
    const w = decorWorld, S = w.size, sk = buildSkirt(w);
    expect(sk.width).toBeCloseTo(SKIRT_WIDTH_L * S);
    const P = sk.positions;
    let minX = Infinity, maxX = -Infinity;
    for (let t = 0; t < sk.index.length; t += 3) {
      // the centroid of every triangle lies outside the map square
      let cx = 0, cz = 0;
      for (let k = 0; k < 3; k++) { const v = sk.index[t + k]!; cx += P[v * 3]! / 3; cz += P[v * 3 + 2]! / 3; }
      expect(outsideDistance(cx, cz, S)).toBeGreaterThan(0);
    }
    for (let i = 0; i < P.length; i += 3) { minX = Math.min(minX, P[i]!); maxX = Math.max(maxX, P[i]!); }
    expect(minX).toBeCloseTo(-SKIRT_WIDTH_L * S);
    expect(maxX).toBeCloseTo(S + SKIRT_WIDTH_L * S);
    for (const v of sk.normals) expect(Number.isFinite(v)).toBe(true);
    for (let i = 1; i < sk.normals.length; i += 3) expect(sk.normals[i]!).toBeGreaterThan(0); // facing up
    expect(sk.index.length / 3).toBeLessThan(20000);
    const again = buildSkirt(w);
    expect(Array.from(again.positions)).toEqual(Array.from(sk.positions));
  });

  it('takes its colour from the zone it mirrors (lawn green beside the lawn, grey beside the paving)', () => {
    const w = decorWorld, S = w.size, sk = buildSkirt(w), P = sk.positions, C = sk.colors;
    const near = (x: number, z: number) => {
      let best = 0, bd = Infinity;
      for (let i = 0; i < P.length / 3; i++) { const d = Math.hypot(P[i * 3]! - x, P[i * 3 + 2]! - z); if (d < bd) { bd = d; best = i; } }
      return [C[best * 3]!, C[best * 3 + 1]!, C[best * 3 + 2]!];
    };
    const lawn = near(S * 0.25, -20), paving = near(-20, S * 0.75);
    expect(lawn[1]).toBeGreaterThan(lawn[0]!); // green dominant
    const sat = (c: number[]) => (Math.max(...c) - Math.min(...c)) / Math.max(...c);
    expect(sat(paving)).toBeLessThan(sat(lawn) / 2); // grey beside the paving
  });
});

/** A bumpy world: 20 mm banks and dips every few cells right along all four edges (kerbs, roots, bed edges). */
function bumpyWorld(): WorldData {
  const bu = 4, size = 500 * bu;
  const height = (x: number, z: number) => 20 * Math.sin(x / 37) * Math.cos(z / 23) + 8 * Math.sin((x + 2 * z) / 11);
  return buildWorld({ params: { ...defaultWorldParams('lasius-niger', 5), sizeClass: 'compact' }, size, bu, height });
}

describe('skirt mesh against the terrain clamped beyond the edge', () => {
  const worlds: [string, () => WorldData][] = [['bumpy edges', bumpyWorld], ['noise world', () => noiseWorld], ['decor world', () => decorWorld]];
  for (const [name, make] of worlds) {
    it(`${name}: the edge row is the terrain's edge and no point of any triangle lies under the terrain's continuation`, () => {
      const w = make(), sk = buildSkirt(w), P = sk.positions, I = sk.index, S = w.size;
      // every vertex on the map border sits exactly on the terrain
      let onEdge = 0;
      for (let v = 0; v < P.length / 3; v++) {
        if (outsideDistance(P[v * 3]!, P[v * 3 + 2]!, S) > 0) continue;
        onEdge++;
        expect(Math.abs(P[v * 3 + 1]! - terrainPlaneAt(w.terrain, P[v * 3]!, P[v * 3 + 2]!))).toBeLessThan(1e-3);
      }
      expect(onEdge).toBeGreaterThanOrEqual(4 * (S / w.terrain.cell)); // a vertex on every grid line of every side
      // sample each triangle on a barycentric lattice: the face is never under the clamped terrain (float tolerance)
      let worst = -Infinity;
      const B = 6;
      for (let t = 0; t < I.length; t += 3) {
        const a = I[t]! * 3, b = I[t + 1]! * 3, c = I[t + 2]! * 3;
        for (let i = 0; i <= B; i++) for (let j = 0; i + j <= B; j++) {
          const u = i / B, v = j / B, k = 1 - u - v;
          const x = P[a]! * k + P[b]! * u + P[c]! * v, y = P[a + 1]! * k + P[b + 1]! * u + P[c + 1]! * v, z = P[a + 2]! * k + P[b + 2]! * u + P[c + 2]! * v;
          worst = Math.max(worst, terrainPlaneAt(w.terrain, x, z) - y);
        }
      }
      expect(worst, `terrain stands ${worst.toFixed(3)} mm above the skirt`).toBeLessThan(0.01);
    });
  }

  it('rows: fine spacing at the edge, doubling by at most one level per row outward, capped per side', () => {
    const rows = skirtRows(4, 8000), lv = rowLevels(rows, 16, 1000);
    expect(rows[0]).toBe(0);
    expect(rows[rows.length - 1]).toBe(8000);
    expect(lv[0]).toBe(0);
    expect(lv[1]).toBe(0);
    for (let k = 1; k < lv.length; k++) expect(lv[k]! - lv[k - 1]!).toBeGreaterThanOrEqual(0);
    for (let k = 1; k < lv.length; k++) expect(lv[k]! - lv[k - 1]!).toBeLessThanOrEqual(1);
    expect(Math.max(...lv)).toBe(4); // 1000 cells / 2^4 = 62 segments >= 32
  });

  it('a standard 16 m map stays within its triangle budget (one draw call)', () => {
    const w = makeTestWorld({ sizeBu: 4000, seed: 1 });
    const tris = buildSkirt(w).index.length / 3;
    expect(tris).toBeLessThan(60000);
  });

  it('terrainMaxInRect finds the peak of a bilinear cell between nodes along a border line', () => {
    const w = bumpyWorld(), hf = w.terrain;
    let brute = -Infinity;
    for (let z = 100; z <= 900; z += 0.5) brute = Math.max(brute, terrainPlaneAt(hf, 0, z));
    expect(terrainMaxInRect(hf, -300, -50, 100, 900)).toBeCloseTo(brute, 6);
  });
});

describe('edge haze', () => {
  it('does not depend on the scene fog (Haze off) and fades toward the sky colour', () => {
    // the edge haze runs outside the USE_FOG block, so it survives scene.fog = null
    const fogEnd = EDGE_FOG_FRAGMENT.lastIndexOf('#endif');
    expect(EDGE_FOG_FRAGMENT.indexOf('bdEdgeHaze(vBdW)')).toBeGreaterThan(fogEnd);
    expect(EDGE_FOG_FRAGMENT).toContain('bdSky(');
    const b = new BoundaryRenderer();
    b.init({ scene: new Scene() });
    const light = {
      skyHorizon: new Color(0.6, 0.65, 0.7), skyZenith: new Color(0.1, 0.2, 0.5), overcast: Number.NaN, sunDir: new Vector3(0, 1, 0), sunGlow: 2,
      keyColor: new Color(1, 0.9, 0.8),
    };
    b.update({ underground: false }, light);
    expect(b.uniforms.uBdZenith.value.b).toBeCloseTo(0.5);
    expect(b.uniforms.uBdOvercast.value).toBe(0); // NaN never reaches the shader
    expect(b.uniforms.uBdSunGlow.value.r).toBeCloseTo(2);
    applyEdgeHazeLight(b.uniforms, { ...light, sunGlow: -1 });
    expect(b.uniforms.uBdSunGlow.value.r).toBe(0);
    b.dispose();
  });
});

describe('backdrop', () => {
  it('follows the edge treatment of each side', () => {
    const runs = edgeRuns(decorWorld);
    const kinds = new Set(runs.map((r) => r.treatment));
    expect(kinds).toEqual(new Set(['garden', 'woods', 'road']));
    const side0 = runs.filter((r) => r.side.index === 0).map((r) => r.treatment);
    expect(side0).toEqual(['garden', 'woods']); // lawn then forest along z = 0
  });

  it('stands entirely outside the map, is deterministic and cheap', () => {
    const w = decorWorld, S = w.size, { mesh, stats } = buildBackdrop(w);
    expect(stats.shapes).toBeGreaterThan(10);
    expect(stats.triangles).toBeLessThan(20000);
    for (let i = 0; i < mesh.positions.length; i += 3) {
      expect(outsideDistance(mesh.positions[i]!, mesh.positions[i + 2]!, S)).toBeGreaterThan(0);
    }
    expect(buildBackdrop(w).mesh.positions).toEqual(mesh.positions);
    for (let i = 0; i < mesh.index.length; i++) expect(mesh.index[i]!).toBeLessThan(mesh.vertexCount);
  });
});

describe('BoundaryRenderer', () => {
  it('builds two meshes per world, clears them, patches its materials with the edge haze, disposes cleanly', () => {
    const scene = new Scene(), b = new BoundaryRenderer();
    b.init({ scene });
    b.setWorld(decorWorld);
    const meshes = () => b.group.children.filter((c) => c instanceof Mesh) as Mesh[];
    expect(meshes().length).toBe(2);
    expect(b.stats().drawCalls).toBe(2);
    expect(b.uniforms.uBdBox.value.z).toBe(decorWorld.size);
    const shader = { uniforms: {}, vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader };
    const mat = meshes()[0]!.material as { onBeforeCompile: (s: unknown, r: unknown) => void };
    mat.onBeforeCompile(shader, null);
    expect(shader.fragmentShader).toContain('bdEdgeHaze(vBdW)');
    expect(shader.vertexShader).toContain('vBdW =');
    b.update({ underground: true });
    expect(b.group.visible).toBe(false);
    b.setWorld(noiseWorld); // replaces
    expect(meshes().length).toBe(2);
    b.clear();
    expect(meshes().length).toBe(0);
    expect(b.stats().skirtTriangles).toBe(0);
    b.dispose();
    expect(scene.children.includes(b.group)).toBe(false);
  });
});

describe('edge glyph hook (GDD 04 §14)', () => {
  const S = 16000, bu = 4;
  it('fires only while pressing outward within a body length of the hard limit', () => {
    expect(edgeGlyphActive({ x: 8 * bu + 2, z: S / 2 }, { x: -1, z: 0 }, S, bu)).toBe(true);
    expect(edgeGlyphActive({ x: 8 * bu + 2, z: S / 2 }, { x: 1, z: 0 }, S, bu)).toBe(false); // walking away
    expect(edgeGlyphActive({ x: 8 * bu + 2, z: S / 2 }, { x: 0, z: 0 }, S, bu)).toBe(false); // no intent
    expect(edgeGlyphActive({ x: 40 * bu, z: S / 2 }, { x: -1, z: 0 }, S, bu)).toBe(false); // far from the limit
    expect(edgeGlyphActive({ x: S / 2, z: S - 8 * bu }, { x: 0.2, z: 0.9 }, S, bu)).toBe(true);
    expect(edgeGlyphActive({ x: S / 2, z: S - 8 * bu }, { x: 0.99, z: 0.1 }, S, bu)).toBe(false); // sliding along
  });
});
