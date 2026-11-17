// Atta founding variation (GDD 06 §5.15, GDD 07 §5.4.3, §6.4.8): the pellet is planted in the cell and becomes the
// founding garden; eggs wait until it is established; the queen fertilises it from her reserves; most of the first
// clutch is eaten; a dry cell kills an unplanted pellet (founding failed, `garden-lost`). Driven through
// cheat.completeFounding on the test world (the founding module's own steps). The seal itself is forced
// (cheat.setFoundingState, as tools/sim/life.ts does): the founding module's automatic seal never plugs the 35 BU
// Atta shaft (a core defect reported by species-leafcutter, reproduced without the fungus rules).

import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';
import { setClimateOverride } from '../../envAdapter';
import { TICKS_PER_DAY } from '@/sim/time';
import { FOUND_ESTABLISHED_MULT } from '@/sim/balance/species-leafcutter';
import { phase, queen, searchingSim, stepUntil } from '../testkit';
import { fungusParams } from '@/sim/species/modules/fungus/params';

function attaFounding(rh = 0.85, tempC = 24) {
  const sim = makeTestSim({ species: 'atta-texana', sizeBu: 128, seed: 3 });
  setClimateOverride(sim, { chamberTemp: () => tempC, pointTemp: () => tempC, rh: () => rh });
  sim.enqueue({ type: 'cheat.completeFounding', workers: 10 });
  return sim;
}

describe('Atta founding with the fungus pellet', () => {
  it('plants the pellet, holds the eggs until the garden is established, then lays; most eggs are eaten', () => {
    const sim = attaFounding();
    const P = fungusParams(sim.species)!;
    let planted = -1, firstEgg = -1, eaten = 0;
    sim.events.on('garden-state', (e) => { if (e.cause === 'planted' && planted < 0) planted = sim.state.tick; });
    sim.events.on('egg-laid', () => { if (firstEgg < 0) firstEgg = sim.state.tick; });
    sim.events.on('queen.egg-eaten', () => { eaten++; });
    let forced = false;
    stepUntil(sim, () => {
      if (phase(sim) === 'seal' && !forced) { sim.enqueue({ type: 'cheat.setFoundingState', nestId: -1, state: 'sealed' }); forced = true; }
      return phase(sim) === 'timelapse' || phase(sim) === 'failed';
    }, 4 * TICKS_PER_DAY);
    expect(phase(sim)).toBe('timelapse');
    for (let i = 0; i < 5; i++) sim.tick(); // the eggs are eaten on the ticks after they are laid
    const op = sim.state.player.opening!;
    expect(op.garden!.planted).toBe(true);
    expect(op.garden!.established).toBe(true);
    expect(planted).toBeGreaterThanOrEqual(0);
    expect(firstEgg).toBeGreaterThan(planted);
    const col = sim.state.colonies[0];
    const g = col.fungus!.gardens[0];
    expect(g.biomass).toBeGreaterThanOrEqual(FOUND_ESTABLISHED_MULT * P.plantedGu - 1e-6);
    // eggs wait for the garden: at least the founding growth time to 1.5 x the pellet
    expect((firstEgg - planted) / TICKS_PER_DAY).toBeGreaterThan(0.8);
    const laid = queen(sim).queen!.founding!.eggsLaid;
    expect(laid).toBeGreaterThan(0);
    expect(eaten).toBe(Math.floor(laid * sim.species.opening.trophicFraction));
  }, 120_000);

  it('the queen fertilises the garden from her reserves (gardenFertCost per game day)', () => {
    const sim = attaFounding();
    const P = fungusParams(sim.species)!;
    stepUntil(sim, () => sim.state.player.opening!.garden!.planted, 2 * TICKS_PER_DAY);
    const q = queen(sim);
    const r0 = q.queen!.founding!.reserveLoads;
    const t0 = sim.state.tick;
    sim.tick(); // one tick in the cell, planted, not yet sealed
    const drop = r0 - q.queen!.founding!.reserveLoads;
    expect(drop).toBeGreaterThanOrEqual(P.gardenFertCost / TICKS_PER_DAY - 1e-9);
    expect(sim.state.tick - t0).toBe(1);
  }, 60_000);

  it('a dry founding kills the pellet before it is planted: the founding fails, cause garden-lost', () => {
    const sim = searchingSim({ species: 'atta-texana', seed: 3 });
    setClimateOverride(sim, { chamberTemp: () => 24, pointTemp: () => 24, rh: () => 0.3 });
    // the queen wanders on the surface (no founding steps): the pellet loses 0.05 per GD in dry air
    const op = sim.state.player.opening!;
    op.garden!.pelletHealth = 0.01;
    let cause = '';
    sim.events.on('opening.failed', (e) => { cause = e.cause; });
    stepUntil(sim, () => phase(sim) === 'failed', TICKS_PER_DAY);
    expect(phase(sim)).toBe('failed');
    expect(cause).toBe('garden-lost');
  }, 60_000);
});
