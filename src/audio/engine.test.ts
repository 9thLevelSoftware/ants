// Engine on a mock Web Audio context: every synth recipe and bed builds a valid graph, the gesture rule and refusal
// handling, voice limiting under a burst, ambience channels, giants ducking, buffers LRU and missing-file fallback.
import { describe, expect, it } from 'vitest';
import { CUE_IDS } from '@/sim/types/ids/progression';
import { HUMAN_EVENT_KINDS } from '@/sim/types/ids';
import { asCtx, MockContext, MockGain, reaches } from './testing/mockAudio';
import { SynthKit } from './synth/kit';
import { RECIPES } from './synth/recipes';
import { SYNTH_BEDS, SYNTH_ONESHOTS } from './synth/ids';
import { BEDS } from './synth/beds';
import { ContextManager, type ContextHost } from './context';
import { AudioRuntime, type RuntimeFrame } from './runtime';
import { AudioSystem, type AudioSettingsShape } from './system';
import { newAmbienceInput } from './simAdapter';
import { BufferBank } from './engine/buffers';
import { ALL_BED_IDS } from './assetIds';
import { AUDIO_MAX_VOICES } from './tuning';
import { soundForControl } from './uiDelegation';

function kit() {
  const m = new MockContext();
  return { m, k: new SynthKit(asCtx(m), 7) };
}

describe('synthesised sounds (GDD 08 §13.7)', () => {
  it('every one-shot recipe builds a connected, finite, self-stopping graph', () => {
    for (const id of SYNTH_ONESHOTS) {
      const { m, k } = kit();
      const out = new MockGain(m);
      const d = RECIPES[id](k, out as unknown as AudioNode, 0.5, { gain: 0.5, rate: 1, strength: 0.7, durS: 3 });
      expect(Number.isFinite(d) && d > 0, `${id} duration ${d}`).toBe(true);
      const srcs = m.sources();
      expect(srcs.length, id).toBeGreaterThan(0);
      for (const s of srcs) {
        expect(s.startAt, id).toBeGreaterThanOrEqual(0.5);
        expect(Number.isFinite(s.stopAt) || (s.duration !== undefined), `${id}: a source never stops`).toBe(true);
      }
      expect(srcs.some((s) => reaches(s, out)), `${id} not connected to its output`).toBe(true);
    }
  });
  it('every bed builds and stops all its sources', () => {
    for (const id of SYNTH_BEDS) {
      const { m, k } = kit();
      const h = BEDS[id](k, 0);
      expect(m.sources().some((s) => reaches(s, h.output as unknown as MockGain)), id).toBe(true);
      h.stop(5);
      for (const s of m.sources()) expect(s.stopAt, id).toBeLessThanOrEqual(5);
    }
  });
});

function host(m: MockContext | null, opts: { throws?: boolean } = {}) {
  const timers: (() => void)[] = [];
  let created = 0;
  const h: ContextHost = {
    create: () => { created++; if (opts.throws) throw new Error('refused'); return m ? asCtx(m) : null; },
    setTimer: (fn) => { timers.push(fn); },
  };
  return { h, timers, created: () => created };
}

describe('gesture rule and refusal (GDD 08 §13.1, App. E 15)', () => {
  it('no context before a gesture; running after one', () => {
    const m = new MockContext();
    const { h, created } = host(m);
    let ran = 0;
    const c = new ContextManager(h, () => ran++);
    expect(c.status).toBe('off');
    expect(created()).toBe(0);
    c.gesture();
    expect(c.status).toBe('running');
    expect(ran).toBe(1);
    c.gesture();
    expect(created()).toBe(1);
  });
  it('a context that stays suspended is blocked; 3 gesture retries, then only enable()', () => {
    const m = new MockContext();
    m.resume = () => Promise.resolve(); // the browser ignores resume
    m.state = 'suspended';
    const { h, timers } = host(m);
    const c = new ContextManager(h, () => {});
    for (let i = 0; i < 4; i++) { c.gesture(); timers.shift()?.(); }
    expect(c.status).toBe('blocked');
    c.gesture();
    expect(timers.length).toBe(0); // gave up after 3 retries
    m.state = 'running';
    c.enable();
    expect(c.status).toBe('running');
  });
  it('missing Web Audio = unsupported; a throwing constructor = blocked, never an exception', () => {
    const c = new ContextManager(host(null).h, () => {});
    expect(() => c.gesture()).not.toThrow();
    expect(c.status).toBe('unsupported');
    const d = new ContextManager(host(new MockContext(), { throws: true }).h, () => {});
    expect(() => d.gesture()).not.toThrow();
    expect(d.status).toBe('blocked');
  });
  it('test mode never constructs a context, whatever happens', () => {
    const m = new MockContext();
    const { h, created } = host(m);
    const listeners: Record<string, (e: Event) => void> = {};
    const sys = new AudioSystem({
      assets: null, settings: settingsSource(), testMode: true, host: h,
      gestureTarget: { addEventListener: (t: string, f: (e: Event) => void) => { listeners[t] = f; }, removeEventListener: () => {} },
    });
    listeners.pointerdown?.({ isTrusted: true } as Event);
    sys.enable();
    sys.ui('click');
    expect(created()).toBe(0);
    expect(sys.status()).toBe('off');
  });
  it('a gesture starts the system; status running; UI sounds log', () => {
    const m = new MockContext();
    const { h } = host(m);
    const listeners: Record<string, (e: Event) => void> = {};
    const sys = new AudioSystem({
      assets: null, settings: settingsSource(), testMode: false, host: h,
      gestureTarget: { addEventListener: (t: string, f: (e: Event) => void) => { listeners[t] = f; }, removeEventListener: () => {} },
    });
    expect(sys.status()).toBe('off');
    listeners.keydown({ isTrusted: true } as Event);
    expect(sys.status()).toBe('running');
    sys.ui('click');
    expect(sys.cueLog().at(-1)?.cue).toBe('ui.click');
    expect(sys.cueLog().at(-1)?.source).toBe('synth:ui-click'); // no asset source: synth fallback
    sys.dispose();
  });
});

function settingsSource() {
  const s: AudioSettingsShape = {
    audio: { master: 1, ambience: 0.8, effects: 0.9, giants: 0.9, ui: 0.6, music: 0.5, muted: false, musicMode: 'sparse', distantVoices: false, muteWhenHidden: true, mono: false },
    gameplay: { milestoneNotices: 'full' },
  };
  return { get: () => s, subscribe: () => () => {} };
}

function runtime() {
  const m = new MockContext();
  const rt = new AudioRuntime(asCtx(m), { bytes: null, seed: 3 });
  const frame: RuntimeFrame = { ambience: newAmbienceInput(), paused: false, criticalActive: false, calmS: 0, season: 'summer', combat: false, musicMode: 'off' };
  return { m, rt, frame };
}

describe('runtime', () => {
  it('every simulation cue id reaches the log (played, silent or culled), none unknown', () => {
    const { rt } = runtime();
    for (const id of CUE_IDS) rt.cues.cue(id, { x: 1, y: 0, z: 0 }, 1);
    const log = rt.log.list();
    const byCue = new Map(log.map((e) => [e.cue, e.source]));
    for (const id of CUE_IDS) {
      if (id === 'alarm-burst') continue; // only inside the possessed ant's plume
      const key = id === 'dig-bite' ? 'dig-bite' : id;
      expect(byCue.has(key) || log.length >= 50, id).toBe(true);
      expect(byCue.get(key), id).not.toBe('unknown');
    }
    expect(byCue.get('death')).toBe('silent');
  });
  it('voice limit holds under a burst of 60 cues; distant foley is culled', () => {
    const { m, rt } = runtime();
    for (let i = 0; i < 60; i++) rt.cues.cue(CUE_IDS[i % 20], { x: i * 0.5, y: 0, z: 0 }, 1);
    expect(rt.cues.voices.active).toBeLessThanOrEqual(AUDIO_MAX_VOICES);
    rt.cues.cue('bite', { x: 4 * 41, y: 0, z: 0 }, 1); // bu 4 -> 41 BU > 40 BU max
    expect(rt.log.list().at(-1)?.source).toBe('culled');
    m.currentTime = 10;
    rt.cues.update(0.2);
    expect(rt.cues.voices.active).toBe(0);
  });
  it('crowd: a flood of steps keeps few single voices and schedules a patter texture', () => {
    const { m, rt } = runtime();
    const before = m.sources().length;
    for (let i = 0; i < 100; i++) rt.cues.cue('step', { x: 0, y: 0, z: 0 }, 1, 'loam');
    const single = rt.log.list().filter((e) => e.cue === 'step').length;
    expect(single).toBeLessThanOrEqual(4);
    rt.cues.update(0.5);
    expect(m.sources().length - before).toBeGreaterThan(single * 2);
  });
  it('ambience opens channels for audible layers and follows the depth filter', () => {
    const { rt, frame } = runtime();
    frame.ambience!.groups = { 'woodland': 1, 'open-green': 0, 'hard': 0, 'play': 0, 'interior': 0 };
    frame.ambience!.hour = 13;
    rt.update(0, frame);
    const src = rt.ambience.sources();
    expect(Object.keys(src)).toEqual(expect.arrayContaining(['birds', 'wind', 'leaf-rustle']));
    expect(src['leaf-rustle']).toBe('synth:leaf-rustle');
    frame.ambience!.underground = true;
    frame.ambience!.depthBu = 12;
    rt.update(0, frame);
    expect(rt.ambience.surfaceFilter().cutoffHz).toBeCloseTo(1500, 6);
    expect(rt.ambience.surfaceFilter().gainDb).toBeCloseTo(-18, 9);
    expect(Object.keys(rt.ambience.sources())).toContain('rumble');
  });
  it('giants: every human event kind starts and ends cleanly; ambience ducks while one runs', () => {
    const { m, rt, frame } = runtime();
    let id = 1;
    for (const kind of HUMAN_EVENT_KINDS) {
      rt.giants.telegraph(id, kind, { x: 400, y: 0, z: 0 }, 3);
      rt.giants.start(id, kind, null);
      rt.giants.impact(id, kind, { x: 400, y: 0, z: 0 });
      m.currentTime += 1;
      rt.update(1, frame);
      expect(rt.giants.active, kind).toBe(true);
      expect(rt.graph.ducking.giant, kind).toBe(true);
      rt.giants.end(id++);
    }
    m.currentTime += 20;
    rt.update(1, frame);
    expect(rt.giants.active).toBe(false);
    expect(rt.graph.ducking.giant).toBe(false);
    rt.giants.thunder(2, 0.8);
    expect(rt.log.list().at(-1)?.cue).toBe('thunder');
  });
  it('music: sparse phrases only after the gap and on a trigger; never while blocked', () => {
    const { m, rt, frame } = runtime();
    frame.musicMode = 'sparse';
    frame.calmS = 0;
    rt.update(0.016, frame);
    expect(rt.musicPlaying).toBe(false);
    m.currentTime = 400;
    frame.combat = true;
    rt.musicTrigger('dawn');
    rt.update(0.016, frame);
    expect(rt.musicPlaying).toBe(false);
    frame.combat = false;
    rt.update(0.016, frame);
    expect(rt.log.list().at(-1)?.cue).toBe('music.dawn');
  });
});

describe('buffers (GDD 08 §13.1)', () => {
  it('keeps at most 4 decoded beds (LRU, never one in use) and marks failures missing', async () => {
    const m = new MockContext();
    const bytes = { audioData: (id: string) => Promise.resolve(new ArrayBuffer(id.includes('rain_heavy') ? 0 : 100)) };
    const beds = new Set<string>(ALL_BED_IDS);
    const bank = new BufferBank(asCtx(m), bytes, (id) => beds.has(id));
    for (const id of ALL_BED_IDS) await bank.load(id);
    expect(bank.isMissing('audio/ambience/rain_heavy')).toBe(true);
    bank.trimBeds(new Set(['audio/ambience/birdsong_day']));
    const resident = ALL_BED_IDS.filter((id) => bank.get(id));
    expect(resident.length).toBe(4);
    expect(resident).toContain('audio/ambience/birdsong_day');
  });
});

describe('UI delegation', () => {
  const el = (attrs: Record<string, string>, cls: string[] = []) => ({
    tagName: 'BUTTON', getAttribute: (n: string) => attrs[n] ?? null, hasAttribute: (n: string) => n in attrs,
    classList: { contains: (c: string) => cls.includes(c) },
  });
  it('classifies controls', () => {
    expect(soundForControl(el({}, ['ui-btn', 'ui-btn--primary']))).toBe('click');
    expect(soundForControl(el({}, ['ui-btn--secondary']))).toBe('click-secondary');
    expect(soundForControl(el({ role: 'tab' }))).toBe('tab');
    expect(soundForControl(el({ role: 'switch' }))).toBe('toggle');
    expect(soundForControl(el({ role: 'radio' }))).toBe('toggle');
    expect(soundForControl(el({ disabled: '' }))).toBeNull();
    expect(soundForControl(el({ 'aria-disabled': 'true' }))).toBeNull();
  });
});

