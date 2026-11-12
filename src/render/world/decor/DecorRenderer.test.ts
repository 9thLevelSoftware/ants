// DecorRenderer in Node (no WebGL: CPU side only): streaming around the camera, deterministic revisits, the test
// preset drawing nothing, LOD counts, water inputs, seasons.
import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Scene, type WebGLRenderer } from 'three';
import { getPreset, type QualityId } from '@/render/app';
import { DecorRenderer } from './DecorRenderer';
import { buildTestWorld } from './testWorld';

const world = buildTestWorld();
world.waterBodies = [{ id: 0, kind: 'bowl-water', vesselObjectId: -1, pos: { x: 1000, y: 0, z: 3000 }, radius: 80, levelMm: 30, capMm: 40 }];

async function make(q: QualityId) {
  const camera = new PerspectiveCamera(50, 16 / 9, 0.5, 40000);
  const scene = new Scene();
  const d = new DecorRenderer();
  await d.init({ renderer: {} as WebGLRenderer, scene, camera, quality: getPreset(q), assets: null });
  d.setWorld(world, null);
  const look = (x: number, z: number) => { camera.position.set(x, 12, z); camera.lookAt(x + 50, 0, z); camera.updateMatrixWorld(); };
  const step = (subject = true) => d.update({ dt: 1 / 60, time: 1, subject: subject ? { x: camera.position.x + 18, y: 2, z: camera.position.z } : null });
  return { d, camera, scene, look, step };
}

describe('DecorRenderer', () => {
  it('streams blocks around the camera within the time budget, then completes', async () => {
    const r = await make('high');
    r.look(600, 600);
    r.step();
    const first = r.d.stats().blocks;
    expect(first).toBeGreaterThan(0);
    for (let i = 0; i < 60; i++) r.step();
    const s = r.d.stats();
    expect(s.blocks).toBeGreaterThanOrEqual(first);
    expect(s.blades).toBeGreaterThan(1000);
    expect(s.draped).toBeGreaterThan(0);
    r.d.dispose();
  });

  it('a revisited block is identical (hash of its instance buffers)', async () => {
    const r = await make('high');
    r.look(600, 600); r.d.update({ dt: 0, time: 0 }); r.d.flush();
    const before = r.d.blockHashes();
    expect(Object.keys(before).length).toBeGreaterThan(3);
    r.look(3800, 3800); r.d.update({ dt: 0, time: 0 }); r.d.flush(); // far away: the first blocks are disposed
    for (const k of Object.keys(before)) if (Number(k) === 0) expect(r.d.blockHashes()[0]).toBeUndefined();
    r.look(600, 600); r.d.update({ dt: 0, time: 0 }); r.d.flush();
    const after = r.d.blockHashes();
    for (const [k, h] of Object.entries(before)) expect(after[Number(k)]).toBe(h);
    expect(r.d.stats().revisitMismatches).toBe(0);
    r.d.dispose();
  });

  it('the test preset draws no decor (water stays: it is world state, not decor)', async () => {
    const r = await make('test');
    r.look(600, 600); r.step(); r.d.flush();
    const s = r.d.stats();
    expect(s.blocks).toBe(0);
    expect(s.blades + s.draped + s.drops).toBe(0);
    expect(s.waterSurfaces).toBe(1);
    r.d.dispose();
  });

  it('lower presets draw fewer instances (GDD 04 §9: Medium x0.5, Low x0.25)', async () => {
    const counts: Record<string, number> = {};
    for (const q of ['high', 'medium', 'low'] as const) {
      const r = await make(q);
      r.look(600, 600); r.step(); r.d.flush();
      counts[q] = r.d.stats().blades;
      r.d.dispose();
    }
    expect(counts.medium).toBeLessThan(counts.high * 0.6);
    expect(counts.low).toBeLessThan(counts.medium * 0.6);
  });

  it('seasons change forest leaf density without regenerating blocks', async () => {
    const r = await make('high');
    r.look(2500, 500);
    r.d.update({ dt: 0, time: 0, yearFrac: 0.375 }); r.d.flush();
    const summer = r.d.stats(), hashes = r.d.blockHashes(), keepSummer = r.d.shared.decor.uDcKeep.value.x;
    r.d.update({ dt: 0, time: 0, yearFrac: 0.625 });
    const autumn = r.d.stats(), keepAutumn = r.d.shared.decor.uDcKeep.value.x;
    expect(autumn.leafDensity).toBe(600);
    expect(summer.leafDensity).toBe(250);
    // leaves are thinned in the shader by rank: the kept fraction follows the seasonal density
    expect(keepAutumn).toBeCloseTo(1, 5);
    expect(keepSummer).toBeCloseTo(250 / 600, 5);
    expect(r.d.blockHashes()).toEqual(hashes);
    expect(autumn.generated).toBe(summer.generated);
    r.d.dispose();
  });

  it('water follows the level input', async () => {
    const r = await make('high');
    r.look(900, 2900); r.step();
    expect(r.d.stats().waterSurfaces).toBe(1);
    r.d.setWater({ bodyLevelScale: 0 }); r.step();
    expect(r.d.stats().waterSurfaces).toBe(0);
    r.d.dispose();
  });
});
