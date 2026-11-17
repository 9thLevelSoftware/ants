// GDD 06 §4.5 automatic slow-downs: levels, the two blocking prompts, cooldown, never while paused, never faster.
import { describe, expect, it } from 'vitest';
import type { ActiveAlert, AlertKind, AlertLevel, SpeedLevel } from '@/sim/types';
import { TICKS_PER_DAY } from '@/sim/time';
import { AUTO_SLOW_COOLDOWN_GD, AutoSlowWatcher, autoSlowAction, slowedLevel, type AutoSlowChoice } from './autoSlow';

const alert = (kind: AlertKind, level: AlertLevel): ActiveAlert => ({
  id: 1, kind, level, subjectId: 1, title: '', cause: '', focus: null, diagnosticId: null, raisedTick: 0, updatedTick: 0, count: 1, acknowledged: false,
});

const DEFAULTS: AutoSlowChoice = { critical: 'slow', warning: 'off' };

describe('autoSlowAction', () => {
  it('critical by the critical choice, warning by the warning choice, notices never', () => {
    expect(autoSlowAction('queen-in-danger', 'critical', DEFAULTS)).toBe('slow');
    expect(autoSlowAction('queen-in-danger', 'critical', { critical: 'pause', warning: 'off' })).toBe('pause');
    expect(autoSlowAction('raid-seen', 'warning', DEFAULTS)).toBeNull();
    expect(autoSlowAction('raid-seen', 'warning', { critical: 'slow', warning: 'slow' })).toBe('slow');
    expect(autoSlowAction('nest-crowded', 'notice', { critical: 'pause', warning: 'slow' })).toBeNull();
  });
  it('the winter notice and flying weather slow time at notice level (overwinter-prompt, flight-launch)', () => {
    expect(autoSlowAction('winter-coming', 'notice', DEFAULTS)).toBe('slow');
    expect(autoSlowAction('flight-weather', 'notice', DEFAULTS)).toBe('slow');
    expect(autoSlowAction('winter-coming', 'notice', { critical: 'off', warning: 'slow' })).toBeNull();
  });
});

describe('slowedLevel', () => {
  it('never while paused, never faster', () => {
    expect(slowedLevel('slow', 0)).toBeNull();
    expect(slowedLevel('pause', 0)).toBeNull();
    expect(slowedLevel('slow', 1)).toBeNull();
    expect(slowedLevel('slow', 8)).toBe(1);
    expect(slowedLevel('pause', 1)).toBe(0);
  });
});

describe('AutoSlowWatcher', () => {
  it('one slow-down per kind per cooldown', () => {
    let level: SpeedLevel = 8;
    const applied: SpeedLevel[] = [];
    const w = new AutoSlowWatcher({ level: () => level, choice: () => DEFAULTS, apply: (to) => { applied.push(to); level = to; } });
    expect(w.consider(alert('winter-coming', 'notice'), 100)).toBe(1);
    level = 8;
    expect(w.consider(alert('winter-coming', 'notice'), 200)).toBeNull();
    expect(w.consider(alert('queen-in-danger', 'critical'), 200)).toBe(1);
    level = 4;
    expect(w.consider(alert('winter-coming', 'notice'), 100 + AUTO_SLOW_COOLDOWN_GD * TICKS_PER_DAY)).toBe(1);
    expect(applied).toEqual([1, 1, 1]);
  });
});
