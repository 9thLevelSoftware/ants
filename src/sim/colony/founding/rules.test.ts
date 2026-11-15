// Founding rules fixed after the review (docs/design/tasks/reviews/founding.json): the stage strip follows the
// real brood, the extra clutch after total brood loss is a clutch of its own (half the cap, counted from 0), and the
// claustral cell raises no starvation alarm (the queen's pool replaces the stores, GDD 02 §2.7).
import { describe, expect, it } from 'vitest';
import { OPEN_LAY_BATCH_EGGS } from '@/sim/balance/actions';
import { broodDies } from '../brood';
import { beatOf, lapseCounters } from './lapse';
import { clutchCap, clutchLimit, eggsLaid, eggsLaidTotal } from './clutch';
import { nestOf, phase, pinTemperature, queen, searchingSim, stepUntil } from './testkit';

describe('time-lapse stage strip (GDD 06 §5.11): the beat of the brood in the cell, not of the playback fraction', () => {
  it('eggs, larvae, pupae by the stage holding most brood; cocoons when only pupae are left; eclosion; final', () => {
    const c = (eggs: number, larvae: number, pupae: number, workers = 0) => ({ eggs, larvae, pupae, workers });
    expect(beatOf(c(22, 0, 0), false)).toBe('eggs');
    expect(beatOf(c(10, 12, 0), false)).toBe('larvae');
    expect(beatOf(c(2, 5, 9), false)).toBe('pupae');
    expect(beatOf(c(0, 0, 9), false)).toBe('cocoons');
    expect(beatOf(c(0, 0, 5, 1), false)).toBe('eclosion');
    expect(beatOf(c(0, 0, 0, 9), true)).toBe('final');
  });
});

describe('total brood loss with the queen alive (GDD 06 §5.14)', () => {
  it('one extra clutch of half the cap (species and chamber volume), counted from 0; earlier eggs stay on record', () => {
    const sim = searchingSim({ seed: 3 });
    pinTemperature(sim, 24);
    sim.enqueue({ type: 'cheat.completeFounding', workers: 6 });
    stepUntil(sim, () => phase(sim) === 'timelapse', 4000);
    expect(phase(sim)).toBe('timelapse');
    const q = queen(sim), nest = nestOf(sim);
    const first = eggsLaid(q);
    expect(first).toBeGreaterThan(0);
    for (const b of sim.state.brood) if (b.alive) broodDies(sim, b, 'base');
    stepUntil(sim, () => phase(sim) === 'lay', 100);
    expect(phase(sim)).toBe('lay');
    const half = Math.max(OPEN_LAY_BATCH_EGGS, Math.floor(clutchCap(sim, nest) / 2));
    expect(clutchLimit(sim, q, nest)).toBeLessThanOrEqual(half); // and the cheat's own aim (18 eggs for 6 workers)
    // the automatic opening lays the extra clutch and the lapse runs again, with eggs (not "full" at once)
    stepUntil(sim, () => phase(sim) === 'timelapse', 200);
    expect(phase(sim)).toBe('timelapse');
    expect(eggsLaid(q)).toBe(clutchLimit(sim, q, nest));
    expect(eggsLaid(q)).toBeGreaterThan(0);
    expect(eggsLaidTotal(q)).toBe(first + eggsLaid(q));
    const c = lapseCounters(sim, q);
    expect(c.eggs).toBe(eggsLaid(q));
    expect(c.lost).toBe(first); // the first clutch, not an invented offset
  }, 60_000);
});

describe('claustral cell: no starvation alarm (GDD 02 §2.7 point 1)', () => {
  it('2 GD of the lapse with empty colony stores: no brood-sacrifice stage, no "colony is starving" alert', () => {
    const sim = searchingSim({ seed: 1 });
    pinTemperature(sim, 19.5);
    sim.enqueue({ type: 'cheat.completeFounding', workers: 10 });
    stepUntil(sim, () => phase(sim) === 'timelapse', 4000);
    const stages: string[] = [];
    sim.events.on('starvation-stage', (e) => stages.push(e.stage));
    stepUntil(sim, () => phase(sim) !== 'timelapse', 2 * 6000);
    expect(phase(sim)).toBe('timelapse');
    expect(stages).not.toContain('brood-sacrifice');
    expect(sim.state.progression.alerts.map((a) => a.kind)).not.toContain('colony-starving');
  }, 60_000);
});
