// Adversarial checks of the world slot's dressing wiring (reviewer, render-integration): a game that ends while its
// world is still loading leaves no decor or boundary behind, the grade eases on real frames instead of jumping,
// the boundary hides underground, and a title world replaced by a game without an onGameEnd in between (the
// Game.newGame path from the title) leaves exactly one world's boundary meshes.
import { describe, expect, it, vi } from 'vitest';
import { Mesh, PerspectiveCamera, Scene, type WebGLRenderer } from 'three';
import { getPreset, type QualityId } from '@/render/app';
import type { GradeParams } from '@/render/app/look';
import { RenderRegistry, type FrameInfo, type RenderContext } from '@/render';
import { makeTestSim } from '@/sim/testing';
import type { Sim } from '@/sim/types';
import { makeTitleSim } from '@/game/title/titleWorld';
import { buildTestWorld } from '../world/decor/testWorld';
import { WorldSlot } from './index';

function context(scene: Scene, camera: PerspectiveCamera, q: QualityId, grades: GradeParams[]): RenderContext {
  return {
    renderer: { domElement: { height: 360 } } as unknown as WebGLRenderer, scene, camera, quality: getPreset(q), assets: null,
    game: { requestRender: () => {}, testMode: true }, setGrade: (g) => grades.push({ saturation: g.saturation, gain: [...g.gain] }),
  };
}

function frame(sim: Sim | null, camera: PerspectiveCamera, extra: Partial<FrameInfo> = {}): FrameInfo {
  return {
    dt: 0, time: 0, alpha: 1, sim, view: 'observer', underground: false, camera, viewportHeightPx: 360, subject: null, possessedId: -1,
    possessedPose: null, subjectOpacity: 1, cutaway: null, ...extra,
  };
}

async function boot(q: QualityId = 'test') {
  const grades: GradeParams[] = [];
  const reg = new RenderRegistry();
  const scene = new Scene(), camera = new PerspectiveCamera(50, 16 / 9, 0.5, 1e5);
  await reg.init(context(scene, camera, q, grades));
  const world = reg.entries[0]!.renderer as WorldSlot;
  (world.world as unknown as { skyEnv: object }).skyEnv = { update: () => false, texture: null, bakes: 0, dispose: () => {} };
  camera.position.set(700, 14, 700);
  camera.lookAt(760, 2, 700);
  camera.updateMatrixWorld();
  return { reg, scene, camera, world, grades };
}

const boundaryMeshes = (scene: Scene) => {
  let n = 0;
  scene.traverse((o) => { if (o instanceof Mesh && o.parent?.name === 'boundary') n++; });
  return n;
};

describe('world slot dressing (reviewer)', () => {
  it('a game ended while its world loads builds no decor and no boundary afterwards', async () => {
    const { reg, scene, world } = await boot('low');
    const setWorld = vi.spyOn(world.decor, 'setWorld');
    const pending = reg.onGameStart(makeTestSim({ world: buildTestWorld() }));
    reg.onGameEnd();
    await pending;
    expect(setWorld).not.toHaveBeenCalled();
    expect(boundaryMeshes(scene)).toBe(0);
    reg.dispose();
  });

  it('title world then a game without onGameEnd between (newGame from the title): one boundary, the game world', async () => {
    const { reg, scene, camera, world } = await boot('test');
    const title = makeTitleSim();
    await reg.onGameStart(title);
    reg.update(frame(title, camera));
    const game = makeTestSim({ world: buildTestWorld() });
    await reg.onGameStart(game);
    reg.update(frame(game, camera));
    expect(boundaryMeshes(scene)).toBe(2);
    expect(world.boundary.uniforms.uBdBox.value.z).toBe(game.world.size);
    reg.dispose();
  });

  it('eases the grade over real frames (no jump to frost) and hides the boundary underground', async () => {
    const { reg, camera, world, grades } = await boot('test');
    const sim = makeTestSim({ world: buildTestWorld() });
    await reg.onGameStart(sim);
    reg.update(frame(sim, camera)); // settle at the clear-sky grade
    const before = grades.at(-1)!.saturation;
    sim.state.env.weather.state = 'frost';
    reg.update(frame(sim, camera, { dt: 1 / 60 }));
    const after = grades.at(-1)!.saturation;
    expect(after).toBeLessThan(before);
    expect(before - after).toBeLessThan(0.05); // one 16 ms frame of a ~2 s ease
    for (const g of grades) for (const v of [g.saturation, ...g.gain]) expect(Number.isFinite(v)).toBe(true);
    reg.update(frame(sim, camera, { underground: true }));
    expect(world.boundary.group.visible).toBe(false);
    reg.update(frame(sim, camera));
    expect(world.boundary.group.visible).toBe(true);
    reg.dispose();
  });

  it('update() before any world (title not built yet) is harmless and neutral', async () => {
    const { reg, camera, grades } = await boot('test');
    reg.update(frame(null, camera, { dt: 0.016 }));
    expect(grades.at(-1)).toEqual({ saturation: 1, gain: [1, 1, 1] });
    reg.dispose();
  });
});
