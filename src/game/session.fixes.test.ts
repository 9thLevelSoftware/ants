// F3b review fixes: prediction across pauses, camera flight on ant switches, the observer after a possessed ant's
// death (GDD 01 §3.7), view requests out of photo mode, the __game.possess() result and refusal capture.
import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';
import type { Command, PossessRole } from '@/sim/types';
import { possessResult } from './debug/possessResult';
import { collectRefusals } from './refusals';
import { GameSession, POSSESS_DEATH_HOLD_S } from './session';
import type { GameMode } from './time/speedRules';
import { AFTER_DEATH_PROMPT } from './views/deathFollow';
import { requestView, togglePhoto, type ViewSwitchHost } from './views/viewSwitch';

const cam = { autoFollow: 'gentle' as const, fovOffset: 0, worldUpLock: false, reducedMotion: false };
const rt = { frozen: false, realtime: true, now: () => 0 };

class Host implements ViewSwitchHost {
  mode: GameMode = 'playing';
  constructor(readonly session: GameSession) {}
  command(cmd: Command): void {
    this.session.driver.enqueue(cmd);
    this.session.driver.applyCommandsNow();
    this.session.update(0);
  }
  possess(target: number | PossessRole): void {
    if (this.session.view !== 'photo') this.command(this.session.possessCommand(target, true));
  }
  release(): void {
    if (this.session.possessedId !== -1) this.command({ type: 'release', reason: 'player' });
  }
  viewChanged(): void {}
}

function setup(workers = 5) {
  const s = new GameSession(makeTestSim({ nest: 'small', workers }), cam);
  return { s, h: new Host(s), sim: s.sim };
}

describe('possessed-ant prediction (review: pause snapped the ant back one tick)', () => {
  it('stays valid across a pause command, and is dropped after a step or a teleport', () => {
    const { s, h } = setup();
    h.possess('queen');
    s.sim.setPlayerIntent({ dir: { x: 1, y: 0, z: 0 }, hurry: false, grip: false, held: [], flight: null });
    for (let i = 0; i < 5; i++) { const f = s.driver.frame(1 / 30, rt); s.predict(f.advancedS); }
    expect(s.predictionValid()).toBe(true);
    const ant = s.possessedAnt()!;
    const before = { ...s.subjectOf(ant, s.driver.last.alpha).pos };
    h.command({ type: 'setSpeed', speed: 0 }); // applied at once (auto-pause path)
    for (let i = 0; i < 5; i++) s.driver.frame(1 / 30, rt);
    expect(s.predictionValid()).toBe(true);
    const paused = s.subjectOf(ant, s.driver.last.alpha).pos;
    expect(Math.hypot(paused.x - before.x, paused.y - before.y, paused.z - before.z)).toBeLessThan(1e-9);
    h.command({ type: 'cheat.teleport', antId: ant.id, pos: { x: ant.pos.x + 20, y: ant.pos.y, z: ant.pos.z } });
    expect(s.predictionValid()).toBe(false);
    for (let i = 0; i < 2; i++) { const f = s.driver.frame(1 / 30, rt); s.predict(f.advancedS); } // paused: no predict
    expect(s.predictionValid()).toBe(false);
    s.driver.step(1);
    expect(s.predictionValid()).toBe(false);
  });

  it('keeps the predicted pose when the game pauses without a command (photo mode freeze)', () => {
    const { s, h } = setup();
    h.possess('queen');
    s.sim.setPlayerIntent({ dir: { x: 1, y: 0, z: 0 }, hurry: false, grip: false, held: [], flight: null });
    for (let i = 0; i < 7; i++) { const f = s.driver.frame(1 / 30, rt); s.predict(f.advancedS); }
    const ant = s.possessedAnt()!;
    const before = { ...s.subjectOf(ant, s.driver.last.alpha).pos };
    for (let i = 0; i < 10; i++) s.driver.frame(1 / 30, { ...rt, frozen: true });
    expect(s.predictionValid()).toBe(true);
    const after = s.subjectOf(ant, s.driver.last.alpha).pos;
    expect(Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z)).toBeLessThan(1e-9);
  });
});

describe('camera on ant switches (review: possess -> possess cut)', () => {
  it('switching to another ant starts a camera flight (or dip) instead of a cut', () => {
    const { s, h, sim } = setup();
    h.possess('queen');
    s.views.settle(2, 1 / 30);
    expect(s.views.transition.running).toBe(false);
    const w = sim.state.ants.find((a) => a.caste === 'worker')!;
    h.possess(w.id);
    expect(s.possessedId).toBe(w.id);
    expect(s.views.transition.running).toBe(true);
  });
});

describe('after the possessed ant died (GDD 01 §3.7)', () => {
  function killPossessed(workers = 3) {
    const env = setup(workers);
    const w = env.sim.state.ants.find((a) => a.caste === 'worker')!;
    env.h.possess(w.id);
    env.s.driver.enqueue({ type: 'cheat.kill', id: w.id, cause: 'test' });
    env.s.driver.step(1);
    env.s.update(0.1);
    return { ...env, w };
  }

  it('the observer follow-orbits the corpse and shows "Tab: take another ant"', () => {
    const { s, sim } = killPossessed();
    expect(s.view).toBe('possess');
    s.update(POSSESS_DEATH_HOLD_S);
    expect(s.view).toBe('observer');
    expect(s.observerPrompt).toBe(AFTER_DEATH_PROMPT);
    expect(s.followItemId).toBeGreaterThanOrEqual(0);
    expect(sim.stores.items.get(s.followItemId)?.kind).toBe('corpse');
    const subj = s.currentSubject(1)!;
    const it = sim.stores.items.get(s.followItemId)!;
    expect(Math.hypot(subj.pos.x - it.pos.x, subj.pos.z - it.pos.z)).toBeLessThan(1e-6);
  });

  it('with autoRepossessOnDeath the nearest nestmate is returned for possession instead', () => {
    const { s } = killPossessed();
    s.autoRepossessOnDeath = true;
    const r = s.update(POSSESS_DEATH_HOLD_S);
    expect(r.repossessId).toBeGreaterThanOrEqual(0);
    expect(s.sim.stores.ants.get(r.repossessId)?.alive).toBe(true);
  });

  it('the prompt goes when another ant is taken', () => {
    const { s, h, sim } = killPossessed();
    s.update(POSSESS_DEATH_HOLD_S);
    h.possess(sim.state.ants.find((a) => a.alive && a.caste === 'worker')!.id);
    expect(s.view).toBe('possess');
    expect(s.observerPrompt).toBeNull();
    expect(s.followItemId).toBe(-1);
  });
});

describe('view requests (review: requestView ended in the wrong view)', () => {
  it('colony requested from photo mode (origin possession) ends in the colony view', () => {
    const { s, h } = setup();
    h.possess('queen');
    togglePhoto(h);
    expect(s.view).toBe('photo');
    requestView(h, 'colony');
    expect(s.view).toBe('colony');
  });

  it('possess requested from the colony view entered from the observer takes the queen', () => {
    const { s, h } = setup();
    requestView(h, 'colony');
    expect(s.view).toBe('colony');
    requestView(h, 'possess');
    expect(s.view).toBe('possess');
  });
});

describe('__game.possess() result (review: ok with an ant already possessed)', () => {
  it('a refused target is reported as refused even while another ant is possessed', () => {
    const { s, h } = setup();
    h.possess('queen');
    const queen = s.possessedId;
    const cmd = s.possessCommand(987654, true);
    s.driver.enqueue(cmd);
    const rejected = collectRefusals(s.sim, () => s.driver.applyCommandsNow());
    expect(rejected.length).toBeGreaterThan(0);
    const r = possessResult(987654, { applied: true, rejected, refused: null }, s.possessedId);
    expect(r.ok).toBe(false);
    expect(r.id).toBe(queen);
    expect(r.reason).toBeTruthy();
  });

  it('ok only when the requested ant is the possessed one; pending and game refusals are not ok', () => {
    expect(possessResult(5, { applied: true, rejected: [], refused: null }, 5).ok).toBe(true);
    expect(possessResult(5, { applied: true, rejected: [], refused: null }, 3).ok).toBe(false);
    expect(possessResult('queen', { applied: true, rejected: [], refused: null }, 3).ok).toBe(true);
    expect(possessResult(5, { applied: false, rejected: [], refused: null }, 3)).toMatchObject({ ok: false, pending: true });
    expect(possessResult(5, { applied: false, rejected: [], refused: 'photo-mode' }, 3)).toMatchObject({ ok: false, reason: 'photo-mode' });
  });
});
