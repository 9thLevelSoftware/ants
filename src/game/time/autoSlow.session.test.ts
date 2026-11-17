// GDD 08 App E 6 at the session level: an alert raised inside a tick of a real-time frame drops 8x to 1x by the end
// of the next frame at the latest. The host mirrors Game's wiring: Game.setSpeed -> Game.command, which only enqueues
// while the sim ticks in real time (applied at the start of the next tick), and the speed is read from the driver.
import { describe, expect, it } from 'vitest';
import { raiseAlert } from '@/sim/progression/alerts';
import { makeTestSim } from '@/sim/testing';
import { commandsSystem } from '@/sim/systems';
import type { AlertLevel, Sim, System } from '@/sim/types';
import { GameSession } from '../session';
import { AutoSlowWatcher, type AutoSlowChoice } from './autoSlow';

const cam = { autoFollow: 'gentle' as const, fovOffset: 0, worldUpLock: false, reducedMotion: false };
const FRAME_S = 1 / 60;
const RT = { frozen: false, realtime: true, now: null };

/** A test system that raises one alert at `atTick` (after another at `before` when given: an escalation). */
function raiser(atTick: number, level: AlertLevel, before?: { tick: number; level: AlertLevel }): System {
  const raise = (sim: Sim, l: AlertLevel) => raiseAlert(sim, { kind: 'nest-collapse-risk', level: l, subjectId: 3, title: 't', cause: 'c', focus: null, diagnosticId: null });
  return {
    name: 'test-raiser',
    run(sim) {
      if (before && sim.state.tick === before.tick) raise(sim, before.level);
      if (sim.state.tick === atTick) raise(sim, level);
    },
  };
}

function play(system: System, choice: AutoSlowChoice) {
  const s = new GameSession(makeTestSim({ nest: 'small', workers: 1, systems: [commandsSystem, system] }), cam);
  s.driver.enqueue({ type: 'setSpeed', speed: 8 });
  s.driver.applyCommandsNow();
  const w = new AutoSlowWatcher({ level: () => s.driver.level, choice: () => choice, apply: (to) => s.driver.enqueue({ type: 'setSpeed', speed: to }) });
  w.attach(s.sim);
  return { s, w };
}

/** Plays frames until the alert card exists; returns the number of further frames until the speed is `want`. */
function framesUntil(s: GameSession, want: number): number {
  let guard = 0;
  while (!s.sim.state.progression.alerts.some((a) => a.level === 'critical') && guard++ < 600) s.driver.frame(FRAME_S, RT);
  expect(s.sim.state.progression.alerts.some((a) => a.level === 'critical')).toBe(true);
  let n = 0;
  while (s.driver.level !== want && n < 10) { s.driver.frame(FRAME_S, RT); n++; }
  return s.driver.level === want ? n : Infinity;
}

describe('auto-slow through the session driver (GDD 08 App E 6)', () => {
  it('a critical alert at 8x drops to 1x within one frame', () => {
    const { s, w } = play(raiser(40, 'critical'), { critical: 'slow', warning: 'off' });
    expect(framesUntil(s, 1)).toBeLessThanOrEqual(1);
    w.detach();
  });

  it('the pause choice pauses within one frame; resuming is the player\'s (pause button) and is not undone', () => {
    const { s, w } = play(raiser(40, 'critical'), { critical: 'pause', warning: 'off' });
    expect(framesUntil(s, 0)).toBeLessThanOrEqual(1);
    s.driver.enqueue({ type: 'setSpeed', speed: 8 }); // Resume at 8x: the same alert does not pause again
    s.driver.applyCommandsNow();
    for (let i = 0; i < 30; i++) s.driver.frame(FRAME_S, RT);
    expect(s.driver.level).toBe(8);
    w.detach();
  });

  it('an alert escalated from warning to critical drops to 1x within one frame', () => {
    const { s, w } = play(raiser(60, 'critical', { tick: 20, level: 'warning' }), { critical: 'slow', warning: 'off' });
    expect(framesUntil(s, 1)).toBeLessThanOrEqual(1);
    w.detach();
  });
});
