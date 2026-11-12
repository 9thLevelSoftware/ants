// Map boundary (GDD 04 §14, render-integration): the skirt continues the ground without a seam and never under the
// terrain's clamped continuation, nothing of it lies inside the map, the backdrop follows the edge treatment and
// stays outside, everything is deterministic, and the edge glyph hook fires only when pressing outward at the limit.
import { describe, expect, it } from 'vitest';
import { Mesh, Scene, ShaderLib } from 'three';
import { terrainHeightAt } from '@/sim/entities/placement';
import { makeTestWorld } from '@/sim/testing';
import { buildTestWorld } from '../decor/testWorld';
import {
  BoundaryRenderer, buildBackdrop, buildSkirt, edgeGlyphActive, edgeRuns, makeSkirtHeight, outsideDistance, reflectInto,
} from './index';
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
    expect(sk.index.length / 3).toBeLessThan(40000);
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
