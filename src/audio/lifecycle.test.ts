// Audio across the game's lifecycle and the review fixes that the reviewer's tests do not pin down: the world fades
// outside play (epitaph, title), a finished game is released, a hidden tab that keeps sound schedules ahead, the
// car's approach roll survives the pass, a reel mower swaps the engine warning out, an escalation into critical
// still sounds inside the 20 s cooldown, and the zone blend stays continuous on a coarse sample grid.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeTestSim } from '@/sim/testing/testWorld';
import type { Sim, SimEvent, WorldData } from '@/sim/types';
import { AlertSoundGate } from './alertGate';
import { AudioRuntime, type RuntimeFrame } from './runtime';
import { AudioSystem, type AudioFrame, type AudioSettingsShape } from './system';
import { asCtx, MockContext } from './testing/mockAudio';
import { zoneGroupWeights } from './zoneBlend';
import { newAmbienceInput } from './simAdapter';
import { AMBIENCE } from './tuning';

function settings(muteWhenHidden = true) {
  const s: AudioSettingsShape = {
    audio: { master: 1, ambience: 0.8, effects: 0.9, giants: 0.9, ui: 0.6, music: 0.5, muted: false, musicMode: 'off', distantVoices: false, muteWhenHidden, mono: false },
    gameplay: { milestoneNotices: 'full' },
  };
  return { get: () => s, subscribe: () => () => {} };
}

type VisListener = () => void;
function started(opts: { muteWhenHidden?: boolean } = {}) {
  const m = new MockContext();
  const handlers: Record<string, (e: Event) => void> = {};
  let onVis: VisListener | null = null;
  const vis = { hidden: false, addEventListener: (_t: 'visibilitychange', f: VisListener) => { onVis = f; }, removeEventListener: () => {} };
  const sys = new AudioSystem({
    assets: null, settings: settings(opts.muteWhenHidden ?? true), testMode: false,
    host: { create: () => asCtx(m), setTimer: () => {} },
    gestureTarget: { addEventListener: (t: string, f: (e: Event) => void) => { handlers[t] = f; }, removeEventListener: () => {} },
    visibility: vis,
  });
  handlers.pointerdown({ isTrusted: true } as Event);
  const setHidden = (h: boolean) => { vis.hidden = h; onVis?.(); };
  return { m, sys, setHidden };
}

const IDENTITY = { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] };
function frameAt(sim: Sim, pos: { x: number; y: number; z: number }, extra: Partial<AudioFrame> = {}): AudioFrame {
  return { dt: 0.3, sim, camera: { position: pos, matrixWorld: IDENTITY }, focus: pos, possessedId: -1, view: 'observer', underground: false, paused: false, hudHidden: false, ...extra };
}
const emit = (sim: Sim, e: SimEvent) => sim.events.emit(e.type as never, e as never);
const sim = makeTestSim({ nest: 'small', workers: 6 });
const surfacePos = () => { const c = sim.state.nests[0].chambers[0].center; return { x: c.x, y: sim.field.height(c.x, c.z) + 40, z: c.z }; };
const layerSum = (sys: AudioSystem) => Object.values((sys.debug() as { ambience: { layers: Record<string, number> } }).ambience.layers).reduce((a, b) => a + b, 0);

describe('audio lifecycle', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('outside play (epitaph, title) the world fades: ambience target silent, giant events stopped, UI still sounds', () => {
    const { m, sys } = started();
    sys.attachSim(sim);
    const p = surfacePos();
    sys.frame(frameAt(sim, p));
    emit(sim, { type: 'human.telegraph', instId: 3, kind: 'mowing', cue: 'sound', origin: { x: p.x + 400, y: p.y, z: p.z }, radiusMm: 2000, intensity: 1, impactTick: sim.state.tick + 30 });
    sys.frame(frameAt(sim, p, { dt: 0 }));
    expect(layerSum(sys)).toBeGreaterThan(0);
    expect((sys.debug() as { giants: string[] }).giants.length).toBe(1);
    const rt = sys.runtime!;
    for (let i = 0; i < 4; i++) { m.currentTime += 0.3; sys.idle(0.3); } // the game is in 'epitaph': no frame() any more
    expect((sys.debug() as { giants: string[] }).giants).toEqual([]);
    const amb = rt.ambience.last!;
    expect(Object.values(amb.layers).every((g) => g === 0)).toBe(true);
    sys.ui('click');
    expect(sys.cueLog().at(-1)).toMatchObject({ cue: 'ui.click' });
    sys.dispose();
  });

  it('detachSim releases the listener probes of the finished world', () => {
    const { sys } = started();
    sys.attachSim(sim);
    sys.frame(frameAt(sim, surfacePos()));
    expect(sys.runtime!.listener.groundAt).not.toBeNull();
    sys.detachSim();
    expect(sys.runtime!.listener.groundAt).toBeNull();
    expect(sys.runtime!.listener.solidBetween).toBeNull();
    sys.dispose();
  });

  it('hidden with "Mute when hidden" off: loops and grains are scheduled through to the suspension', () => {
    vi.useFakeTimers();
    const { sys, setHidden } = started({ muteWhenHidden: false });
    sys.attachSim(sim);
    sys.frame(frameAt(sim, surfacePos()));
    const horizons: number[] = [];
    const rt = sys.runtime!;
    const orig = rt.update.bind(rt);
    rt.update = (dt: number, f: RuntimeFrame, h?: number) => { horizons.push(h ?? 0.25); orig(dt, f, h); };
    setHidden(true);
    expect(Math.max(...horizons)).toBeGreaterThan(5);
    sys.dispose();
  });

  it('hidden with "Mute when hidden" on: no extra scheduling (the master fades instead)', () => {
    vi.useFakeTimers();
    const { sys, setHidden } = started({ muteWhenHidden: true });
    sys.attachSim(sim);
    sys.frame(frameAt(sim, surfacePos()));
    const rt = sys.runtime!;
    let calls = 0;
    const orig = rt.update.bind(rt);
    rt.update = (dt: number, f: RuntimeFrame, h?: number) => { calls++; orig(dt, f, h); };
    setHidden(true);
    expect(calls).toBe(0);
    sys.dispose();
  });
});

describe('giant sounds (GDD 08 §13.6)', () => {
  const frame: RuntimeFrame = { ambience: null, paused: false, criticalActive: false, calmS: 0, season: 'summer', combat: false, musicMode: 'off' };

  it('car: the pass does not cut the warning-phase approach roll off', () => {
    const m = new MockContext();
    const rt = new AudioRuntime(asCtx(m), { bytes: null, seed: 3 });
    rt.giants.telegraph(1, 'car', { x: 400, y: 0, z: 0 }, 3);
    const stolenBefore = rt.cues.voices.stats.stolen;
    rt.giants.start(1, 'car', null);
    rt.update(0.016, frame);
    expect(rt.cues.voices.stats.stolen).toBe(stolenBefore);
    const keys = rt.log.list().map((e) => e.cue);
    expect(keys).toContain('giant.car.approach');
    expect(rt.log.list().filter((e) => e.source === 'refused')).toEqual([]);
  });

  it('reel mower: the engine warning loop is replaced by the reel loop at the start', () => {
    const m = new MockContext();
    const rt = new AudioRuntime(asCtx(m), { bytes: null, seed: 3 });
    rt.giants.telegraph(2, 'mowing', { x: 400, y: 0, z: 0 }, 3);
    rt.giants.start(2, 'mowing', 'reel');
    const loops = rt.log.list().filter((e) => e.cue === 'giant.mowing.loop').map((e) => e.source);
    expect(loops).toEqual(['synth:engine', 'synth:reel-whirr']);
    rt.giants.telegraph(3, 'mowing', { x: 400, y: 0, z: 0 }, 3);
    rt.giants.start(3, 'mowing', 'motor');
    expect(rt.log.list().filter((e) => e.cue === 'giant.mowing.loop')).toHaveLength(3); // the motor keeps its loop
  });
});

describe('alert sound gate (GDD 08 §6.3)', () => {
  it('an escalation into critical sounds even inside the 20 s cooldown; a notice re-raise does not', () => {
    const g = new AlertSoundGate();
    const k = { kind: 'queen-in-danger', subjectId: 1 };
    expect(g.decide({ op: 'raise', ...k, level: 'warning' }, 0, 0, false)).toBe('warning');
    expect(g.decide({ op: 'update', ...k, level: 'critical' }, 3, 30, false)).toBe('critical');
    const n = { kind: 'food-c-low', subjectId: 1 };
    expect(g.decide({ op: 'raise', ...n, level: 'notice' }, 0, 0, false)).toBe('notice');
    expect(g.decide({ op: 'clear', ...n, level: 'notice' }, 1, 10, false)).toBeNull();
    expect(g.decide({ op: 'raise', ...n, level: 'notice' }, 10, 10_000, false)).toBeNull(); // game-hour cooldown passed, real 20 s not
    expect(g.decide({ op: 'clear', ...n, level: 'notice' }, 11, 10_001, false)).toBeNull();
    expect(g.decide({ op: 'raise', ...n, level: 'notice' }, 25, 20_000, false)).toBe('notice');
  });
});

describe('zone blend (GDD 08 §13.4)', () => {
  /** A forest | interior border on a fine raster: the coarse sample grid takes over. */
  function world(cell: number, nx: number): WorldData {
    const data = new Uint8Array(nx * nx);
    for (let iz = 0; iz < nx; iz++) for (let ix = 0; ix < nx; ix++) data[iz * nx + ix] = ix < nx / 2 ? 0 : 1;
    return { ...sim.world, maps: { ...sim.world.maps, zone: { cell, nx, nz: nx, data } }, zones: [{ id: 0, type: 'forest' }, { id: 1, type: 'interior' }] } as unknown as WorldData;
  }

  it('a fine raster (more cells than samples) still gives a near-linear 32 BU ramp', () => {
    const bu = sim.world.bu, cell = 0.5 * bu, nx = 1000;
    const w = world(cell, nx);
    const border = (nx / 2) * cell, width = AMBIENCE.zoneCrossfadeBu * bu;
    const out = newAmbienceInput().groups;
    let prev = -1, maxJump = 0;
    for (let x = border - 20 * bu; x <= border + 20 * bu; x += 0.25 * bu) {
      const v = zoneGroupWeights(w, x, 100 * cell, width, out).interior;
      const linear = Math.min(1, Math.max(0, (x - (border - width / 2)) / width));
      expect(Math.abs(v - linear)).toBeLessThanOrEqual(1 / AMBIENCE.zoneBlendMaxSamples + 1e-9);
      if (prev >= 0) maxJump = Math.max(maxJump, Math.abs(v - prev));
      prev = v;
    }
    expect(maxJump).toBeLessThanOrEqual(1 / AMBIENCE.zoneBlendMaxSamples + 1e-9);
  });

  it('inside one zone the weight is exactly that group', () => {
    const w = world(4 * sim.world.bu, 200);
    const out = newAmbienceInput().groups;
    zoneGroupWeights(w, 10 * 4 * sim.world.bu, 50 * 4 * sim.world.bu, 32 * sim.world.bu, out);
    expect(out.woodland).toBe(1);
    expect(out.interior).toBe(0);
  });
});
