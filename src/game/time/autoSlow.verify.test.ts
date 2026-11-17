// Reviewer tests (gate-close-app review): AutoSlowWatcher attached to a real sim's alert stream.
// Tests that fail here demonstrate a defect and are left in place for the fixer (see the review report).
import { describe, expect, it } from 'vitest';
import type { SpeedLevel } from '@/sim/types';
import { raiseAlert } from '@/sim/progression/alerts';
import { makeTestSim } from '@/sim/testing';
import { calendarTickAt, TICKS_PER_DAY } from '@/sim/time';
import { makeLifeSim, send, step } from '@/sim/colony/succession/testLife';
import { AUTO_SLOW_COOLDOWN_GD, AutoSlowWatcher, type AutoSlowChoice } from './autoSlow';

const DEFAULTS: AutoSlowChoice = { critical: 'slow', warning: 'off' };

function watch(level0: SpeedLevel) {
  const box = { level: level0, applied: [] as SpeedLevel[] };
  const w = new AutoSlowWatcher({ level: () => box.level, choice: () => DEFAULTS, apply: (to) => { box.applied.push(to); box.level = to; } });
  return { w, box };
}

describe('AutoSlowWatcher verify: escalation', () => {
  // GDD 08 §6.1: a critical alert slows to 1x by default. A diagnostic that goes warn -> bad (progression/diagnostics
  // alertFor: one level higher on bad, e.g. diag-nest-stability warning -> critical) or any raiseAlert of a higher level
  // on an active key escalates the SAME card: raiseAlert emits op 'update', which the watcher ignores, so a
  // critical alert reached by escalation never slows time.
  it('an alert escalated from warning to critical slows time like a new critical one', () => {
    const sim = makeTestSim({ systems: [] });
    const { w, box } = watch(8);
    w.attach(sim);
    const req = { kind: 'nest-collapse-risk' as const, subjectId: 7, title: 't', cause: 'c', focus: null, diagnosticId: null };
    raiseAlert(sim, { ...req, level: 'warning' });
    sim.events.flush?.();
    expect(box.applied).toEqual([]); // warning: off by default
    raiseAlert(sim, { ...req, level: 'critical' });
    sim.events.flush?.();
    expect(sim.state.progression.alerts.find((a) => a.kind === 'nest-collapse-risk')?.level).toBe('critical');
    expect(box.applied).toEqual([1]);
    w.detach();
  });
});

describe('AutoSlowWatcher verify: the overwinter prompt', () => {
  // GDD 06 §6.2 (Banner row): the winter banner (Begin / Delay one day, the blocking prompt, winter day 1 00:00)
  // carries the auto-slow rule `overwinter-prompt`. The sim raises `winter-coming` at the autumn NOTICE (autumn day
  // L-1, 12:00), 1.5 game days before the banner; the banner itself raises no alert (overwinter.banner event only).
  // A player who goes back to 8x after the notice meets the banner at 8x: the prompt does not slow time.
  it('the winter banner slows time even when the player sped up again after the autumn notice', () => {
    const sim = makeLifeSim({ chamberC: 4 });
    const { w, box } = watch(8);
    w.attach(sim);
    const cfg = sim.state.config;
    send(sim, { type: 'cheat.setTime', tick: calendarTickAt('autumn', 6, 11.5, cfg) });
    let guard = 0;
    while (sim.state.env.winter.phase !== 'notice' && guard++ < TICKS_PER_DAY) step(sim, 10);
    expect(sim.state.env.winter.phase).toBe('notice');
    expect(box.applied).toEqual([1]); // the notice slowed time
    box.level = 8; // the player runs 8x again (well past the 0.25 GD cooldown before the banner)
    guard = 0;
    while (sim.state.env.winter.phase !== 'banner' && guard++ < 2 * TICKS_PER_DAY / 10) step(sim, 10);
    expect(sim.state.env.winter.phase).toBe('banner');
    expect(sim.state.tick).toBeGreaterThan(AUTO_SLOW_COOLDOWN_GD * TICKS_PER_DAY);
    expect(box.level).toBe(1);
    w.detach();
  }, 60_000);
});
