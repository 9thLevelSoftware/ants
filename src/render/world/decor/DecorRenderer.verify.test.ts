// Reviewer tests (render-decor): try to break streaming determinism, the test preset, deformation handling and the
// per-species cost of the decor. CPU side only (no WebGL), like DecorRenderer.test.ts.
import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Scene, type WebGLRenderer } from 'three';
import { getPreset, type QualityId } from '@/render/app';
import type { Sim, WorldData } from '@/sim/types';
import { buildWorld } from '@/sim/testing/worldBuilder';
import { defaultWorldParams } from '@/worldgen/params';
import { DecorRenderer } from './DecorRenderer';
import { buildTestWorld } from './testWorld';

async function make(world: WorldData, q: QualityId) {
  const camera = new PerspectiveCamera(50, 16 / 9, 0.5, 40000);
  const d = new DecorRenderer();
  await d.init({ renderer: {} as WebGLRenderer, scene: new Scene(), camera, quality: getPreset(q), assets: null });
  d.setWorld(world, null);
  const look = (x: number, z: number, y = 12) => { camera.position.set(x, y, z); camera.lookAt(x + 50, 0, z); camera.updateMatrixWorld(); };
  return { d, camera, look };
}

/** A sim stub carrying only what the decor reads (deformation tiles). */
function simWithDeltas(tiles: { tileIndex: number; data: Int16Array }[]): Sim {
  return { state: { worldDelta: { heightDeltas: tiles }, env: {} } } as unknown as Sim;
}

describe('DecorRenderer (review)', () => {
  it('block records do not depend on the preset, the season or the path the camera took', async () => {
    const world = buildTestWorld();
    const a = await make(world, 'high');
    a.look(600, 600); a.d.update({ dt: 0, time: 0, yearFrac: 0.1 }); a.d.flush();
    const ha = a.d.blockHashes();
    const b = await make(world, 'low');
    b.look(3500, 3500); b.d.update({ dt: 0, time: 0, yearFrac: 0.7 }); b.d.flush();
    b.look(600, 600); b.d.update({ dt: 0, time: 5, yearFrac: 0.7 }); b.d.flush();
    const hb = b.d.blockHashes();
    const common = Object.keys(ha).filter((k) => k in hb);
    expect(common.length).toBeGreaterThan(3);
    for (const k of common) expect(hb[Number(k)]).toBe(ha[Number(k)]);
    a.d.dispose(); b.d.dispose();
  });

  it('switching to the test preset at runtime drops every block (GDD 04 §9: test 0)', async () => {
    const world = buildTestWorld();
    const r = await make(world, 'high');
    r.look(500, 2600); // paving: moss blocks
    r.d.update({ dt: 0, time: 0 }); r.d.flush();
    expect(r.d.stats().blocks).toBeGreaterThan(0);
    r.d.setQuality(getPreset('test'));
    r.d.update({ dt: 0, time: 0 }); r.d.flush();
    const s = r.d.stats();
    // FAILS: the block that contains the camera has rectDistance 0, and `0 > 0 * DECOR_DISPOSE_K` is false, so it
    // is never disposed; its moss mesh keeps drawing (moss ignores the density factor).
    expect(s.blocks).toBe(0);
    expect(s.mossPatches + s.blades + s.draped).toBe(0);
    r.d.dispose();
  });

  it('a terrain deformation far outside the decor radius does not empty the decor around the camera', async () => {
    const world = buildTestWorld();
    const r = await make(world, 'high');
    r.look(600, 600);
    r.d.update({ dt: 0, time: 0 }); r.d.flush();
    const before = r.d.stats().blocks;
    expect(before).toBeGreaterThan(5);
    // one footprint-sized deformation tile in the far corner of the map (about 4 m away)
    const T = 32, tilesX = Math.ceil(world.terrain.nx / T), last = tilesX * tilesX - 1;
    const data = new Int16Array(T * T); data[5] = -16;
    r.d.update({ dt: 1 / 60, time: 0, sim: simWithDeltas([{ tileIndex: last, data }]) });
    const after = r.d.stats().blocks;
    const sim = simWithDeltas([{ tileIndex: last, data }]);
    let frames = 1;
    while (r.d.stats().blocks < before && frames < 500) { r.d.update({ dt: 1 / 60, time: 0, sim }); frames++; }
    // eslint-disable-next-line no-console
    console.log(`[review] after a far deformation: ${after}/${before} blocks on the next frame, ${frames} frames to recover`);
    // FAILS: watchWorldChanges() clears every block on any height-delta change, and the next frame regenerates only
    // what fits the 3 ms budget, so the whole decor around the camera vanishes and streams back over many frames.
    expect(after).toBeGreaterThanOrEqual(before * 0.9);
    r.d.dispose();
  });

  it('cost per view does not explode for a larger body unit (Camponotus BU 9 vs Lasius BU 4, High)', async () => {
    const lawn = (bu: number, size: number) => buildWorld({ params: defaultWorldParams('lasius-niger', 3), size, bu, height: () => 0 });
    const tris: Record<number, number> = {};
    for (const bu of [4, 9]) {
      const r = await make(lawn(bu, 4000 * bu), 'high');
      r.look(2000 * bu, 2000 * bu, 3 * bu);
      r.d.update({ dt: 0, time: 0, subject: { x: 2000 * bu + 6 * bu, y: bu * 0.3, z: 2000 * bu } }); r.d.flush();
      tris[bu] = r.d.stats().trianglesSubmitted;
      r.d.dispose();
    }
    // eslint-disable-next-line no-console
    console.log('[review] decor triangles submitted, High, flat lawn:', JSON.stringify(tris));
    // densities are per m² while radii and LOD distances are in BU, so the count grows with BU² (about 5x here).
    // The architecture budget (1.5 M tris for the whole frame) is species-independent.
    expect(tris[9]).toBeLessThan(tris[4] * 2);
  }, 120000);
});
