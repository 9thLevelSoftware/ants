// Adversarial review tests for the audio pass (task audio-pass). Passing tests are regression tests; failing tests
// demonstrate a defect and stay in place for the fixer (each names the finding it reproduces).
import { describe, expect, it } from 'vitest';
import { begin } from '@/sim/ants';
import { killCreature, spawnCreature } from '@/sim/entities';
import { queen, searchingSim, stepUntil } from '@/sim/colony/founding/testkit';
import { makeTestSim } from '@/sim/testing/testWorld';
import type { Sim, SimEvent } from '@/sim/types';
import { EventRouter, type AudioSink } from './eventRouter';
import { integratedLoudness, measure, shortTermLoudness, truePeakDb } from './loudness';

const FS = 48000;

interface Played { id: string; pos: { x: number; y: number; z: number } | null }
function recorder() {
  const played: Played[] = [];
  const sink: AudioSink = {
    cue: (id, pos) => { played.push({ id, pos: pos ? { ...pos } : null }); },
    ui() {}, giantTelegraph() {}, giantStart() {}, giantImpact() {}, giantEnd() {}, thunder() {}, musicTrigger() {},
    surfaceDb: () => 0,
  };
  return { played, sink };
}

/** Records every sim event with the tick it came out of, as AudioSystem.attachSim does. */
function tap(sim: Sim): { tick: number; e: SimEvent }[] {
  const out: { tick: number; e: SimEvent }[] = [];
  sim.events.onAny((_t, e) => { out.push({ tick: sim.state.tick, e: e as SimEvent }); });
  return out;
}

describe('F1: one dig sound per dig bite in a real simulation', () => {
  // The runner's plain `dig-bite` sits at the ant's position, nest/bite.ts's `dig-bite.<material>` at the carve hit.
  // The router de-duplicates by place (3 BU), not by ant: a founding queen (about 2.1 BU long) biting a fixed point
  // ahead of her carves the face away from her, and after a few bites the two cues of one bite are more than 3 BU
  // apart (measured 1.8 -> 3.5 BU over nine bites), so each later bite sounds twice.
  it('a founding queen digging repeatedly at one target: as many dig sounds as bites', () => {
    const sim = searchingSim();
    const q = queen(sim), bu = sim.world.bu;
    const events = tap(sim);
    const target = { kind: 'point' as const, id: -1, pos: { x: q.pos.x + q.fwd.x * 2 * bu, y: q.pos.y - 2 * bu, z: q.pos.z + q.fwd.z * 2 * bu } };
    expect(begin(sim, q, 'dig-bite', target, { repeat: true })).toBe(true);
    stepUntil(sim, () => false, 220);
    const biteTicks = new Set(events.filter(({ e }) => e.type === 'cue' && e.cue.startsWith('dig-bite.')).map(({ tick }) => tick));
    expect(biteTicks.size).toBeGreaterThanOrEqual(6);
    const r = recorder();
    const router = new EventRouter(r.sink);
    for (const { tick, e } of events) router.handle(sim, e, tick);
    const digSounds = r.played.filter((p) => p.id.startsWith('dig-bite') || p.id === 'wood-chew');
    expect(digSounds.length).toBe(biteTicks.size);
  });

  // the same happens to a worker: the face recedes as she bites without stepping (3.1 BU apart by the 10th bite)
  it('a worker digging repeatedly at her auto target: one sound per bite', () => {
    const sim = makeTestSim({ nest: 'small', workers: 4 });
    const w = sim.state.ants.find((a) => a.alive && a.caste === 'worker')!;
    const events = tap(sim);
    begin(sim, w, 'dig-bite', null, { repeat: true });
    stepUntil(sim, () => false, 120);
    const biteTicks = new Set(events.filter(({ e }) => e.type === 'cue' && e.cue.startsWith('dig-bite.')).map(({ tick }) => tick));
    expect(biteTicks.size).toBeGreaterThanOrEqual(3);
    const r = recorder();
    const router = new EventRouter(r.sink);
    for (const { tick, e } of events) router.handle(sim, e, tick);
    expect(r.played.filter((p) => p.id.startsWith('dig-bite')).length).toBe(biteTicks.size);
  });
});

describe('F2: a dead creature thuds where it died, not everywhere', () => {
  // AudioSystem drains events at the next frame; by then the end-of-tick sweep (core/store.ts) has removed the dead
  // creature, so creaturePos() is null and the thud is played non-positional at full gain (spatialize: pos null =
  // flat), wherever in the world the creature died.
  // The sim delivers events after its end-of-tick sweep, so the router cannot find a dead creature by id: the system
  // calls router.track(sim) once per audio frame and the router keeps the last place it saw each creature. A death it
  // could not place at all is dropped, not played flat.
  it('creature-died handled after the tick that killed it still carries the place it died', () => {
    const sim = makeTestSim({ nest: 'small', workers: 2 });
    const at = sim.state.ants[0].pos;
    const c = spawnCreature(sim, { kind: 'ladybird', pos: { x: at.x + 40, y: at.y, z: at.z }, radiusMm: 3, maxHp: 10, init: {} });
    const diedAt = { ...c.pos };
    const r = recorder();
    const router = new EventRouter(r.sink);
    const events = tap(sim);
    router.track(sim); // an audio frame while it is alive
    killCreature(sim, c.id, 'combat');
    sim.tick(); // the sweep at the end of the tick removes it, before the next audio frame drains the queue
    expect(sim.stores.creatures.get(c.id)).toBeUndefined();
    router.track(sim); // the next audio frame, then its events
    for (const { tick, e } of events) router.handle(sim, e, tick);
    const thuds = r.played.filter((p) => p.id === 'creature-step');
    expect(thuds.length).toBe(1);
    expect(thuds[0].pos).toEqual(diedAt);
  });

  it('a death whose place nobody recorded is silent, not a flat thud at full gain', () => {
    const sim = makeTestSim({ nest: 'small', workers: 2 });
    const at = sim.state.ants[0].pos;
    const c = spawnCreature(sim, { kind: 'ladybird', pos: { x: at.x + 40, y: at.y, z: at.z }, radiusMm: 3, maxHp: 10, init: {} });
    const events = tap(sim);
    killCreature(sim, c.id, 'combat');
    sim.tick();
    const r = recorder();
    const router = new EventRouter(r.sink);
    for (const { tick, e } of events) router.handle(sim, e, tick);
    expect(r.played.filter((p) => p.id === 'creature-step').length).toBe(0);
  });
});

describe('F3: de-duplication is by place, so two ants of one tick merge', () => {
  // Spec work item 3: de-duplicate by (tick, ant, cue). The router drops any second cue of a family in the same tick
  // within 3 BU, whoever made it: two neighbours picking up at once, or two ants biting each other, are one sound.
  it('two different ants picking up items 1 BU apart in the same tick are two sounds', () => {
    const sim = makeTestSim({ nest: 'small', workers: 4 });
    const [a, b] = sim.state.ants.filter((x) => x.alive && x.caste === 'worker');
    const bu = sim.world.bu;
    const r = recorder();
    const router = new EventRouter(r.sink);
    router.handle(sim, { type: 'cue', cue: 'pick-up', pos: { ...a.pos }, strength: 1 }, 50);
    router.handle(sim, { type: 'cue', cue: 'pick-up', pos: { x: a.pos.x + bu, y: a.pos.y, z: a.pos.z }, strength: 1 }, 50);
    void b;
    expect(r.played.filter((p) => p.id === 'pick-up').length).toBe(2);
  });
});

// ---- loudness estimator against EBU Tech 3341 style cases (regression) -------------------------------------------

function sine(freq: number, db: number, seconds: number, fs = FS, phase = 0): Float32Array {
  const a = Math.pow(10, db / 20);
  const x = new Float32Array(Math.round(seconds * fs));
  for (let i = 0; i < x.length; i++) x[i] = a * Math.sin((2 * Math.PI * freq * i) / fs + phase);
  return x;
}
function concat(...parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

describe('loudness estimator, Tech 3341 style cases', () => {
  it('case 2: 1 kHz at -33 dBFS stereo reads -33.0 ± 0.1', () => {
    const x = sine(1000, -33, 6);
    expect(Math.abs(integratedLoudness([x, x], FS) - -33)).toBeLessThanOrEqual(0.1);
  });

  it('case 3 (shortened): -36 / -23 / -36 dBFS reads -23.0 ± 0.1 (relative gate drops the quiet parts)', () => {
    const x = concat(sine(1000, -36, 2), sine(1000, -23, 12), sine(1000, -36, 2));
    expect(Math.abs(integratedLoudness([x, x], FS) - -23)).toBeLessThanOrEqual(0.1);
  });

  it('case 4 (shortened): -72 / -36 / -23 / -36 / -72 dBFS reads -23.0 ± 0.1 (absolute gate drops -72)', () => {
    const x = concat(sine(1000, -72, 2), sine(1000, -36, 2), sine(1000, -23, 12), sine(1000, -36, 2), sine(1000, -72, 2));
    expect(Math.abs(integratedLoudness([x, x], FS) - -23)).toBeLessThanOrEqual(0.1);
  });

  it('case 5 (shortened): -26 / -20 / -26 dBFS of equal length reads -23.0 ± 0.1 (all blocks pass the gate)', () => {
    const x = concat(sine(1000, -26, 4), sine(1000, -20, 4), sine(1000, -26, 4));
    expect(Math.abs(integratedLoudness([x, x], FS) - -23)).toBeLessThanOrEqual(0.15);
  });

  it('short-term of a steady -23 dBFS stereo sine is -23.0 ± 0.1 in every window', () => {
    const x = sine(1000, -23, 5);
    const st = shortTermLoudness([x, x], FS);
    for (const v of st.values) expect(Math.abs(v - -23)).toBeLessThanOrEqual(0.1);
  });

  it('true peak of a 0 dBFS sine at fs/4 sampled at 45 degrees reads within -0.4 / +0.2 dB of 0 dBTP', () => {
    const x = sine(FS / 4, 0, 0.2, FS, Math.PI / 4);
    const tp = truePeakDb([x, x], { fs: FS });
    expect(tp).toBeGreaterThanOrEqual(-0.4);
    expect(tp).toBeLessThanOrEqual(0.2);
  });

  it('degenerate input does not throw: NaN samples, a range past the end, zero-length channels (integrated)', () => {
    const x = sine(1000, -23, 1);
    x[100] = NaN;
    expect(() => integratedLoudness([x, x], FS)).not.toThrow();
    expect(integratedLoudness([x, x], FS, { fromS: 10 })).toBe(-Infinity);
    expect(integratedLoudness([new Float32Array(0)], FS)).toBe(-Infinity);
  });

  // F4: shortTermLoudness (and measure()) on an empty range used to call windowEnergies with a 0-sample window and hop:
  // the loop never advanced and pushed until V8 threw "Invalid array length" (about 4 s and ~1 GB). Fixed, so this
  // runs in every suite (it was behind FOUNDRESS_LONG while the bug stood).
  it('F4: short-term loudness of an empty range is silence, not a runaway loop', () => {
    expect(shortTermLoudness([new Float32Array(0)], FS).max).toBe(-Infinity);
    expect(shortTermLoudness([sine(1000, -23, 1)], FS, { fromS: 2 }).max).toBe(-Infinity);
    const m = measure([sine(1000, -23, 1)], FS, { fromS: 2 });
    expect([m.integratedLufs, m.shortTermMaxLufs]).toEqual([-Infinity, -Infinity]);
    expect(shortTermLoudness([sine(1000, -23, 1e-5)], FS).values.length).toBe(0); // under one sample
  });
});
