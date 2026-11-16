// No false alarms in the opening (task founding-close §4): the claustral founding keeps its plug in and feeds the
// brood from the queen's pool, so neither "waste cannot leave the nest" (midden-blocked) nor the starvation alarm
// may be raised while it runs, also once the first workers are in the sealed cell.
import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';
import { isMiddenBlocked } from '../midden';
import { claustralFounding, foundingInProgress, playerColonyOf } from './access';
import { phase, pinTemperature, stepUntil } from './testkit';

// (`food-c-low` / `food-p-low` from the colony's lean stage are raised at the start of every game: reported to the
// colony-core owner, src/sim/colony/starvation.ts setStage; not authorised here)
const FALSE_ALARMS = ['midden-blocked', 'colony-starving'];

describe('the opening raises no false alarms', () => {
  it('from the intro to the hand-over (workers in the sealed cell): no midden-blocked or starvation alert', () => {
    const sim = makeTestSim({ sizeBu: 128, seed: 2 });
    pinTemperature(sim, 28); // a short lapse
    const raised: string[] = [];
    sim.events.on('alert', (e) => { if (e.op === 'raise') raised.push(e.alert.kind); });
    sim.enqueue({ type: 'cheat.completeFounding', workers: 8 });
    stepUntil(sim, () => phase(sim) === 'handover' || phase(sim) === 'failed', 6 * 6000);
    expect(phase(sim)).toBe('handover');
    const col = playerColonyOf(sim)!;
    expect(col.core!.workers).toBeGreaterThan(0);
    expect(foundingInProgress(sim, col.id)).toBe(true);
    stepUntil(sim, () => false, 300); // the colony cycle runs with workers and the plug still in
    expect(isMiddenBlocked(col)).toBe(false);
    expect(raised.filter((k) => FALSE_ALARMS.includes(k))).toEqual([]);
  }, 60_000);

  it('the guard is the sealed cell only: workers in a closed nest before any seal (a set-up colony) raise midden-blocked', () => {
    const sim = makeTestSim({ sizeBu: 128, seed: 2 });
    const col = playerColonyOf(sim)!;
    expect(sim.state.player.opening?.phase).toBe('intro-card');
    expect(claustralFounding(sim, col.id)).toBe(false);
    sim.enqueue({ type: 'cheat.spawnAnts', colonyId: col.id, n: 3, caste: 'worker', ageGd: 4, task: null, pos: null });
    stepUntil(sim, () => isMiddenBlocked(col), 600);
    expect(isMiddenBlocked(col)).toBe(true); // no entrance at all: a real fault, not the founding plug
  }, 60_000);
});
