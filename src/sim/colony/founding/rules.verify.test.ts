// Reviewer's checks of the opening's rules against GDD 06 §5 and the task spec (founding review). Tests that fail
// here demonstrate open defects and stay in place for the fixer; the passing ones are regression tests.
import { describe, expect, it } from 'vitest';
import { siteClass } from '@/worldgen/maps/suitability';
import { requireSpecies } from '@/sim/species';
import { OPEN_LAY_BATCH_EGGS } from '@/sim/balance/actions';
import { foundingMu, forecast, siteQuality, siteWordOf, moistureFactor, siteProfile, factorWord } from './index';
import { foundingView } from './view';
import { nestOf, phase, pinTemperature, queen, searchingSim, stepUntil } from './testkit';
import { act, readyInRampCell, walkTo } from './verifyKit';

describe('site words: live read-out vs static suitability map (task Boundaries; directions §K)', () => {
  it('the read-out uses the same word thresholds as the static map (overlay and read-out agree)', () => {
    // The task: "The live assessment must call the same factor functions and thresholds as the static suitability
    // map (import them; do not re-implement)". Today: read-out 0.68 / 0.74 / 0.89, map 0.72 / 0.86 / 0.93.
    const differ: string[] = [];
    for (let q = 0; q <= 1.0001; q += 0.01) if (siteWordOf(q) !== siteClass(q)) differ.push(`${q.toFixed(2)}:${siteWordOf(q)}/${siteClass(q)}`);
    expect(differ).toEqual([]);
  });
});

describe('pure rules: edge values', () => {
  it('quality, mu, moisture and words stay finite and in range for NaN, negative and huge inputs', () => {
    expect(siteQuality([NaN, NaN, NaN, NaN, NaN, NaN, NaN], 'lasius-niger')).toBeCloseTo(0.05, 9);
    expect(siteQuality([], 'lasius-niger')).toBeCloseTo(0.05, 9);
    expect(siteQuality([2, 2, 2, 2, 2, 2, 2], 'lasius-niger')).toBeCloseTo(1, 9);
    expect(moistureFactor(siteProfile('lasius-niger').moist, NaN)).toBe(0);
    for (const q of [-5, 0, 0.5, 1, 5]) {
      const mu = foundingMu(q, 'lasius-niger');
      expect(mu).toBeGreaterThanOrEqual(0.06 - 1e-12);
      expect(mu).toBeLessThanOrEqual(0.6 + 1e-12);
    }
    expect(typeof factorWord('diggability', NaN)).toBe('string');
    expect(factorWord('diggability', 0)).toBe('Unbreakable');
  });

  it('forecast at a chamber too cold to develop: no workers expected, nothing NaN', () => {
    const def = requireSpecies('lasius-niger');
    const f = forecast(def, 24, 8, 0.7);
    expect(f.expected).toBe(0);
    expect(Number.isNaN(f.reserves)).toBe(false);
    expect(f.range).toEqual([0, 0]);
  });
});

describe('the player path through the real primitives (GDD 06 §5.9-§5.10)', () => {
  it('in the cell with readiness met: a bite yields a pellet, one seal-entrance at the throat seals, lay-egg lays a batch', () => {
    const sim = searchingSim();
    pinTemperature(sim, 22);
    const r = readyInRampCell(sim);
    expect(phase(sim)).toBe('seal');
    const q = queen(sim);
    expect(act(sim, 'dig-bite')).toBe(true);
    expect(q.carry.kind).toBe('item');
    expect(walkTo(sim, r.rampAt(1.5), 0.5)).toBe(true);
    expect(act(sim, 'seal-entrance')).toBe(true);
    stepUntil(sim, () => phase(sim) === 'lay', 20);
    expect(phase(sim)).toBe('lay');
    expect(walkTo(sim, r.floor, 0.8)).toBe(true);
    expect(act(sim, 'lay-egg')).toBe(true);
    sim.tick();
    expect(q.queen!.founding!.eggsLaid).toBe(OPEN_LAY_BATCH_EGGS);
  }, 60_000);

  it('GDD 06 §5.9: holding E (seal-entrance) at the shaft seals it without first fetching soil by hand', () => {
    // The prompt says "Seal the entrance" (E at the shaft). The action needs a carried soil pellet, but the founding
    // dig expels every pellet automatically, so the first presses are refused with `no-target`.
    const sim = searchingSim();
    pinTemperature(sim, 22);
    const r = readyInRampCell(sim);
    const q = queen(sim);
    const refused: string[] = [];
    sim.events.on('action-failed', (e) => { if (e.antId === q.id) refused.push(`${e.action}:${e.reason}`); });
    expect(walkTo(sim, r.rampAt(1.5), 0.5)).toBe(true);
    for (let i = 0; i < 4 && phase(sim) === 'seal'; i++) act(sim, 'seal-entrance');
    stepUntil(sim, () => phase(sim) === 'lay', 20);
    expect(refused).toEqual([]);
    expect(phase(sim)).toBe('lay');
  }, 60_000);

  it('GDD 06 §5.10: lay-egg is refused until the entrance is sealed (phase `seal`)', () => {
    const sim = searchingSim();
    pinTemperature(sim, 22);
    readyInRampCell(sim);
    expect(phase(sim)).toBe('seal');
    const q = queen(sim);
    act(sim, 'lay-egg');
    sim.tick();
    expect(q.queen!.founding!.eggsLaid).toBe(0);
    expect(sim.state.brood.filter((b) => b.alive)).toHaveLength(0);
  }, 60_000);

  it('GDD 06 §5.14: "Undo founding" is offered only until the first lay', () => {
    const sim = searchingSim();
    pinTemperature(sim, 22);
    const r = readyInRampCell(sim);
    act(sim, 'dig-bite');
    walkTo(sim, r.rampAt(1.5), 0.5);
    act(sim, 'seal-entrance');
    stepUntil(sim, () => phase(sim) === 'lay', 20);
    walkTo(sim, r.floor, 0.8);
    act(sim, 'lay-egg');
    sim.tick();
    expect(queen(sim).queen!.founding!.eggsLaid).toBeGreaterThan(0);
    const rejected: string[] = [];
    sim.events.on('command-rejected', (e) => rejected.push(`${e.commandType}:${e.reason}`));
    sim.enqueue({ type: 'openingUndo' });
    sim.tick();
    expect(rejected.some((x) => x.startsWith('openingUndo:'))).toBe(true);
  }, 60_000);
});

describe('the passive player (GDD 06 §5.1 `lay` exit, §5.10)', () => {
  it('1.5 GD after sealing with no eggs she lays one batch and the time-lapse begins', () => {
    const sim = searchingSim();
    pinTemperature(sim, 22);
    const nest = nestOf(sim);
    readyInRampCell(sim);
    sim.enqueue({ type: 'cheat.setFoundingState', nestId: nest.id, state: 'sealed' });
    sim.tick();
    expect(phase(sim)).toBe('lay');
    stepUntil(sim, () => queen(sim).queen!.founding!.eggsLaid > 0, 10_000);
    expect(queen(sim).queen!.founding!.eggsLaid).toBe(OPEN_LAY_BATCH_EGGS);
    // §5.1 phase table, `lay` exit: "... or 1.5 GD after sealing with the automatic batch of 5.10 ... -> timelapse"
    stepUntil(sim, () => phase(sim) !== 'lay', 600);
    expect(phase(sim)).toBe('timelapse');
    expect(foundingView(sim)!.timelapse).not.toBeNull();
  }, 60_000);
});
