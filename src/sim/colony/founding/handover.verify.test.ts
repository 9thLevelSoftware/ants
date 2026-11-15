// Reviewer's checks of the time-lapse and the hand-over on the running simulation (founding review): a save taken
// mid-lapse continues identically, and after the hand-over the first workers reopen the plugged entrance
// (GDD 06 §5.13 (b); task acceptance criterion 2 "the first workers at the reopened entrance").
import { describe, expect, it } from 'vitest';
import { createSim } from '@/sim/sim';
import { restore, snapshot } from '@/sim/save';
import { stateHash } from '@/sim/save/hash';
import { makeTestSim } from '@/sim/testing';
import { TICKS_PER_DAY } from '@/sim/time';
import { nestOf, phase, pinTemperature, queen, searchingSim, stepUntil } from './testkit';
import { act, readyInRampCell, walkTo } from './verifyKit';

const FAST_C = 28; // fast brood: short lapses

describe('time-lapse state is plain data', () => {
  it('a snapshot restored mid-lapse reaches the same hand-over (tick and stateHash) as the uninterrupted run', () => {
    const a = makeTestSim({ sizeBu: 128, seed: 4 });
    pinTemperature(a, FAST_C);
    a.enqueue({ type: 'cheat.completeFounding', workers: 6 });
    stepUntil(a, () => phase(a) === 'timelapse', 4000);
    expect(phase(a)).toBe('timelapse');
    stepUntil(a, () => false, 1500);
    const b = createSim(restore(snapshot(a)).state, a.world);
    pinTemperature(b, FAST_C);
    expect(stateHash(b.state)).toBe(stateHash(a.state));
    stepUntil(a, () => phase(a) !== 'timelapse', 40_000);
    stepUntil(b, () => phase(b) !== 'timelapse', 40_000);
    expect(phase(a)).toBe('handover');
    expect(b.state.tick).toBe(a.state.tick);
    expect(stateHash(b.state)).toBe(stateHash(a.state));
  }, 120_000);
});

describe('hand-over: the first workers reopen the entrance (GDD 06 §5.13 (b))', () => {
  it('after a real plug (seal-entrance), a clutch and the lapse, an entrance of the cell is open again within 2 GD', () => {
    const sim = searchingSim({ seed: 2 });
    pinTemperature(sim, FAST_C);
    const r = readyInRampCell(sim);
    act(sim, 'dig-bite');
    walkTo(sim, r.rampAt(1.5), 0.5);
    act(sim, 'seal-entrance');
    stepUntil(sim, () => phase(sim) === 'lay', 20);
    expect(phase(sim)).toBe('lay');
    walkTo(sim, r.floor, 0.8);
    for (let i = 0; i < 3; i++) act(sim, 'lay-egg');
    sim.tick();
    sim.enqueue({ type: 'openingBeginTimelapse' });
    stepUntil(sim, () => phase(sim) === 'handover' || phase(sim) === 'failed', 40_000);
    expect(phase(sim)).toBe('handover');
    const nest = nestOf(sim);
    expect(queen(sim).queen!.founding).toBeNull();
    expect(sim.state.ants.filter((a) => a.alive && a.caste === 'worker').length).toBeGreaterThan(0);
    stepUntil(sim, () => nest.entrances.some((e) => e.status === 'open'), 2 * TICKS_PER_DAY);
    expect(nest.entrances.map((e) => e.status)).toContain('open');
  }, 180_000);
});
