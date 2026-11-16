// The controller's own hooks on the Game: speed CHOICES (not speed commands) teach hint-speed, Settings > Reset hints
// reaches the engine's store, the manual clock follows the sim's steps, and a hook never outlives the controller.
import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';
import type { Sim } from '@/sim/types';
import type { UiSnapshot } from '@/ui/api';
import { buildSnapshot } from '../uiBridge';
import { OnboardingController, type OnboardingGame } from './controller';
import type { UiFacts } from './facts';
import { MemoryHintStore } from './store';

function rig(opts: { opening?: 'search' | null } = {}) {
  const sim: Sim = makeTestSim({ nest: 'small', workers: 4 });
  sim.state.player.opening = opts.opening === 'search' ? { ...sim.state.player.opening!, done: false, phase: 'search' } : null;
  const log: number[] = [];
  const game = {
    session: { sim } as { sim: Sim } | null,
    getSettings: () => ({ gameplay: { hints: true } }),
    setSpeed(level: number): void { log.push(level); sim.enqueue({ type: 'setSpeed', speed: level as never }); sim.tick(); },
  } as OnboardingGame & { setSpeed(l: number): void };
  const ui: UiFacts = { drawer: null, overlayScent: false, overlayOther: false, foundingShown: [] };
  const snap = (): UiSnapshot => buildSnapshot({
    sim: game.session?.sim ?? null, mode: 'playing', view: 'observer', loading: null, speed: null, manualClock: true, toasts: [], hudHidden: false,
    underground: false, error: null, epitaph: null,
  }, 0);
  const store = new MemoryHintStore();
  const current = snap();
  const ctl = new OnboardingController({ game, snapshot: () => current, ui: () => ui, store, manual: true });
  ctl.advance(0.25); // the controller follows the sim from its first step
  return { sim, game, ctl, store, log };
}

describe('hint-speed is taught by the player calling Game.setSpeed', () => {
  it('two speed choices that change the speed teach it; the same call twice in a row does not count twice', () => {
    const r = rig();
    r.game.setSpeed!(2);
    expect(r.ctl.engine.uses()['speed']).toBe(1);
    r.game.setSpeed!(2); // already 2x: no change, not a use
    expect(r.ctl.engine.uses()['speed']).toBe(1);
    r.game.setSpeed!(1);
    expect(r.ctl.engine.state('hint-speed')).toBe('learned');
    expect(r.log).toEqual([2, 2, 1]); // the game's own method still ran every time
  });

  it('pausing counts, resuming from a pause counts', () => {
    const r = rig();
    r.game.setSpeed!(0);
    r.game.setSpeed!(1);
    expect(r.ctl.engine.state('hint-speed')).toBe('learned');
  });

  it('the opening\'s own pause and resume (the founding flow calls Game.setSpeed too) are not uses', () => {
    const r = rig({ opening: 'search' });
    r.game.setSpeed!(0);
    r.game.setSpeed!(1);
    expect(r.ctl.engine.uses()['speed']).toBeUndefined();
  });

  it('a call made while a new game is being loaded (the controller has not seen that sim yet) is not a use', () => {
    const r = rig();
    r.game.session = { sim: makeTestSim({ nest: 'small', workers: 2 }) };
    r.game.setSpeed!(0);
    r.game.setSpeed!(2);
    expect(r.ctl.engine.uses()['speed']).toBeUndefined();
  });

  it('commands that never pass through the game\'s setSpeed (performance step-down, pause on blur) are not uses', () => {
    const r = rig();
    r.sim.enqueue({ type: 'setSpeed', speed: 2 });
    r.sim.tick();
    r.sim.enqueue({ type: 'setSpeed', speed: 1 });
    r.sim.tick();
    r.ctl.advance(0.5);
    expect(r.ctl.engine.uses()['speed']).toBeUndefined();
  });

  it('the hook is gone after dispose', () => {
    const r = rig();
    r.ctl.dispose();
    expect(Object.getOwnPropertyDescriptor(r.game, 'setSpeed')?.get).toBeUndefined();
    r.game.setSpeed!(2);
    expect(r.ctl.engine.uses()['speed']).toBeUndefined();
  });
});

describe('Settings > Reset hints reaches the engine', () => {
  it('a resetHints added to the game after the controller exists (persistence installs late) also resets the engine store', () => {
    const r = rig();
    r.store.learn('hint-trail');
    r.store.learn('hint-speed');
    let persistenceCalled = 0;
    Object.assign(r.game, { resetHints: () => { persistenceCalled++; } }); // install.ts does exactly this
    (r.game as { resetHints?: () => void }).resetHints!();
    expect(persistenceCalled).toBe(1);
    expect(r.ctl.engine.state('hint-trail')).toBe('pending');
    expect(r.ctl.engine.state('hint-speed')).toBe('pending');
  });

  it('works without the persistence layer too (the engine store is the only one)', () => {
    const r = rig();
    r.store.learn('hint-trail');
    (r.game as { resetHints?: () => void }).resetHints!();
    expect(r.ctl.engine.state('hint-trail')).toBe('pending');
  });
});

describe('the manual clock follows the sim\'s own steps', () => {
  it('stepping the sim moves the engine by TICK_SECONDS per tick, so __game.step alone teaches hint-move (App E 9)', () => {
    const r = rig();
    const before = r.ctl.engine.clock;
    r.sim.state.player.possessedAntId = r.sim.state.ants.find((a) => a.caste === 'worker')!.id;
    for (let i = 0; i < 20; i++) r.sim.tick(); // 2 game seconds
    r.ctl.tick();
    expect(r.ctl.engine.clock - before).toBeCloseTo(2, 5);
    r.ctl.tick(); // no new steps: no time passes
    expect(r.ctl.engine.clock - before).toBeCloseTo(2, 5);
  });

  it('a huge jump (a time-lapse) is capped, and a different sim restarts the count', () => {
    const r = rig();
    const before = r.ctl.engine.clock;
    r.sim.state.tick += 100000;
    r.ctl.tick();
    expect(r.ctl.engine.clock - before).toBeLessThanOrEqual(30 + 1e-6);
    const mid = r.ctl.engine.clock;
    r.game.session = { sim: makeTestSim({ nest: 'small', workers: 2 }) };
    r.ctl.tick();
    expect(r.ctl.engine.clock - mid).toBeLessThan(0.3);
  });
});
