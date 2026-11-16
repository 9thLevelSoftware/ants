// Reviewer tests (onboarding verify): the controller on a real sim. "Performing the action counts as learning" must
// mean the PLAYER performed it: speed changes the game makes by itself must not teach hint-speed.
import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';
import type { Sim } from '@/sim/types';
import type { UiSnapshot } from '@/ui/api';
import { buildSnapshot } from '../uiBridge';
import { OnboardingController } from './controller';
import type { UiFacts } from './facts';
import { MemoryHintStore } from './store';

function rig() {
  const sim: Sim = makeTestSim({ nest: 'small', workers: 4 });
  sim.state.player.opening = null; // a colony past its opening
  const game = { session: { sim } as { sim: Sim } | null, getSettings: () => ({ gameplay: { hints: true } }) };
  const ui: UiFacts = { drawer: null, overlayScent: false, overlayOther: false, foundingShown: [] };
  const snap = (): UiSnapshot => buildSnapshot({
    sim: game.session?.sim ?? null, mode: 'playing', view: 'observer', loading: null, speed: null, manualClock: true, toasts: [], hudHidden: false,
    underground: false, error: null, epitaph: null,
  }, 0);
  const store = new MemoryHintStore();
  const current = snap();
  const ctl = new OnboardingController({ game, snapshot: () => current, ui: () => ui, store, manual: true });
  return { sim, ctl, store };
}

describe('hint-speed is taught by the player only', () => {
  it('a speed change the game makes by itself (performance step-down, auto-pause on focus loss) does not count as a use', () => {
    const r = rig();
    r.ctl.advance(0.5); // the controller subscribes to the sim on its first step
    const seen: string[] = [];
    r.sim.events.on('time.speed-changed', (e) => seen.push(`${e.from}->${e.to}:${e.reason}`));
    // What src/game/loop/simDriver.ts does when frames are slow (meter step-down) and Game.autoPause does on blur:
    // both enqueue a plain `setSpeed` command, which the sim reports as `time.speed-changed` with reason 'command'.
    r.sim.enqueue({ type: 'setSpeed', speed: 2 });
    r.sim.tick();
    r.sim.enqueue({ type: 'setSpeed', speed: 1 });
    r.sim.tick();
    r.ctl.advance(0.5);
    expect(seen).toEqual(['1->2:command', '2->1:command']);
    expect(r.ctl.engine.state('hint-speed'), 'two automatic speed changes taught hint-speed; the speed hint would never appear').not.toBe('learned');
  });

  it('a possession-forced speed change (reason possession) is not a use', () => {
    const r = rig();
    r.ctl.advance(0.5);
    r.sim.events.emit('time.speed-changed', { type: 'time.speed-changed', from: 4, to: 1, reason: 'possession' });
    r.sim.events.emit('time.speed-changed', { type: 'time.speed-changed', from: 1, to: 4, reason: 'possession' });
    r.ctl.advance(0.25);
    expect(r.ctl.engine.uses()['speed']).toBeUndefined();
  });
});
