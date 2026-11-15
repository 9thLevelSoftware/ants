// Footstep tremor cues reach the possession camera through the views layer (GDD 01 §6.1), and the layer relays the
// camera-state event (GDD 01 App. C) across sessions.
import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';
import type { HumanCue, Sim } from '@/sim/types';
import { GameSession } from '../session';
import { tremorStruck } from './tremorCue';
import type { CameraStateChange } from './viewDirector';
import { ViewsLayer, type ViewsGame } from './viewsLayer';

const CAM = { autoFollow: 'gentle' as const, fovOffset: 0, worldUpLock: false, reducedMotion: false };

function addCue(sim: Sim, cue: Partial<HumanCue>): void {
  const c: HumanCue = { kind: 'tremor', origin: { x: 0, y: 0, z: 0 }, radiusMm: 100, intensity: 1, startTick: 0, impactTick: 0, ...cue };
  sim.state.env.human.active.push({ instId: 1, progressS: 0, nextImpactTick: c.impactTick, cues: [c] });
}

function layerFor(s: GameSession): ViewsLayer {
  const game = {
    session: s, mode: 'playing', camera: {} as ViewsGame['camera'], hover: null, inspect: null,
    possess: () => null, command: () => ({ applied: true, rejected: [] }), toast: () => {},
  } as unknown as ViewsGame;
  return new ViewsLayer(game);
}

describe('tremorStruck', () => {
  it('counts a tremor cue whose impact falls in (since, now] and whose radius reaches the point', () => {
    const sim = makeTestSim({ systems: [] });
    const p = { ...sim.state.ants[0].pos };
    for (let i = 0; i < 3; i++) sim.tick();
    const now = sim.state.tick;
    addCue(sim, { origin: { x: p.x + 50, y: 0, z: p.z }, radiusMm: 60, impactTick: now });
    expect(tremorStruck(sim, p, now - 1)).toBe(true);
    expect(tremorStruck(sim, p, now)).toBe(false); // already counted
    expect(tremorStruck(sim, { ...p, x: p.x - 20 }, now - 1)).toBe(false); // out of reach
    sim.state.env.human.active[0].cues[0].kind = 'shadow';
    expect(tremorStruck(sim, p, now - 1)).toBe(false); // only tremor shakes
  });
});

describe('ViewsLayer: tremor and camera-state relay', () => {
  it('a tremor striking the possessed ant shakes the possession camera once', () => {
    const sim = makeTestSim({ nest: 'small', workers: 2, systems: [] });
    const s = new GameSession(sim, CAM);
    s.driver.enqueue(s.possessCommand('queen', true));
    s.driver.applyCommandsNow();
    s.update(0);
    expect(s.view).toBe('possess');
    const layer = layerFor(s);
    const events: CameraStateChange[] = [];
    layer.onCameraState((e) => events.push(e));
    let shakes = 0;
    const orig = s.views.tremor.bind(s.views);
    s.views.tremor = () => { shakes++; orig(); };
    layer.frame(s, null, 0); // first frame: starts counting from this tick
    s.views.update(1 / 60, null);
    const q = s.possessedAnt()!;
    sim.tick();
    addCue(sim, { origin: { ...q.pos }, radiusMm: 50, impactTick: sim.state.tick });
    layer.frame(s, null, 0.1);
    layer.frame(s, null, 0.2); // same tick again: no second shake
    expect(shakes).toBe(1);
    expect(events.some((e) => e.view === 'possess' && e.state !== null)).toBe(true);
  });
});
