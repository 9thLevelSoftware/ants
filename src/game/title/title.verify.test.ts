// Adversarial checks of the title backdrop (reviewer, render-integration): the still-frame rule outside test mode,
// a re-entered title superseding a pending build, the drift camera staying inside the vignette over a long session,
// and the scenic read-outs on worlds where they have nothing to find.
import { describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera } from 'three';
import type { FrameInfo, RenderRegistry } from '@/render';
import type { RenderApp } from '@/render/app';
import { makePose } from '@/render/camera';
import { makeTestSim } from '@/sim/testing';
import type { Sim } from '@/sim/types';
import { edgeView, lawnSpot, makeTitleSim, TitleHost, titlePose, titleSubject, TITLE_STILL_SETTLE_FRAMES } from './index';

function fakes(opts: { testMode: boolean; quality: string; reducedMotion?: boolean }) {
  const started: Sim[] = [];
  const resolvers: (() => void)[] = [];
  const registry = {
    onGameStart: vi.fn((s: Sim) => { started.push(s); return new Promise<void>((r) => { resolvers.push(r); }); }),
    update: vi.fn((_f: FrameInfo) => {}),
  } as unknown as RenderRegistry;
  const app = {
    quality: { id: opts.quality }, renderer: { domElement: { height: 720 } }, setFocus: vi.fn(), setOnDemand: vi.fn(), requestRender: vi.fn(),
  };
  const canvas = { clientWidth: 1280, clientHeight: 720 } as HTMLCanvasElement;
  const host = new TitleHost({
    registry: () => registry, app: () => app as unknown as RenderApp, camera: new PerspectiveCamera(), canvas, testMode: opts.testMode,
    reducedMotion: () => !!opts.reducedMotion,
  });
  return { host, started, resolvers, app, registry };
}

describe('TitleHost outside test mode', () => {
  it('still frame at Low: renders while the decor settles, then stops asking for frames', async () => {
    const f = fakes({ testMode: false, quality: 'low' });
    const ready = f.host.enter();
    f.resolvers[0]!();
    expect(await ready).toBe(true);
    f.app.requestRender.mockClear();
    const poses: number[] = [];
    for (let i = 0; i < TITLE_STILL_SETTLE_FRAMES + 30; i++) {
      const fr = f.host.frame(1 / 60)!;
      poses.push(fr.camera.position.x);
    }
    expect(f.app.requestRender).toHaveBeenCalledTimes(TITLE_STILL_SETTLE_FRAMES);
    expect(f.app.setOnDemand).toHaveBeenLastCalledWith(true);
    expect(new Set(poses).size).toBe(1); // no drift
  });

  it('drifts at Medium, with real time, and drops the on-demand override when a game starts', async () => {
    const f = fakes({ testMode: false, quality: 'medium' });
    const ready = f.host.enter();
    f.resolvers[0]!();
    await ready;
    const a = f.host.frame(1 / 60)!.camera.position.clone();
    for (let i = 0; i < 120; i++) f.host.frame(1 / 60);
    const b = f.host.frame(1 / 60)!.camera.position.clone();
    expect(a.distanceTo(b)).toBeGreaterThan(0);
    expect(f.app.setOnDemand).toHaveBeenLastCalledWith(null);
    f.host.leave();
    expect(f.app.setOnDemand).toHaveBeenLastCalledWith(null);
    expect(f.host.frame(1 / 60)).toBeNull();
  });

  it('a second enter() supersedes a pending first one (the first resolves false, the second is drawn)', async () => {
    const f = fakes({ testMode: true, quality: 'test' });
    const first = f.host.enter();
    const second = f.host.enter();
    f.resolvers[0]!();
    f.resolvers[1]!();
    expect(await first).toBe(false);
    expect(await second).toBe(true);
    expect(f.host.frame(0)!.sim).toBe(f.started[1]);
  });
});

describe('title camera over a long session', () => {
  it('stays inside the vignette and above its ground for an hour of drift', () => {
    const sim = makeTitleSim(), bu = sim.world.bu, S = sim.world.size, subject = titleSubject(sim);
    const ground = (x: number, z: number) => sim.field.height(x, z);
    const p = makePose();
    for (let t = 0; t < 3600; t += 0.7) {
      titlePose(subject, ground, bu, t, p);
      expect(p.pos.x).toBeGreaterThan(0);
      expect(p.pos.x).toBeLessThan(S);
      expect(p.pos.z).toBeGreaterThan(0);
      expect(p.pos.z).toBeLessThan(S);
      expect(sim.field.sampleXYZ(p.pos.x, p.pos.y, p.pos.z)).toBeGreaterThan(bu); // in free air, not inside a stone
    }
  });
});

describe('scenic read-outs with nothing to find', () => {
  it('lawnSpot is null without trees; edgeView still finds an outdoor edge on a plain lawn', () => {
    const sim = makeTestSim({ sizeBu: 256 });
    expect(lawnSpot(sim)).toBeNull();
    const v = edgeView(sim);
    expect(v).not.toBeNull();
    for (const k of ['x', 'y', 'z'] as const) { expect(Number.isFinite(v!.pos[k])).toBe(true); expect(Number.isFinite(v!.look[k])).toBe(true); }
  });
});
