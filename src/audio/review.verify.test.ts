// Adversarial review tests for the audio module (task audio). Passing tests are regression tests; failing tests
// demonstrate a defect and stay in place for the fixer (each names the finding it reproduces).
import { afterEach, describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing/testWorld';
import type { Sim, SimEvent } from '@/sim/types';
import { AlertSoundGate } from './alertGate';
import { newAmbienceInput, updateAmbienceInput } from './simAdapter';
import { newListener } from './listener';
import { AudioRuntime, type RuntimeFrame } from './runtime';
import { AudioSystem, type AudioFrame, type AudioSettingsShape } from './system';
import { installUiSounds } from './uiDelegation';
import { asCtx, MockContext, MockParam } from './testing/mockAudio';
import { PRIORITY } from './tuning';
import type { UiSoundId } from './uiSounds';

function settings(): { get(): AudioSettingsShape; subscribe(): () => void } {
  const s: AudioSettingsShape = {
    audio: { master: 1, ambience: 0.8, effects: 0.9, giants: 0.9, ui: 0.6, music: 0.5, muted: false, musicMode: 'off', distantVoices: false, muteWhenHidden: true, mono: false },
    gameplay: { milestoneNotices: 'full' },
  };
  return { get: () => s, subscribe: () => () => {} };
}

function startedSystem() {
  const m = new MockContext();
  const handlers: Record<string, (e: Event) => void> = {};
  const sys = new AudioSystem({
    assets: null, settings: settings(), testMode: false,
    host: { create: () => asCtx(m), setTimer: () => {} },
    gestureTarget: { addEventListener: (t: string, f: (e: Event) => void) => { handlers[t] = f; }, removeEventListener: () => {} },
  });
  handlers.pointerdown({ isTrusted: true } as Event);
  return { m, sys };
}

const IDENTITY = { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] };
function frameAt(sim: Sim, pos: { x: number; y: number; z: number }, extra: Partial<AudioFrame> = {}): AudioFrame {
  return { dt: 0.3, sim, camera: { position: pos, matrixWorld: IDENTITY }, focus: pos, possessedId: -1, view: 'observer', underground: false, paused: false, hudHidden: false, ...extra };
}
const emit = (sim: Sim, e: SimEvent) => sim.events.emit(e.type as never, e as never);

const simA = makeTestSim({ nest: 'small', workers: 6 });

describe('review: listener follows the attached simulation', () => {
  it('FINDING stale-sim closures: after a second game is attached, ground height and line of sight read the NEW world', () => {
    const simB = makeTestSim({ nest: 'small', workers: 6, seed: 2 });
    expect(simB.field).not.toBe(simA.field);
    const { sys } = startedSystem();
    const p = { ...simA.state.nests[0].chambers[0].center };
    sys.attachSim(simA);
    sys.frame(frameAt(simA, p));
    // a new game (or a founding restart / load) attaches a different Sim; the runtime and its listener persist
    sys.attachSim(simB);
    const marker = 123456;
    (simB.field as { height: (x: number, z: number) => number }).height = () => marker;
    sys.frame(frameAt(simB, p));
    const l = sys.runtime!.listener;
    expect(l.groundAt!(p.x, p.z)).toBe(marker); // fails: groundAt still closes over simA (updateListener uses ??=)
    sys.dispose();
  });
});

describe('review: alert sound throttles (GDD 08 §6.3)', () => {
  it('FINDING critical per-key cooldown: the same critical key may not sound twice within 20 real s', () => {
    // §6.3: ALERT_COOLDOWN_REAL_S = 20 applies to every key "regardless of speed"; critical is exempt only from the
    // rate cap (ALERT_RATE_MAX row) and has a 0 game-hour cooldown.
    const g = new AlertSoundGate();
    const a = { kind: 'queen-in-danger', subjectId: 1, level: 'critical' as const };
    expect(g.decide({ op: 'raise', ...a }, 0, 0, false)).toBe('critical');
    expect(g.decide({ op: 'clear', ...a }, 2, 20, false)).toBeNull();
    expect(g.decide({ op: 'raise', ...a }, 5, 50, false)).toBeNull(); // fails: plays again 5 s later
  });

  it('regression: a critical alert while the rate cap is exhausted still sounds', () => {
    const g = new AlertSoundGate();
    for (let i = 0; i < 4; i++) expect(g.decide({ op: 'raise', kind: `k${i}`, subjectId: i, level: 'notice' }, i, i, false)).toBe('notice');
    expect(g.decide({ op: 'raise', kind: 'k9', subjectId: 9, level: 'notice' }, 5, 5, false)).toBeNull();
    expect(g.decide({ op: 'raise', kind: 'crit', subjectId: 1, level: 'critical' }, 6, 6, false)).toBe('critical');
  });
});

describe('review: giant car (GDD 08 §13.6)', () => {
  it('FINDING car tyre layer: the synth tyre roll plays under the car pass', () => {
    const m = new MockContext();
    const rt = new AudioRuntime(asCtx(m), { bytes: null, seed: 3 });
    const f: RuntimeFrame = { ambience: null, paused: false, criticalActive: false, calmS: 0, season: 'summer', combat: false, musicMode: 'off' };
    const origin = { x: 400, y: 0, z: 0 }; // 100 BU from the listener at the origin
    rt.giants.telegraph(1, 'car', origin, 3);
    rt.giants.start(1, 'car', null);
    rt.update(0.016, f);
    const car = rt.log.list().filter((e) => e.cue === 'giant.car');
    const passAt = car.findIndex((e) => e.source.includes('car-pass'));
    expect(passAt).toBeGreaterThanOrEqual(0);
    const after = car.slice(passAt + 1);
    // fails: the tyre shot shares the key 'giant.car' with the pass (cap 1) and is refused
    expect(after.some((e) => e.source.includes('tyre-roll'))).toBe(true);
  });
});

describe('review: robustness of sim events', () => {
  const strict = ['setValueAtTime', 'linearRampToValueAtTime', 'setTargetAtTime'] as const;
  const saved = strict.map((k) => MockParam.prototype[k]);
  afterEach(() => { strict.forEach((k, i) => { (MockParam.prototype as unknown as Record<string, unknown>)[k] = saved[i]; }); });

  it('FINDING non-finite strength: one cue with strength NaN must not drop the other events of the frame', () => {
    // Real AudioParam methods throw TypeError on a non-finite value; make the mock do the same.
    strict.forEach((k, i) => {
      const orig = saved[i] as (this: MockParam, v: number, ...r: number[]) => MockParam;
      (MockParam.prototype as unknown as Record<string, unknown>)[k] = function (this: MockParam, v: number, ...r: number[]) {
        if (!Number.isFinite(v)) throw new TypeError(`${k}: non-finite value ${v}`);
        return orig.call(this, v, ...r);
      };
    });
    const { sys } = startedSystem();
    sys.attachSim(simA);
    const p = { ...simA.state.nests[0].chambers[0].center };
    emit(simA, { type: 'cue', cue: 'bite', pos: { ...p }, strength: Number.NaN });
    emit(simA, { type: 'cue', cue: 'pick-up', pos: { ...p }, strength: 1 });
    sys.frame(frameAt(simA, p, { underground: true }));
    const cues = sys.cueLog().map((e) => e.cue);
    expect(cues).toContain('pick-up'); // fails: the NaN bite throws inside drainEvents; the frame is abandoned
    sys.dispose();
  });

  it('regression: a cue at a NaN position is culled, not thrown', () => {
    const { sys } = startedSystem();
    sys.attachSim(simA);
    const p = { ...simA.state.nests[0].chambers[0].center };
    emit(simA, { type: 'cue', cue: 'pick-up', pos: { x: Number.NaN, y: 0, z: 0 }, strength: 1 });
    expect(() => sys.frame(frameAt(simA, p))).not.toThrow();
    expect(sys.cueLog().at(-1)?.source).toBe('culled');
    sys.dispose();
  });
});

describe('review: ambience zone crossfade (GDD 08 §13.4: groups crossfade over 32 BU at borders)', () => {
  it('FINDING zone staircase: the group weight moves smoothly across a border, not in 25 % / 50 % steps', () => {
    const bu = simA.world.bu;
    const cell = 4 * bu, nx = 200, nz = 200;
    const data = new Uint8Array(nx * nz);
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) data[iz * nx + ix] = ix < nx / 2 ? 0 : 1;
    const world = { ...simA.world, maps: { ...simA.world.maps, zone: { cell, nx, nz, data } }, zones: [{ id: 0, type: 'forest' }, { id: 1, type: 'interior' }] };
    const stub = { world, state: simA.state, index: simA.index } as unknown as Sim;
    const border = (nx / 2) * cell;
    const l = newListener(bu);
    const inp = newAmbienceInput();
    const w: number[] = [];
    for (let x = border - 24 * bu; x <= border + 24 * bu; x += 0.5 * bu) {
      l.pos.x = x; l.pos.z = 50 * cell; l.pos.y = 0;
      updateAmbienceInput(stub, l, false, -1, inp);
      w.push(inp.groups.interior);
    }
    expect(w[0]).toBe(0);
    expect(w.at(-1)).toBe(1);
    let maxJump = 0;
    for (let i = 1; i < w.length; i++) maxJump = Math.max(maxJump, Math.abs(w[i] - w[i - 1]));
    // a 32 BU crossfade moves ~1.6 % per 0.5 BU; allow 10 %
    expect(maxJump).toBeLessThanOrEqual(0.1); // fails: 3x3 samples at ±16 BU give jumps of 0.25 and 0.5
  });
});

describe('review: delegated UI sounds (GDD 08 §13.8)', () => {
  it('FINDING hover re-trigger: moving the pointer between parts of ONE button plays hover once', () => {
    const handlers: Record<string, (e: Event) => void> = {};
    const played: UiSoundId[] = [];
    installUiSounds({ addEventListener: (t, f) => { handlers[t] = f; }, removeEventListener: () => {} }, (id) => played.push(id));
    const button = { tagName: 'BUTTON', getAttribute: () => null, hasAttribute: () => false, closest: () => button } as unknown as Element;
    const icon = { tagName: 'SPAN', closest: () => button } as unknown as Element;
    const label = { tagName: 'SPAN', closest: () => button } as unknown as Element;
    const over = (target: Element, relatedTarget: Element | null) => handlers.pointerover({ target, relatedTarget } as unknown as Event);
    over(icon, null); // enters the button over its icon
    over(label, icon); // moves on to the label, still inside the button
    over(button, label); // and onto the button's padding
    expect(played.filter((p) => p === 'hover')).toHaveLength(1); // fails: 3 (only the 80 ms throttle limits it)
  });
});

describe('review: regressions that hold', () => {
  it('E16 through the AudioSystem: listener exactly 12 BU below local ground -> 1500 Hz ±1 %, -18 dB ±0.5', () => {
    const { sys } = startedSystem();
    sys.attachSim(simA);
    const bu = simA.world.bu;
    const x = simA.state.nests[0].chambers[0].center.x, z = simA.state.nests[0].chambers[0].center.z;
    const pos = { x, y: simA.field.height(x, z) - 12 * bu, z };
    sys.frame(frameAt(simA, pos, { underground: true }));
    const d = sys.debug() as { ambience: { surface: { cutoffHz: number; gainDb: number } } };
    expect(Math.abs(d.ambience.surface.cutoffHz - 1500) / 1500).toBeLessThanOrEqual(0.01);
    expect(Math.abs(d.ambience.surface.gainDb + 18)).toBeLessThanOrEqual(0.5);
    sys.dispose();
  });

  it('a possessed-ant cue gets a voice even when the table is full of other voices', () => {
    const m = new MockContext();
    const rt = new AudioRuntime(asCtx(m), { bytes: null, seed: 3 });
    rt.listener.possessedPos = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 40; i++) rt.cues.cue('grapple', { x: 4 + (i % 5), y: 0, z: 4 }, 1); // grapple cap 3
    const other = { bus: 'effects', space: 'foley', gainDb: -10, files: [], fileSemis: [0, 0], slice: null, fileGainDb: 0, synth: 'scuffle', synthSemis: [0, 0], mode: 'synth', cap: 4, priority: PRIORITY.other } as const;
    for (let i = 0; i < 40; i++) rt.cues.play({ key: `k${i}`, sound: { ...other, files: [], fileSemis: [0, 0], synthSemis: [0, 0] }, pos: { x: 8, y: 0, z: 0 }, strength: 1, semis: 0, fileSemis: null, files: null });
    expect(rt.cues.voices.active).toBeLessThanOrEqual(24);
    const id = rt.cues.play({ key: 'own', sound: { bus: 'effects', space: 'foley', gainDb: -40, files: [], fileSemis: [0, 0], slice: null, fileGainDb: 0, synth: 'mandible-click', synthSemis: [0, 0], mode: 'synth', cap: 3, priority: PRIORITY.other }, pos: { x: 0, y: 0, z: 0 }, strength: 1, semis: 0, fileSemis: null, files: null });
    expect(id).toBeGreaterThan(0);
    expect(rt.cues.voices.active).toBeLessThanOrEqual(24);
  });

  it('alarm shimmer only inside the plume of the possessed ant, on the UI bus', () => {
    const m = new MockContext();
    const rt = new AudioRuntime(asCtx(m), { bytes: null, seed: 3 });
    rt.cues.cue('alarm-burst', { x: 0, y: 0, z: 0 }, 1);
    expect(rt.log.list()).toHaveLength(0); // not possessing: nothing
    rt.listener.possessedPos = { x: 0, y: 0, z: 0 };
    rt.cues.cue('alarm-burst', { x: 40, y: 0, z: 0 }, 1); // 10 BU away: outside the 4 BU plume
    expect(rt.log.list()).toHaveLength(0);
    rt.cues.cue('alarm-burst', { x: 8, y: 0, z: 0 }, 1);
    expect(rt.log.list().at(-1)).toMatchObject({ cue: 'alarm-burst', bus: 'ui' });
  });
});
