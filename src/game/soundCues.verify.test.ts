// Reviewer tests (gate-close-app review): the sound-cue tracker on a real sim event bus, and edge cases of the pip
// direction. Passing tests are kept as regression tests.
import { describe, expect, it } from 'vitest';
import type { SimEvent } from '@/sim/types';
import { makeTestSim } from '@/sim/testing';
import { pipPlace } from '@/ui/hud/SoundCuePips';
import { cueDirection, SOUND_CUE_MAX, SoundCueTracker, type CameraView } from './soundCues';

const v = (x: number, y: number, z: number) => ({ x, y, z });
const CAM: CameraView = { pos: v(0, 0, 0), forward: v(0, 0, -1), up: v(0, 1, 0), fovDeg: 60, aspect: 16 / 9 };

describe('SoundCueTracker verify: on a sim', () => {
  it('follows the sim events after a flush; detach stops it and drops the pips', () => {
    const sim = makeTestSim({ systems: [] });
    const t = new SoundCueTracker();
    t.attach(sim, () => 0);
    const me = sim.state.colonies[0]?.id ?? -1;
    sim.emit({ type: 'alarm-raised', colonyId: me, pos: v(10, 0, -1), strength: 1, source: 'x' } as SimEvent);
    sim.emit({ type: 'alarm-raised', colonyId: me + 999, pos: v(10, 0, -1), strength: 1, source: 'x' } as SimEvent);
    sim.events.flush();
    const l = t.list(0.5, CAM);
    expect(l.map((c) => c.kind)).toEqual(['alarm']);
    t.detach();
    expect(t.list(0.5, CAM)).toEqual([]);
    sim.emit({ type: 'drum', antId: 1, pos: v(0, 0, -5), wood: true } as SimEvent);
    sim.events.flush();
    expect(t.list(0.5, CAM)).toEqual([]);
  });

  it('never more than SOUND_CUE_MAX pips, one per kind', () => {
    const t = new SoundCueTracker();
    const evs: SimEvent[] = [
      { type: 'alarm-raised', colonyId: 1, pos: v(1, 0, 0), strength: 1, source: 'x' } as SimEvent,
      { type: 'drum', antId: 1, pos: v(0, 0, -5), wood: true } as SimEvent,
      { type: 'collapse-warning', nestId: 1, center: v(0, 0, 0), radius: 1, volume: 1 } as SimEvent,
      { type: 'weather.changed', from: 'clear', to: 'storm', intensityClass: null, reason: '' } as unknown as SimEvent,
      { type: 'human.telegraph', instId: 1, kind: 'footsteps', cue: 'tremor', origin: v(0, 0, 5) } as unknown as SimEvent,
    ];
    for (let i = 0; i < 3; i++) for (const e of evs) t.note(e, 1, i * 0.1);
    const l = t.list(0.3, CAM);
    expect(l.length).toBeLessThanOrEqual(SOUND_CUE_MAX);
    expect(new Set(l.map((c) => c.kind)).size).toBe(l.length);
  });
});

describe('cueDirection / pipPlace verify: edge cases', () => {
  it('a source at the camera or straight behind it gives a finite angle and a place inside the screen', () => {
    for (const p of [v(0, 0, 0), v(0, 0, 10), v(0, -10, 0), v(1e9, 0, 0)]) {
      const d = cueDirection(p, CAM);
      expect(Number.isFinite(d.angleDeg)).toBe(true);
      const at = pipPlace(Math.round(d.angleDeg));
      expect(at.left).toBeGreaterThanOrEqual(0);
      expect(at.left).toBeLessThanOrEqual(100);
      expect(at.top).toBeGreaterThanOrEqual(0);
      expect(at.top).toBeLessThanOrEqual(100);
    }
  });

  it('a source below and in front of a camera looking down is on screen', () => {
    const down: CameraView = { pos: v(0, 10, 0), forward: v(0, -1, 0), up: v(0, 0, -1), fovDeg: 60, aspect: 1.5 };
    expect(cueDirection(v(0, 0, 0), down).onScreen).toBe(true);
    expect(cueDirection(v(0, 20, 0), down).onScreen).toBe(false);
  });
});
