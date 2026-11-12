// Adversarial checks of the map boundary (reviewer, render-integration): the backdrop's "nothing hangs over the
// playable area" promise on more worlds than the decor test world (lumpy foliage can reach past the placement
// reach), the skirt's seam with the terrain on a full-size map (the mesh, not only the height function), and the
// edge-glyph hook on broken input.
import { describe, expect, it } from 'vitest';
import { terrainHeightAt } from '@/sim/entities/placement';
import { makeTestWorld } from '@/sim/testing';
import type { WorldData } from '@/sim/types';
import { generateWorld, defaultWorldParams } from '@/worldgen';
import { makeTitleWorld } from '@/game/title/titleWorld';
import { buildWorld } from '@/sim/testing/worldBuilder';
import { buildTestWorld } from '../decor/testWorld';
import { buildBackdrop, buildSkirt, edgeGlyphActive, outsideDistance } from './index';
import { BACKDROP_MARGIN_MM } from './tuning';

const env = (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

/** Smallest distance of any backdrop vertex from the map square, mm (negative: inside the map). */
function backdropClearance(w: WorldData): { min: number; inside: number } {
  const P = buildBackdrop(w).mesh.positions, S = w.size;
  let min = Infinity, inside = 0;
  for (let i = 0; i < P.length; i += 3) {
    const x = P[i]!, z = P[i + 2]!;
    const d = outsideDistance(x, z, S);
    const signed = d > 0 ? d : -Math.min(x, z, S - x, S - z);
    if (signed <= 0) inside++;
    min = Math.min(min, signed);
  }
  return { min, inside };
}

describe('backdrop stays outside the map on more worlds', () => {
  const worlds: [string, () => WorldData][] = [
    ['title vignette', () => makeTitleWorld()],
    ['decor test world', () => buildTestWorld()],
    ['lawn 1000 BU seed 1', () => makeTestWorld({ sizeBu: 1000, seed: 1 })],
    ['lawn 1000 BU seed 2', () => makeTestWorld({ sizeBu: 1000, seed: 2 })],
    ['lawn 1000 BU seed 3', () => makeTestWorld({ sizeBu: 1000, seed: 3 })],
  ];
  for (const [name, make] of worlds) {
    it(`${name}: no backdrop vertex inside the map square`, () => {
      const c = backdropClearance(make());
      expect(c.inside, `vertices inside the map (min clearance ${c.min.toFixed(0)} mm)`).toBe(0);
    });
  }
  it('documents the clearance actually kept against BACKDROP_MARGIN_MM (tuning.ts promises this much)', () => {
    // tuning.ts: "Every shape keeps at least this clearance (mm) from the map square". Lumpy foliage scales a canopy
    // radius by up to 1 + FOLIAGE_LUMP x fbm, beyond the `reach` the placement reserved.
    let worst = Infinity;
    for (const seed of [1, 2, 3]) worst = Math.min(worst, backdropClearance(makeTestWorld({ sizeBu: 1000, seed })).min);
    expect(worst).toBeGreaterThanOrEqual(BACKDROP_MARGIN_MM * 0.5);
  });
});

/**
 * Worst gaps between the skirt mesh's edge on x = 0 (the chord between its edge vertices, SKIRT_EDGE_SEGMENTS per
 * side) and the terrain edge it should meet: `above` = skirt over the terrain (a ledge seen from inside the map),
 * `below` = terrain over the skirt (the renderer's clamped terrain continuation, extruded outward from the edge,
 * stands up through the skirt).
 */
function edgeSeam(w: WorldData): { above: number; below: number; worstZ: number } {
  const S = w.size, sk = buildSkirt(w), P = sk.positions;
  const edge: [number, number][] = [];
  for (let i = 0; i < P.length; i += 3) if (P[i] === 0 && P[i + 2]! >= 0 && P[i + 2]! <= S) edge.push([P[i + 2]!, P[i + 1]!]);
  edge.sort((a, b) => a[0] - b[0]);
  let above = 0, below = 0, worstZ = 0;
  for (let k = 0; k + 1 < edge.length; k++) {
    const [z0, y0] = edge[k]!, [z1, y1] = edge[k + 1]!;
    for (let t = 0; t <= 1; t += 1 / 32) {
      const z = z0 + (z1 - z0) * t, chord = y0 + (y1 - y0) * t, ground = terrainHeightAt(w.terrain, 0, z);
      above = Math.max(above, chord - ground);
      if (ground - chord > below) { below = ground - chord; worstZ = z; }
    }
  }
  return { above, below, worstZ };
}

describe('skirt seam with the terrain between skirt vertices', () => {
  it('a 20 mm bank at the edge between two skirt vertices is not left standing above the skirt', () => {
    // A 4 m map: skirt edge vertices every 4000 / 96 = 41.7 mm. A 20 mm high, ~32 mm wide bank centred between two
    // of them along x = 0 (a kerb, a bed edge, a root) is invisible to the chord.
    const bu = 4, size = 1000 * bu, zc = (2.5 / 96) * size;
    const height = (_x: number, z: number) => 20 * Math.max(0, 1 - Math.abs(z - zc) / 16);
    const w = buildWorld({ params: { ...defaultWorldParams('lasius-niger', 1), sizeClass: 'compact' }, size, bu, height });
    const s = edgeSeam(w);
    expect(s.below, `terrain edge stands ${s.below.toFixed(1)} mm above the skirt at z = ${s.worstZ.toFixed(0)} mm`).toBeLessThan(1);
  });

  it.skipIf(!env.FOUNDRESS_LONG)('generated standard map (seed 7): measured seam', () => {
    // measured once by the reviewer: above 3.4 mm, below 83.5 mm (the generation alone takes ~25 s here)
    const s = edgeSeam(generateWorld(defaultWorldParams('lasius-niger', 7)));
    expect(s.above).toBeLessThan(1);
    expect(s.below).toBeLessThan(1);
  }, 120000);
});

describe('edge glyph on broken input', () => {
  it('is false for NaN position or direction and for a zero-size map', () => {
    expect(edgeGlyphActive({ x: Number.NaN, z: 10 }, { x: -1, z: 0 }, 16000, 4)).toBe(false);
    expect(edgeGlyphActive({ x: 33, z: 10 }, { x: Number.NaN, z: 0 }, 16000, 4)).toBe(false);
    expect(edgeGlyphActive({ x: 33, z: 10 }, { x: -1, z: 0 }, 0, 4)).toBe(false);
    // a corner: pressing diagonally out of both sides
    expect(edgeGlyphActive({ x: 33, z: 33 }, { x: -1, z: -1 }, 16000, 4)).toBe(true);
  });
});
