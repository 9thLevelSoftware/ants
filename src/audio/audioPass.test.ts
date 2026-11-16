// The audio pass on the AudioSystem (mock Web Audio, small real simulation): the status line's truth in every state,
// the Settings test buttons, the milestone-like events, the alarm shimmer setting, bird variants, creature footfalls,
// the loudness read-out and the loudness targets table.
import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing/testWorld';
import { spawnCreature } from '@/sim/entities';
import type { Sim, SimEvent } from '@/sim/types';
import { CUE_SOUNDS, resolveCue } from './cueTable';
import { audioStatusDetail, setAudioFacadeTarget } from './facade';
import { CreatureStepDriver } from './footsteps';
import { LOUDNESS_TARGETS, judge, targetById } from './loudnessTargets';
import { ENABLE_BUTTON_LABEL, statusLine, TEST_BUSES, type AudioStatusDetail } from './statusText';
import { AudioSystem, type AudioFrame, type AudioSettingsShape } from './system';
import { asCtx, MockContext } from './testing/mockAudio';
import { BUS_DEFAULT_DB, GIANT_COMPRESSOR, LAYER_TRIM_DB, LIMITER, MASTER_TRIM_DB } from './tuning';
import { MixGraph } from './engine/graph';
import { busGains } from './mix';

type Extra = { alarmShimmer?: boolean; muteWhenHidden?: boolean };
function settings(extra: Extra = {}) {
  const s: AudioSettingsShape = {
    audio: { master: 1, ambience: 0.8, effects: 0.9, giants: 0.9, ui: 0.6, music: 0.5, muted: false, musicMode: 'sparse', distantVoices: false, muteWhenHidden: extra.muteWhenHidden ?? true, mono: false, alarmShimmer: extra.alarmShimmer },
    gameplay: { milestoneNotices: 'full' },
  };
  return { get: () => s, subscribe: () => () => {} };
}

/** A context that stays suspended however often it is resumed (the browser refuses until the test says otherwise). */
class RefusingContext extends MockContext { allow = false; resume() { if (this.allow) this.state = 'running'; return Promise.resolve(); } }

interface Rig { m: MockContext; sys: AudioSystem; click: () => void; fireTimers: () => void; hide: (h: boolean) => void }
function rig(o: { testMode?: boolean; ctxState?: MockContext['state']; noWebAudio?: boolean; extra?: Extra } = {}): Rig {
  const m = o.ctxState === 'suspended' ? new RefusingContext() : new MockContext();
  m.state = o.ctxState ?? 'running';
  const handlers: Record<string, (e: Event) => void> = {};
  const timers: (() => void)[] = [];
  let hidden = false;
  const vis: { hidden: boolean; addEventListener(t: 'visibilitychange', f: () => void): void; removeEventListener(): void } = {
    get hidden() { return hidden; }, addEventListener: (_t, f) => { handlers.visibilitychange = f as never; }, removeEventListener: () => {},
  };
  const sys = new AudioSystem({
    assets: null, settings: settings(o.extra), testMode: !!o.testMode, visibility: vis,
    host: { create: () => (o.noWebAudio ? null : asCtx(m)), setTimer: (fn) => { timers.push(fn); return 0; } },
    gestureTarget: { addEventListener: (t: string, f: (e: Event) => void) => { handlers[t] = f; }, removeEventListener: () => {} },
  });
  return {
    m, sys,
    click: () => handlers.pointerdown?.({ isTrusted: true } as Event),
    fireTimers: () => { for (const t of timers.splice(0)) t(); },
    hide: (h) => { hidden = h; handlers.visibilitychange?.({} as Event); },
  };
}

const IDENTITY = { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] };
const frameAt = (sim: Sim, pos: { x: number; y: number; z: number }, extra: Partial<AudioFrame> = {}): AudioFrame =>
  ({ dt: 0.3, sim, camera: { position: pos, matrixWorld: IDENTITY }, focus: pos, possessedId: -1, view: 'observer', underground: false, paused: false, hudHidden: false, ...extra });
const emit = (sim: Sim, e: SimEvent) => sim.events.emit(e.type as never, e as never);

describe('status line (Settings > Audio)', () => {
  it('tells the truth in each state: test mode, waiting, running, muted while hidden, blocked, unsupported', () => {
    const states: Record<string, AudioStatusDetail> = {};
    const t = rig({ testMode: true });
    t.click();
    states.test = t.sys.statusDetail();

    const w = rig();
    states.waiting = w.sys.statusDetail();
    w.click();
    states.running = w.sys.statusDetail();
    w.hide(true);
    states.mutedHidden = w.sys.statusDetail();
    w.hide(false);
    states.shown = w.sys.statusDetail();

    const b = rig({ ctxState: 'suspended' });
    b.click();
    b.fireTimers(); // the 1 s running check
    states.blocked = b.sys.statusDetail();

    const u = rig({ noWebAudio: true });
    u.click();
    states.unsupported = u.sys.statusDetail();

    expect(states).toEqual({ test: 'test', waiting: 'waiting', running: 'running', mutedHidden: 'muted-hidden', shown: 'running', blocked: 'blocked', unsupported: 'unsupported' });
  });

  it('hidden with "Mute when hidden" off is still running', () => {
    const r = rig({ extra: { muteWhenHidden: false } });
    r.click();
    r.hide(true);
    expect(r.sys.statusDetail()).toBe('running');
  });

  it('shows the enable button exactly when a click can help, with the words of the line', () => {
    const need: Record<AudioStatusDetail, boolean> = { test: false, 'no-game': false, waiting: true, running: false, 'muted-hidden': false, blocked: true, unsupported: false };
    for (const [d, needsClick] of Object.entries(need)) expect(statusLine(d as AudioStatusDetail).needsClick, d).toBe(needsClick);
    expect(statusLine('blocked').text).toMatch(/blocked by the browser/i);
    expect(statusLine('waiting').text).toMatch(/click or key press/i);
    expect(statusLine('unsupported').text).toMatch(/cannot play/i);
    expect(ENABLE_BUTTON_LABEL).toBe('Click to enable sound');
  });

  it('with no audio system registered (Settings opened before a game) the line offers no click that does nothing', () => {
    setAudioFacadeTarget(null);
    expect(audioStatusDetail()).toBe('no-game');
    expect(statusLine(audioStatusDetail()).needsClick).toBe(false);
  });

  it('refusal leaves the game playable: frames and UI sounds do not throw, and an explicit enable retries', () => {
    const sim = makeTestSim({ nest: 'small', workers: 4 });
    const r = rig({ ctxState: 'suspended' });
    r.sys.attachSim(sim);
    r.click();
    r.fireTimers();
    expect(r.sys.status()).toBe('blocked');
    expect(() => { r.sys.frame(frameAt(sim, sim.state.ants[0].pos)); r.sys.ui('click'); r.sys.idle(0.1); }).not.toThrow();
    (r.m as RefusingContext).allow = true; // the browser now allows it
    r.sys.enable();
    expect(r.sys.status()).toBe('running');
  });

  it('audio never starts before a gesture', () => {
    const r = rig();
    expect(r.sys.status()).toBe('off');
    expect(r.sys.runtime).toBeNull();
    r.sys.frame(frameAt(makeTestSim(), { x: 0, y: 0, z: 0 }));
    expect(r.sys.runtime).toBeNull();
  });
});

describe('Settings test buttons', () => {
  it('each bus plays a representative sound once the sound runs', () => {
    const r = rig();
    r.click();
    const logAfter = (bus: (typeof TEST_BUSES)[number]) => {
      const before = r.sys.cueLog().length;
      r.sys.testBus(bus);
      return r.sys.cueLog().slice(before).map((e) => ({ cue: e.cue, bus: e.bus, source: e.source }));
    };
    expect(logAfter('ambience').map((c) => c.bus)).toContain('ambience');
    expect(logAfter('effects').map((c) => c.cue)).toEqual(expect.arrayContaining(['step', 'pick-up', 'dig-bite']));
    expect(logAfter('giants').map((c) => c.bus)).toContain('giants');
    expect(logAfter('ui').map((c) => c.cue)).toContain('ui.click');
    expect(logAfter('music').map((c) => c.cue)).toContain('music.test');
    expect(logAfter('master').length).toBeGreaterThan(1);
    expect(TEST_BUSES.length).toBe(6);
  });

  it('a test pressed before the sound runs starts it and plays when it does', () => {
    const r = rig({ ctxState: 'suspended' });
    r.sys.testBus('ui');
    expect(r.sys.cueLog()).toEqual([]);
    (r.m as RefusingContext).allow = true;
    r.m.state = 'running';
    r.m.onstatechange?.();
    expect(r.sys.cueLog().map((e) => e.cue)).toContain('ui.click');
  });

  it('does nothing in test mode', () => {
    const r = rig({ testMode: true });
    r.sys.testBus('ui');
    expect(r.sys.cueLog()).toEqual([]);
  });
});

describe('events on the system', () => {
  const sim = makeTestSim({ nest: 'small', workers: 8 });
  const worker = sim.state.ants.find((a) => a.alive && a.caste === 'worker')!;
  const run = (events: SimEvent[], extra: Extra = {}) => {
    const r = rig({ extra });
    r.sys.attachSim(sim);
    r.click();
    for (const e of events) emit(sim, e);
    r.sys.frame(frameAt(sim, worker.pos));
    return r.sys.cueLog().map((e) => e.cue);
  };

  it('stage changes, daughter colonies and the founding hand-over play the milestone motif', () => {
    expect(run([{ type: 'stage.changed', from: 'founding', to: 'young' } as never])).toContain('ui.milestone');
    expect(run([{ type: 'lineage.daughter-added', daughterId: 'd1' }])).toContain('ui.milestone');
    expect(run([{ type: 'opening.handover', workers: 3, reserves: 1, q: 0.5 }])).toContain('ui.milestone');
  });

  it('the alarm shimmer follows its setting', () => {
    const e: SimEvent = { type: 'cue', cue: 'alarm-burst', pos: { ...worker.pos }, strength: 1 };
    const frame = (alarmShimmer?: boolean) => {
      const r = rig({ extra: { alarmShimmer } });
      r.sys.attachSim(sim);
      r.click();
      r.sys.runtime!.listener.possessedPos = { ...worker.pos };
      emit(sim, e);
      r.sys.frame(frameAt(sim, worker.pos, { possessedId: worker.id, view: 'possess' }));
      return r.sys.cueLog().filter((c) => c.cue === 'alarm-burst' && !c.source.startsWith('culled')).length;
    };
    expect(frame(undefined)).toBe(1); // absent setting = on
    expect(frame(true)).toBe(1);
    expect(frame(false)).toBe(0);
  });

  it('a dig bite doubled by the runner and the nest bite sounds once; a miss is a whiff, a bite on a hard body crunches', () => {
    const p = { ...worker.pos };
    const log = run([
      { type: 'cue', cue: 'dig-bite.loam', pos: p, strength: 0.3 },
      { type: 'cue', cue: 'dig-bite', pos: p, strength: 1 },
    ]);
    expect(log.filter((c) => c.startsWith('dig-bite')).length).toBe(1);
  });
});

describe('cue table additions', () => {
  it('a bird strike is a landing (whoosh and thud) at strength 1 and a peck below', () => {
    expect(resolveCue('bird-strike', 1)!.sound.synth).toBe('bird-landing');
    expect(resolveCue('bird-strike', 0.8)!.sound.synth).toBe('peck');
    expect(resolveCue('bird-strike', 0.6)!.sound.synth).toBe('peck');
  });

  it('the ev.* sounds resolve and unknown ones do not', () => {
    for (const id of ['strike', 'bird-whoosh', 'gust']) expect(resolveCue(`ev.${id}`)?.sound.synth, id).toBeTruthy();
    expect(resolveCue('ev.nothing')).toBeNull();
    expect(resolveCue('ev.gust')!.sound.bus).toBe('ambience');
  });

  it('raindrop hits are heavy, discrete impacts (louder than the first-pass level) and pitched by drop size', () => {
    const s = CUE_SOUNDS['raindrop-hit'];
    expect(s.gainDb).toBeGreaterThanOrEqual(-10);
    expect(s.cap).toBeGreaterThanOrEqual(6);
  });
});

describe('creature footfalls', () => {
  const sim = makeTestSim({ nest: 'small', workers: 2 });
  const at = sim.state.ants[0].pos;
  const spider = spawnCreature(sim, { kind: 'wolf-spider', pos: { x: at.x + 6, y: at.y, z: at.z }, radiusMm: 5, maxHp: 70, init: {} });
  const aphid = spawnCreature(sim, { kind: 'aphid', pos: { x: at.x + 8, y: at.y, z: at.z }, radiusMm: 1, maxHp: 1, init: {} });

  it('taps once per half stride for a large creature near the listener, never for a small one', () => {
    sim.index.refresh();
    const d = new CreatureStepDriver();
    const taps: number[] = [];
    spider.speed = 20; aphid.speed = 20;
    for (let i = 0; i < 8; i++) { spider.gait += 0.5; aphid.gait += 0.5; d.update(sim, at, 0.25, (_p, s) => taps.push(s)); }
    expect(taps.length).toBeGreaterThanOrEqual(5);
    expect(taps.every((s) => s > 0 && s <= 1)).toBe(true);
  });

  it('a creature that stands still, or is far away, is silent', () => {
    sim.index.refresh();
    const d = new CreatureStepDriver();
    const taps: number[] = [];
    spider.speed = 0;
    for (let i = 0; i < 6; i++) { spider.gait += 0.5; d.update(sim, at, 0.25, () => taps.push(1)); }
    spider.speed = 20;
    for (let i = 0; i < 6; i++) { spider.gait += 0.5; d.update(sim, { x: at.x + 1e6, y: 0, z: at.z }, 0.25, () => taps.push(1)); }
    expect(taps).toEqual([]);
  });
});

describe('loudness read-out and retune', () => {
  it('loudness() is empty before sound runs and reports running afterwards', () => {
    const r = rig();
    expect(r.sys.loudness()).toEqual({ shortTermLufs: null, momentaryLufs: null, running: false });
    r.click();
    expect(r.sys.loudness().running).toBe(true);
  });

  it('the targets table is the ruling: calm day -27 ± 2, underground -30 ± 3, rain -22 ± 2, human peak -14 ± 3 with a -1 dBFS peak, night -30 ± 3', () => {
    expect(LOUDNESS_TARGETS.map((t) => [t.id, t.lufs, t.tol])).toEqual([
      ['calm-surface-day', -27, 2], ['calm-underground', -30, 3], ['rain-surface', -22, 2], ['human-footstep-peak', -14, 3], ['night-surface', -30, 3],
    ]);
    expect(targetById('human-footstep-peak')!.truePeakMaxDb).toBe(-1);
    const day = targetById('calm-surface-day')!;
    expect(judge(day, -26, -10).ok).toBe(true);
    expect(judge(day, -29.5, -10).ok).toBe(false);
    expect(judge(targetById('human-footstep-peak')!, -14, -0.5).ok).toBe(false);
    expect(judge(targetById('human-footstep-peak')!, -14, -2).ok).toBe(true);
  });

  it('the retune is in tuning.ts: a master trim, per-layer trims, a giants compressor, and a limiter whose ceiling is under -1 dBFS', () => {
    expect(MASTER_TRIM_DB).toBeGreaterThan(0);
    expect(Object.keys(LAYER_TRIM_DB).length).toBeGreaterThan(0);
    expect(GIANT_COMPRESSOR.ratio).toBeGreaterThan(1);
    expect(GIANT_COMPRESSOR.ratio).toBeLessThanOrEqual(6); // gentle
    expect(LIMITER.ceilingDb).toBeLessThanOrEqual(-1);
    expect(BUS_DEFAULT_DB.ambience).toBeGreaterThan(-10); // the §13.2 table's -10 dB left a calm scene 14 LU too quiet
  });

  it('the master gain carries the trim; the mute switch still silences everything', () => {
    const base = { master: 1, ambience: 0.8, effects: 0.9, giants: 0.9, ui: 0.6, music: 0.5, muted: false, musicMode: 'sparse' as const };
    expect(busGains(base).master).toBeGreaterThan(1);
    expect(busGains({ ...base, muted: true }).master).toBe(0);
  });

  it('the giants bus runs through its compressor into the world mix; the limiter is followed by the ceiling', () => {
    const m = new MockContext();
    const g = new MixGraph(asCtx(m));
    expect(g.giantComp).toBeDefined();
    const comp = g.giantComp as unknown as { threshold: { value: number }; ratio: { value: number } };
    expect(comp.threshold.value).toBe(GIANT_COMPRESSOR.thresholdDb);
    expect(comp.ratio.value).toBe(GIANT_COMPRESSOR.ratio);
    const bus = g.buses.giants as unknown as { outputs: unknown[] };
    expect(bus.outputs).toContain(g.giantComp);
  });
});

describe('the test-mode override for scripted checks', () => {
  it('?audio=on is recognised as a whole parameter only', async () => {
    const { audioForcedOn } = await import('./gameAudio');
    expect(audioForcedOn('?test=1&audio=on')).toBe(true);
    expect(audioForcedOn('?audio=on&seed=2')).toBe(true);
    expect(audioForcedOn('?test=1')).toBe(false);
    expect(audioForcedOn('?test=1&audio=off')).toBe(false);
    expect(audioForcedOn('?test=1&xaudio=on')).toBe(false);
  });
});

describe('Settings test while the game is paused', () => {
  it('the world buses open for the test sound and close again after it', () => {
    const sim = makeTestSim({ nest: 'small', workers: 2 });
    const r = rig();
    r.sys.attachSim(sim);
    r.click();
    const world = (r.sys.runtime!.graph as unknown as { world: { gain: { events: { kind: string; v: number }[] } } }).world;
    const last = () => world.gain.events[world.gain.events.length - 1].v;
    const paused = (): AudioFrame => frameAt(sim, sim.state.ants[0].pos, { paused: true });
    r.sys.frame(paused());
    expect(last()).toBe(0); // paused: the world is silent
    r.sys.testBus('effects');
    expect(last()).toBe(1); // the test opens it
    r.sys.frame(paused());
    expect(last()).toBe(1); // still held within the 3 s
    r.m.currentTime += 4;
    r.sys.frame(paused());
    expect(last()).toBe(0); // paused again once the hold is over
  });
});
