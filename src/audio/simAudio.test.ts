// AudioSystem against a real (small) simulation on a mock Web Audio context: the listener underground in a chamber
// (E16 surface filter, nest murmur density), sim cue events reaching the cue log, alert sounds (E4, E27), giant
// events ducking the ambience, and the possessed ant's footsteps.
import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing/testWorld';
import type { Sim, SimEvent } from '@/sim/types';
import type { ActiveAlert } from '@/sim/types/diagnostics';
import { AudioSystem, type AudioFrame, type AudioSettingsShape } from './system';
import { asCtx, MockContext } from './testing/mockAudio';
import { surfaceOcclusion } from './mix';

function settings(notices: 'full' | 'quiet' | 'off' = 'full') {
  const s: AudioSettingsShape = {
    audio: { master: 1, ambience: 0.8, effects: 0.9, giants: 0.9, ui: 0.6, music: 0.5, muted: false, musicMode: 'off', distantVoices: false, muteWhenHidden: true, mono: false },
    gameplay: { milestoneNotices: notices },
  };
  return { get: () => s, subscribe: () => () => {} };
}

function started(sim: Sim, notices: 'full' | 'quiet' | 'off' = 'full') {
  const m = new MockContext();
  const handlers: Record<string, (e: Event) => void> = {};
  const sys = new AudioSystem({
    assets: null, settings: settings(notices), testMode: false,
    host: { create: () => asCtx(m), setTimer: () => {} },
    gestureTarget: { addEventListener: (t: string, f: (e: Event) => void) => { handlers[t] = f; }, removeEventListener: () => {} },
  });
  handlers.pointerdown({ isTrusted: true } as Event);
  sys.attachSim(sim);
  return { m, sys };
}

const IDENTITY = { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] };

function frameAt(sim: Sim, pos: { x: number; y: number; z: number }, extra: Partial<AudioFrame> = {}): AudioFrame {
  return { dt: 0.3, sim, camera: { position: pos, matrixWorld: IDENTITY }, focus: pos, possessedId: -1, view: 'observer', underground: false, paused: false, hudHidden: false, ...extra };
}

const emit = (sim: Sim, e: SimEvent) => sim.events.emit(e.type as never, e as never);

function alert(id: number, level: ActiveAlert['level'], kind = 'food-c-low'): ActiveAlert {
  return { id, kind: kind as ActiveAlert['kind'], level, subjectId: 1, title: 't', cause: 'c', focus: null, diagnosticId: null, raisedTick: 0, updatedTick: 0, count: 1, acknowledged: false };
}

describe('audio on a running simulation', () => {
  const sim = makeTestSim({ nest: 'small', workers: 30 });
  const nest = sim.state.nests[0];
  const chamber = nest.chambers[0];

  it('a listener in a chamber is underground: surface filter per §13.3 (E16), nest murmur from nearby ants', () => {
    const { sys } = started(sim);
    sim.index.refresh(); // the sim refreshes its entity index every tick; this test does not tick
    sys.frame(frameAt(sim, chamber.center, { underground: true }));
    const d = sys.debug() as { listener: { underground: boolean; depthBu: number }; ambience: { surface: { cutoffHz: number; gainDb: number } } };
    expect(d.listener.underground).toBe(true);
    expect(d.listener.depthBu).toBeGreaterThan(1);
    const want = surfaceOcclusion(d.listener.depthBu, true);
    expect(d.ambience.surface.cutoffHz).toBeCloseTo(want.cutoffHz, 6);
    expect(d.ambience.surface.gainDb).toBeCloseTo(want.gainDb, 9);
    expect(sys.runtime!.ambienceTarget().grains.nestTicks).toBeGreaterThan(0);
  });

  it('sim cue events reach the cue log; unknown ids are ignored silently', () => {
    const { sys } = started(sim);
    emit(sim, { type: 'cue', cue: 'dig-bite.loam', pos: { ...chamber.center }, strength: 1 });
    emit(sim, { type: 'cue', cue: 'death', pos: { ...chamber.center }, strength: 1 });
    emit(sim, { type: 'cue', cue: 'ambient.unknown-thing', pos: null, strength: 1 });
    sys.frame(frameAt(sim, chamber.center, { underground: true }));
    const log = sys.cueLog().map((e) => `${e.cue}:${e.source.split(':')[0]}`);
    expect(log).toEqual(expect.arrayContaining(['dig-bite:synth', 'death:silent', 'ambient.unknown-thing:unknown']));
  });

  it('E4: five raises of the same alert key play the warning sound once', () => {
    const { sys } = started(sim);
    emit(sim, { type: 'alert', op: 'raise', alert: alert(1, 'warning') });
    for (let i = 0; i < 4; i++) emit(sim, { type: 'alert', op: 'update', alert: alert(1, 'warning') });
    sys.frame(frameAt(sim, chamber.center));
    expect(sys.cueLog().filter((e) => e.cue === 'ui.alert-warning').length).toBe(1);
  });

  it('E27: milestone notices off + HUD hidden: no motif, no warning; critical still sounds', () => {
    const { sys } = started(sim, 'off');
    emit(sim, { type: 'milestone.reached', id: 'ms-first-food', tick: 0, title: 'x' });
    emit(sim, { type: 'alert', op: 'raise', alert: alert(2, 'warning', 'nest-crowded') });
    emit(sim, { type: 'alert', op: 'raise', alert: alert(3, 'critical', 'queen-in-danger') });
    sys.frame(frameAt(sim, chamber.center, { hudHidden: true }));
    const cues = sys.cueLog().map((e) => e.cue);
    expect(cues).not.toContain('ui.milestone');
    expect(cues).not.toContain('ui.alert-warning');
    expect(cues).toContain('ui.alert-critical');
  });

  it('a giant event ducks the ambience while it runs', () => {
    const { sys } = started(sim);
    const origin = { x: chamber.center.x + 400, y: 0, z: chamber.center.z };
    emit(sim, { type: 'human.telegraph', instId: 7, kind: 'mowing', cue: 'sound', origin, radiusMm: 2000, intensity: 1, impactTick: sim.state.tick + 30 });
    emit(sim, { type: 'human.start', instId: 7, kind: 'mowing', variant: 'motor', region: 0 });
    sys.frame(frameAt(sim, chamber.center));
    expect((sys.debug() as { ducking: { giant: boolean } }).ducking.giant).toBe(true);
    expect(sys.cueLog().some((e) => e.cue === 'giant.mowing.loop')).toBe(true);
    emit(sim, { type: 'human.end', instId: 7, kind: 'mowing', variant: 'motor', region: 0 });
    sys.frame(frameAt(sim, chamber.center));
    expect((sys.debug() as { giants: string[] }).giants).toEqual([]);
  });

  it('the possessed ant walking produces step cues with the substrate material', () => {
    const { m, sys } = started(sim);
    const ant = sim.state.ants.find((a) => a.alive && a.caste === 'worker')!;
    const f = frameAt(sim, ant.pos, { possessedId: ant.id, view: 'possess', underground: true, dt: 0.016 });
    ant.speed = 10;
    for (let i = 0; i < 6; i++) { ant.gait += 0.5; m.currentTime += 0.016; sys.frame(f); }
    expect(sys.cueLog().filter((e) => e.cue === 'step').length).toBe(5); // the possessed ant's own steps bypass the crowd texture
  });
});
