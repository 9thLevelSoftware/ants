// The decor follows the dynamic world block by block (worldWatch.ts): a deformation, a sward change, a dynamic or
// moved primitive rebuilds only the blocks it touches; the old block stays drawn until its replacement is built.
// Also: moss on solids follows the quality density, the camera position is read even from a stale matrix, and the
// water rebuilds on puddle changes without hashing the moisture grid every frame.
import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Scene, type WebGLRenderer } from 'three';
import { getPreset, type QualityId } from '@/render/app';
import { PrimFlag, type Primitive, type Sim, type WorldData } from '@/sim/types';
import { HEIGHT_DELTA_TILE } from '../lighting/simAdapter';
import { DecorRenderer } from './DecorRenderer';
import { GroundView } from './ground';
import { buildTestWorld } from './testWorld';
import { blockKey, blockMm } from './tiles';
import { DECOR_WATCH_FRAMES } from './tuning';
import { WorldWatch } from './worldWatch';

interface Delta { heightDeltas: { tileIndex: number; data: Int16Array }[]; grassHeightMm: Uint16Array; dynPrims: Primitive[]; objectStates: unknown[] }

function simOf(world: WorldData): { sim: Sim; delta: Delta; env: { moisture?: { cell: number; nx: number; nz: number; puddle: Uint8Array } } } {
  const zm = world.maps.zone;
  const delta: Delta = { heightDeltas: [], grassHeightMm: new Uint16Array(zm.nx * zm.nz).fill(50), dynPrims: [], objectStates: [] };
  const env = {};
  return { sim: { state: { worldDelta: delta, env } } as unknown as Sim, delta, env };
}

async function make(world: WorldData, q: QualityId, sim: Sim | null) {
  const camera = new PerspectiveCamera(50, 16 / 9, 0.5, 40000);
  const d = new DecorRenderer();
  await d.init({ renderer: {} as WebGLRenderer, scene: new Scene(), camera, quality: getPreset(q), assets: null });
  d.setWorld(world, sim);
  const look = (x: number, z: number) => { camera.position.set(x, 12, z); camera.lookAt(x + 50, 0, z); camera.updateMatrixWorld(); };
  const frame = () => d.update({ dt: 1 / 60, time: 0, sim });
  /** Frames until no rebuild is pending (each frame rebuilds within the time budget). */
  const settle = () => { for (let i = 0; i < 2 * DECOR_WATCH_FRAMES; i++) frame(); let n = 0; while (d.stats().pendingRebuilds > 0 && n++ < 500) frame(); };
  return { d, camera, look, frame, settle };
}

const BU = 4, S = blockMm(BU); // 1024 mm blocks

describe('decor follows the dynamic world block by block', () => {
  it('a footprint rebuilds only its block, and the block stays drawn meanwhile', async () => {
    const world = buildTestWorld(), { sim, delta } = simOf(world);
    const r = await make(world, 'high', sim);
    r.look(600, 600); r.frame(); r.d.flush();
    const before = r.d.blockHashes(), n = r.d.stats().blocks;
    // a 2 mm dent at grid point (10, 10) of tile 1 (x 512..1008 mm): lawn block (0, 0)
    const data = new Int16Array(HEIGHT_DELTA_TILE * HEIGHT_DELTA_TILE); data[10 * HEIGHT_DELTA_TILE + 10] = -32;
    delta.heightDeltas = [{ tileIndex: 1, data }];
    r.frame();
    expect(r.d.stats().blocks).toBe(n); // nothing vanished
    r.settle();
    const after = r.d.blockHashes();
    const changed = Object.keys(before).filter((k) => after[Number(k)] !== before[Number(k)]).map(Number);
    expect(changed).toEqual([blockKey(0, 0)]);
    expect(r.d.stats().rebuilt).toBeLessThanOrEqual(2); // the tile's rectangle touches the next block's edge
    // editing the same tile in place is seen too, and removing it restores the original records
    data[10 * HEIGHT_DELTA_TILE + 10] = 0; delta.heightDeltas = [];
    r.settle();
    expect(r.d.blockHashes()).toEqual(before);
    expect(r.d.stats().revisitMismatches).toBe(0);
    r.d.dispose();
  });

  it('a mown stripe rebuilds only the blocks under the changed nav cells', async () => {
    const world = buildTestWorld(), { sim, delta } = simOf(world);
    const r = await make(world, 'high', sim);
    r.look(1000, 1000); r.frame(); r.d.flush();
    const before = r.d.blockHashes();
    const zm = world.maps.zone;
    // mow a stripe of cells in z 300..400 mm, x 1100..1900 mm (inside block (1, 0), away from its edges)
    for (let k = Math.floor(300 / zm.cell); k < 400 / zm.cell; k++) for (let i = Math.ceil(1300 / zm.cell); i < 1700 / zm.cell; i++) delta.grassHeightMm[k * zm.nx + i] = 20;
    r.settle();
    const after = r.d.blockHashes();
    const changed = Object.keys(before).filter((k) => after[Number(k)] !== before[Number(k)]).map(Number);
    expect(changed).toEqual([blockKey(1, 0)]);
    r.d.dispose();
  });

  it('grass does not grow through a dynamic primitive, and follows it when it moves', async () => {
    const world = buildTestWorld(), { sim, delta } = simOf(world);
    const r = await make(world, 'high', sim);
    r.look(600, 600); r.frame(); r.d.flush();
    const blades = () => r.d.stats().blades;
    const full = blades();
    const box = (x: number): Primitive => ({ id: 5000, shape: 'box', pos: { x, y: 0, z: 500 }, rot: { x: 0, y: 0, z: 0, w: 1 }, size: { x: 150, y: 30, z: 150 }, round: 2, material: 'plastic', flags: PrimFlag.DYNAMIC, objectId: -1 });
    delta.dynPrims = [box(500)];
    r.settle();
    const under = blades();
    expect(under).toBeLessThan(full - 100); // 0.09 m² at 3000 / m²: about 270 blades fewer
    const g = new GroundView(world, sim);
    expect(g.prims.inside(500, 5, 500)).toBe(false); // a fresh GroundView knows only static prims...
    delta.dynPrims = [box(1500)]; // ... the renderer follows the move to the next block
    r.settle();
    const hashes = r.d.blockHashes();
    delta.dynPrims = [];
    r.settle();
    expect(blades()).toBe(full);
    expect(r.d.blockHashes()).not.toEqual(hashes);
    r.d.dispose();
  });

  it('a moved object takes its primitives along (leaves on a moved slab, grass under it)', () => {
    const world = buildTestWorld();
    world.objects.push({ id: 77, templateId: 'patio-slab', pos: { x: 500, y: 0, z: 500 }, rot: { x: 0, y: 0, z: 0, w: 1 }, primStart: world.prims.length, primCount: 1, tags: [], routeIds: [], poiIds: [] });
    world.prims.push({ id: 777, shape: 'box', pos: { x: 500, y: 0, z: 500 }, rot: { x: 0, y: 0, z: 0, w: 1 }, size: { x: 100, y: 20, z: 100 }, round: 2, material: 'concrete', flags: PrimFlag.CLIMBABLE, objectId: 77 });
    const g = new GroundView(world), w = new WorldWatch(world);
    expect(g.prims.inside(500, 5, 500)).toBe(true);
    const sim = { state: { worldDelta: { objectStates: [{ objectId: 77, state: 'moved', pos: { x: 900, y: 0, z: 500 }, rot: null, tick: 1 }] }, env: {} } } as unknown as Sim;
    const rects = w.prims(sim, g.prims);
    expect(g.prims.inside(500, 5, 500)).toBe(false);
    expect(g.prims.inside(900, 5, 500)).toBe(true);
    expect(rects.length).toBe(2); // old and new footprint
    expect(w.prims(sim, g.prims)).toEqual([]); // unchanged: nothing to do
  });

  it('a far deformation, sward change or prim change does not touch the blocks around the camera', async () => {
    const world = buildTestWorld(), { sim, delta } = simOf(world);
    const r = await make(world, 'high', sim);
    r.look(600, 600); r.frame(); r.d.flush();
    const before = r.d.blockHashes();
    const T = HEIGHT_DELTA_TILE, tilesX = Math.ceil(world.terrain.nx / T), data = new Int16Array(T * T); data[5] = -16;
    delta.heightDeltas = [{ tileIndex: tilesX * tilesX - 1, data }];
    delta.grassHeightMm[delta.grassHeightMm.length - 1] = 90;
    delta.dynPrims = [{ id: 9000, shape: 'ellipsoid', pos: { x: 3900, y: 0, z: 3900 }, rot: { x: 0, y: 0, z: 0, w: 1 }, size: { x: 30, y: 20, z: 30 }, round: 0, material: 'loam', flags: PrimFlag.DYNAMIC, objectId: -1 }];
    r.settle();
    expect(r.d.blockHashes()).toEqual(before);
    expect(r.d.stats().rebuilt).toBe(0);
    r.d.dispose();
  });
});

describe('decor quality and integration details', () => {
  it('moss on solids follows the quality density (GDD 04 §9: Medium x0.5, Low x0.25)', async () => {
    const world = buildTestWorld();
    world.maps.shade.data.fill(200);
    world.prims = []; // only the stone (the slabs would bring blocks outside the smaller radius of Low)
    world.prims.push({ id: 999, shape: 'ellipsoid', pos: { x: 2600, y: 4, z: 600 }, rot: { x: 0, y: 0, z: 0, w: 1 }, size: { x: 400, y: 40, z: 300 }, round: 0, material: 'stone', flags: PrimFlag.CLIMBABLE, objectId: -1 });
    const moss: Record<string, number> = {};
    for (const q of ['high', 'medium', 'low'] as const) {
      const r = await make(world, q, null);
      r.look(2600, 600); r.frame(); r.d.flush();
      moss[q] = r.d.stats().mossPatches;
      r.d.dispose();
    }
    expect(moss.high).toBeGreaterThan(8);
    expect(moss.medium).toBe(Math.round(moss.high * 0.5));
    expect(moss.low).toBe(Math.round(moss.high * 0.25));
  });

  it('reads the camera position even when its world matrix is stale (update order with the terrain)', async () => {
    const world = buildTestWorld();
    const r = await make(world, 'high', null);
    r.look(600, 600); r.frame(); r.d.flush();
    r.camera.position.set(3600, 12, 3600); // no updateMatrixWorld()
    r.frame(); r.d.flush();
    const keys = Object.keys(r.d.blockHashes()).map(Number);
    expect(keys).toContain(blockKey(Math.floor(3600 / S), Math.floor(3600 / S)));
    expect(keys).not.toContain(blockKey(0, 0));
    r.d.dispose();
  });

  it('water rebuilds when the puddle store changes, checking the grid only every few frames', async () => {
    const world = buildTestWorld(), { sim, env } = simOf(world);
    const zm = world.maps.zone;
    const puddle = new Uint8Array(zm.nx * zm.nz);
    env.moisture = { cell: zm.cell, nx: zm.nx, nz: zm.nz, puddle };
    const r = await make(world, 'high', sim);
    r.look(600, 600); r.frame();
    expect(r.d.stats().waterSurfaces).toBe(0);
    puddle[50 * zm.nx + 40] = 40; // 2 mm of water in one cell
    for (let i = 0; i < DECOR_WATCH_FRAMES; i++) r.frame();
    expect(r.d.stats().waterSurfaces).toBe(1);
    r.d.dispose();
  });
});
