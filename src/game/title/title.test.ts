// Title backdrop (GDD 08 §3.3, render-integration): the vignette is deterministic and small, its three ants stand on
// the ground, the camera drifts at 0.5 BU/s and stays above ground, the host hands the vignette to the renderers and
// lets a new game replace it, and the scenic read-outs find a lawn spot with litter and a view across the edge.
import { describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera } from 'three';
import type { FrameInfo, RenderRegistry } from '@/render';
import type { QualityId, RenderApp } from '@/render/app';
import { makePose } from '@/render/camera';
import { makeTestSim } from '@/sim/testing';
import type { Sim } from '@/sim/types';
import { buildTestWorld } from '@/render/world/decor/testWorld';
import { LAWN_MIN_LITTER_SHARE, LAWN_MIN_TREE_DIST_MM, lawnLitterShare } from './scenicQueries';
import {
  driftOffsetBU, edgeView, lawnSpot, makeTitleSim, makeTitleWorld, TITLE_CAMERA, TITLE_LAYOUT, TITLE_STILL_SETTLE_FRAMES, TitleHost, titlePose,
  titleQualityCap, titleSceneWanted, titleSubject,
} from './index';

describe('title vignette', () => {
  it('is deterministic: lawn and woodland zones, stones, three idle workers standing on the ground', () => {
    const a = makeTitleWorld(), b = makeTitleWorld();
    expect(Array.from(a.terrain.data)).toEqual(Array.from(b.terrain.data));
    expect(a.prims).toEqual(b.prims);
    expect(new Set(a.zones.map((z) => z.type))).toEqual(new Set(['lawn', 'forest']));
    expect(a.prims.length).toBe(TITLE_LAYOUT.stones);
    const sim = makeTitleSim();
    const workers = sim.state.ants.filter((x) => x.alive && x.caste === 'worker');
    expect(workers.length).toBe(TITLE_LAYOUT.ants);
    for (const w of workers) {
      const f = sim.field.sampleXYZ(w.pos.x, w.pos.y, w.pos.z);
      expect(Math.abs(f)).toBeLessThan(sim.world.bu); // on the level set near the ground, not floating or buried
      expect(w.up.y).toBeGreaterThan(0.7);
    }
    const s2 = makeTitleSim();
    expect(s2.state.ants.map((x) => x.pos)).toEqual(sim.state.ants.map((x) => x.pos));
  });

  it('is never ticked: the sim has no systems', () => {
    const sim = makeTitleSim();
    const before = JSON.stringify(sim.state.ants.map((x) => x.pos));
    sim.tick();
    expect(JSON.stringify(sim.state.ants.map((x) => x.pos))).toBe(before);
  });
});

describe('title camera', () => {
  const sim = makeTitleSim(), bu = sim.world.bu, subject = titleSubject(sim);
  const ground = (x: number, z: number) => sim.field.height(x, z);

  it('drifts sideways at no more than 0.5 BU/s and stays above the ground looking at the ants', () => {
    let prev = titlePose(subject, ground, bu, 0, makePose());
    let maxSpeed = 0;
    for (let t = 0.1; t < 120; t += 0.1) {
      const p = titlePose(subject, ground, bu, t, makePose());
      maxSpeed = Math.max(maxSpeed, Math.hypot(p.pos.x - prev.pos.x, p.pos.z - prev.pos.z) / 0.1 / bu);
      expect(p.pos.y - ground(p.pos.x, p.pos.z)).toBeGreaterThanOrEqual(TITLE_CAMERA.heightBU * bu - 1e-6);
      prev = p;
    }
    expect(maxSpeed).toBeLessThanOrEqual(TITLE_CAMERA.driftBUs + 1e-3);
    expect(maxSpeed).toBeGreaterThan(0.4);
    expect(Math.abs(driftOffsetBU(1e4))).toBeLessThanOrEqual(TITLE_CAMERA.driftRangeBU);
    const p0 = titlePose(subject, ground, bu, 0, makePose());
    expect(titlePose(subject, ground, bu, 0, makePose())).toEqual(p0); // deterministic at a frozen clock
    const d = Math.hypot(p0.pos.x - subject.x, p0.pos.z - subject.z) / bu;
    expect(d).toBeGreaterThan(TITLE_CAMERA.distanceBU - 1);
  });

  it('the backdrop is skipped with autostart or title=0', () => {
    expect(titleSceneWanted('?test=1')).toBe(true);
    expect(titleSceneWanted('?test=1&autostart=1')).toBe(false);
    expect(titleSceneWanted('?title=0')).toBe(false);
  });
});

describe('TitleHost', () => {
  function fakes() {
    const started: Sim[] = [];
    const frames: FrameInfo[] = [];
    let resolve: () => void = () => {};
    const registry = {
      onGameStart: vi.fn((s: Sim) => { started.push(s); return new Promise<void>((r) => { resolve = r; }); }),
      update: vi.fn((f: FrameInfo) => { frames.push(f); }),
    } as unknown as RenderRegistry;
    const app = {
      quality: { id: 'medium' }, renderer: { domElement: { height: 720 } }, setFocus: vi.fn(), setOnDemand: vi.fn(), requestRender: vi.fn(),
    } as unknown as RenderApp;
    const canvas = { clientWidth: 1280, clientHeight: 720 } as HTMLCanvasElement;
    const host = new TitleHost({ registry: () => registry, app: () => app, camera: new PerspectiveCamera(), canvas, testMode: true, reducedMotion: () => false });
    return { host, started, frames, finish: () => resolve(), registry, app };
  }

  it('hands the vignette to the renderers and draws it once built', async () => {
    const f = fakes();
    const ready = f.host.enter();
    expect(f.started.length).toBe(1);
    expect(f.host.frame(0)).toBeNull(); // not built yet
    f.finish();
    expect(await ready).toBe(true);
    expect(f.host.active).toBe(true);
    const fr = f.host.frame(0)!;
    expect(fr.sim).toBe(f.started[0]);
    expect(fr.time).toBe(0); // test mode: frozen clock
    expect(fr.possessedId).toBe(-1);
  });

  it('a new game replaces it cleanly, even while it is still building', async () => {
    const f = fakes();
    const ready = f.host.enter();
    f.host.leave(); // newGame
    f.finish();
    expect(await ready).toBe(false);
    expect(f.host.active).toBe(false);
    expect(f.host.frame(0)).toBeNull();
  });
});

describe('TitleHost outside test mode: Low cap, still frames, re-entry', () => {
  function host(opts: { player: QualityId; app: string; failBuild?: boolean }) {
    const caps: boolean[] = [];
    const registry = {
      onGameStart: vi.fn(() => (opts.failBuild ? Promise.reject(new Error('boom')) : Promise.resolve())),
      update: vi.fn(),
    } as unknown as RenderRegistry & { update: ReturnType<typeof vi.fn>; onGameStart: ReturnType<typeof vi.fn> };
    const app = {
      quality: { id: opts.app }, renderer: { domElement: { height: 720 } }, setFocus: vi.fn(), setOnDemand: vi.fn(), requestRender: vi.fn(),
    };
    const canvas = { clientWidth: 1280, clientHeight: 720 };
    const h = new TitleHost({
      registry: () => registry, app: () => app as unknown as RenderApp, camera: new PerspectiveCamera(), canvas: canvas as HTMLCanvasElement,
      testMode: false, reducedMotion: () => false, playerQuality: () => opts.player, setQualityCap: (on) => caps.push(on),
    });
    return { h, caps, registry, app, canvas };
  }

  it('caps the preset at Low while entered (test stays test) and lifts the cap on leave', async () => {
    expect(['test', 'low', 'medium', 'high', 'ultra'].map((q) => titleQualityCap(q as QualityId))).toEqual(['test', 'low', 'low', 'low', 'low']);
    const f = host({ player: 'high', app: 'low' });
    await f.h.enter();
    expect(f.caps).toEqual([true]);
    f.h.leave();
    expect(f.caps).toEqual([true, false]);
  });

  it("drifts when the player's preset is above Low although the capped app renders at Low", async () => {
    const f = host({ player: 'high', app: 'low' });
    await f.h.enter();
    const a = f.h.frame(1 / 60)!.camera.position.clone();
    for (let i = 0; i < 60; i++) f.h.frame(1 / 60);
    expect(f.h.frame(1 / 60)!.camera.position.distanceTo(a)).toBeGreaterThan(0);
  });

  it('a settled still frame updates the renderers no more (and settles again when the canvas changes)', async () => {
    const f = host({ player: 'low', app: 'low' });
    await f.h.enter();
    for (let i = 0; i < TITLE_STILL_SETTLE_FRAMES + 50; i++) expect(f.h.frame(1 / 60)).not.toBeNull();
    expect(f.registry.update).toHaveBeenCalledTimes(TITLE_STILL_SETTLE_FRAMES);
    for (const c of f.registry.update.mock.calls) expect((c[0] as FrameInfo).dt).toBe(0); // eased looks settle at once
    f.canvas.clientWidth = 1920;
    for (let i = 0; i < TITLE_STILL_SETTLE_FRAMES + 50; i++) f.h.frame(1 / 60);
    expect(f.registry.update).toHaveBeenCalledTimes(2 * TITLE_STILL_SETTLE_FRAMES);
  });

  it('ensure() rebuilds a title that was left without a new one (failed load), once; a failed build is not retried', async () => {
    const f = host({ player: 'medium', app: 'low' });
    expect(f.h.ensure()).toBe(true);
    await f.h.ready;
    expect(f.h.ensure()).toBe(false);
    expect(f.registry.onGameStart).toHaveBeenCalledTimes(1);
    f.h.leave(); // e.g. the save host's adopt() -> endGame(false), then the load fails and the Game falls back to the title
    expect(f.h.ensure()).toBe(true);
    expect(f.registry.onGameStart).toHaveBeenCalledTimes(2);
    const bad = host({ player: 'medium', app: 'low', failBuild: true });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    bad.h.ensure();
    expect(await bad.h.ready).toBe(false);
    expect(bad.h.ensure()).toBe(false);
    expect(bad.registry.onGameStart).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });
});

describe('scenic read-outs', () => {
  it('find a lawn spot within the leaf-litter fringe of a tree and a camera view across an outdoor edge', () => {
    const sim = makeTestSim({ world: buildTestWorld() });
    const spot = lawnSpot(sim)!;
    expect(spot).not.toBeNull();
    expect(spot.treeDistMm).toBeGreaterThanOrEqual(LAWN_MIN_TREE_DIST_MM);
    expect(spot.litterShare).toBeGreaterThanOrEqual(LAWN_MIN_LITTER_SHARE); // half the full leaf density or more
    expect(spot.litterShare).toBeCloseTo(lawnLitterShare(spot.treeDistMm), 2);
    const v = edgeView(sim)!;
    expect(v.zone).not.toBe('interior');
    const S = sim.world.size;
    const outward = v.side === 0 ? v.look.z < 0 : v.side === 1 ? v.look.x > S : v.side === 2 ? v.look.z > S : v.look.x < 0;
    expect(outward).toBe(true);
  });
});
