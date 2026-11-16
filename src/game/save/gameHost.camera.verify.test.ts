// Independent review (int-1B-app): the save meta's new `camera` field is restored on load (gameHost resumeView), but
// isValidMeta does not check it. A save file whose camera is not a pair of finite points (hand-edited, damaged, or
// written by another version) is accepted and then breaks the load half-way: the game is already playing the loaded
// sim when resumeView throws, and the manager reports "The game could not start from this save", or the observer
// camera silently becomes NaN.
import { describe, expect, it } from 'vitest';
import { ObserverRig } from '@/render/camera/observerRig';
import type { Game } from '../Game';
import { GameHost } from './gameHost';
import { isValidMeta } from './meta';
import { makeSim } from './testkit';

function fakeGame(rig: ObserverRig) {
  const calls: string[] = [];
  const fake = {
    mode: 'title', view: 'observer', session: null as unknown, loading: null, opts: { testMode: true, canvas: null },
    settings: { get: () => ({ gameplay: { pauseOnLoad: false } }) },
    endGame: () => { calls.push('endGame'); },
    adoptSim: async (sim: unknown) => {
      calls.push('adoptSim');
      fake.mode = 'playing';
      fake.session = { view: 'observer', sim, views: { freeFlyAt: (p: never, l: never) => rig.setPose(p, l) } };
    },
    setSpeed: () => {}, renderNow: () => {}, refreshUi: () => {}, viewChanged: () => {}, setView: () => {},
  };
  return { fake, calls };
}

describe('review: save meta camera on load', () => {
  it('a well-formed camera puts the observer where the player left it', async () => {
    const { sim } = makeSim(2);
    sim.state.player.possessedAntId = -1;
    const rig = new ObserverRig({ bu: 4, worldSize: 16000 });
    const { fake } = fakeGame(rig);
    await new GameHost(fake as unknown as Game).adopt(sim, { view: 'observer', camera: { pos: { x: 10, y: 20, z: 30 }, look: { x: 110, y: 20, z: 30 } } } as never);
    expect(rig.pos).toEqual({ x: 10, y: 20, z: 30 });
  });

  it('a malformed camera in the meta never reaches the camera rig (load either refuses it or ignores it)', async () => {
    const { sim } = makeSim(2);
    sim.state.player.possessedAntId = -1;
    const bad = { pos: { x: 'a', y: 1, z: 2 }, look: {} };
    const meta = { view: 'observer', camera: bad };
    // Either the meta check refuses it ...
    const refused = !isValidMeta({ ...validMetaShape(), camera: bad });
    if (refused) return;
    // ... or the loader ignores it: adopt must not throw and the observer must stay finite.
    const rig = new ObserverRig({ bu: 4, worldSize: 16000 });
    const { fake } = fakeGame(rig);
    let threw: unknown = null;
    try { await new GameHost(fake as unknown as Game).adopt(sim, meta as never); } catch (e) { threw = e; }
    expect(threw).toBeNull();
    expect(Number.isFinite(rig.pos.x) && Number.isFinite(rig.yaw) && Number.isFinite(rig.pitch)).toBe(true);
  });
});

function validMetaShape() {
  return {
    key: 'slot-1', slot: 'slot-1', generation: 1, label: '', pinned: false, species: 'lasius-niger', archetype: 'suburban-garden',
    seed: 2, seedCode: '0000-0002', sizeClass: 'standard', difficulty: 'naturalist', stage: 'founding', tick: 1, dateLabel: 'x',
    colonyDay: 0, population: 0, playTimeS: 0, savedAtIso: 'x', savedAtMs: 1, saveVersion: 1, generatorVersion: 1,
    worldFingerprint: 1, appVersion: 'x', thumbnail: null,
  };
}
