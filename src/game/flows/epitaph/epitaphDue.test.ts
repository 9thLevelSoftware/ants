// When the game enters its epitaph mode (GDD 06 §13.4): after the opening only the sim decides, through
// `colony.extinct` / `epitaph.ready` after EXTINCTION_GRACE_GD, so the cause chain and the final autosave exist; the
// session's "no ant for a few real seconds" rule no longer cuts the grace short, and extinctionEndsGame = false holds.
import { describe, expect, it } from 'vitest';
import type { Command } from '@/sim/types';
import { daysToTicks } from '@/sim/time';
import { EXTINCTION_GRACE_GD } from '@/sim/balance/lifecycle';
import { colonyOf, makeLifeSim, send, step } from '@/sim/colony/succession/testLife';
import { ProfileStore } from '../../profile/profile';
import { GameSession } from '../../session';
import type { LifecycleHost } from './host';
import { LifecycleFlows } from './lifecycle';
import { registerLineageProfile } from './lineage';

const cam = { autoFollow: 'gentle' as const, fovOffset: 0, worldUpLock: false, reducedMotion: false };

function setup(extinctionEndsGame = true) {
  registerLineageProfile(new ProfileStore({ storage: null, kv: null }));
  const sim = makeLifeSim({ chamberC: 15 });
  sim.state.config.rules.extinctionEndsGame = extinctionEndsGame;
  const session = new GameSession(sim, cam);
  const host: LifecycleHost = {
    session, realtime: false, mode: 'playing', opts: { testMode: true }, settings: { get: () => ({ camera: { reducedMotion: false } }) },
    command: (c: Command) => { session.driver.enqueue(c); session.driver.applyCommandsNow(); },
    possess: () => {}, setSpeed: () => {}, newGame: async () => {}, quitToTitle: () => {}, load: async () => {}, refreshUi: () => {},
  };
  const flows = new LifecycleFlows(host);
  flows.attach(session);
  return { sim, flows };
}

describe('epitaph timing (game side)', () => {
  it('the session saying "empty" does not end the game before the sim\'s extinction', () => {
    const { sim, flows } = setup();
    send(sim, { type: 'cheat.killAll', colonyId: colonyOf(sim).id });
    step(sim, 60); // 6 s of game time at 1x: the session's 5 s rule would fire here
    expect(flows.epitaphDue(true)).toBe(false);
    step(sim, daysToTicks(EXTINCTION_GRACE_GD) + 10);
    expect(colonyOf(sim).lifecycle!.succession.extinct).toBe(true);
    expect(colonyOf(sim).lifecycle!.succession.causeChain.length).toBeGreaterThan(0);
    expect(flows.epitaphDue(true)).toBe(true);
    registerLineageProfile(null);
  });

  it('extinctionEndsGame = false: no epitaph however long the nest is empty', () => {
    const { sim, flows } = setup(false);
    send(sim, { type: 'cheat.killAll', colonyId: colonyOf(sim).id });
    step(sim, daysToTicks(EXTINCTION_GRACE_GD) * 3);
    expect(flows.epitaphDue(true)).toBe(false);
    registerLineageProfile(null);
  });

  it('during the opening the session rule still ends a failed founding', () => {
    const { sim, flows } = setup();
    sim.state.player.opening = { phase: 'dig', done: false } as unknown as typeof sim.state.player.opening;
    expect(flows.epitaphDue(true)).toBe(true);
    expect(flows.epitaphDue(false)).toBe(false);
    registerLineageProfile(null);
  });
});
