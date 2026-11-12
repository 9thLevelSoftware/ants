// Deliverable 5 (runtime creation for other systems), 6 (intake bookkeeping) and acceptance 7 (determinism,
// plain-data state). Also the cheat.spawnFood command.

import { describe, expect, it } from 'vitest';
import { findNonPlain, makeTestWorld } from '@/sim/testing';
import { createSim } from '@/sim/sim';
import { sourcesSystem } from './system';
import { spawnItem } from '@/sim/entities';
import { TICKS_PER_DAY } from '@/sim/time';
import { createSource } from './spawn';
import { addToPool, carrionFromItem, removeSourcesInArea, spawnHerdFilm, spawnHumanFood, spawnWindfall } from './runtime';
import { takeFromSource } from './harvest';
import { recordDelivery, sourceIntake } from './ledger';
import { addWorker, anchor, centre, makeSourceSim, stepTicks } from './testkit';

describe('runtime sources', () => {
  it('human food: a food drop leaves crumbs or a crust; a spill a sugary spill; children crumbs and granules', () => {
    const sim = makeSourceSim();
    const p = centre(sim);
    const drop = spawnHumanFood(sim, 'food-drop', p).map((id) => sim.stores.sources.get(id)?.variant);
    expect(drop).toHaveLength(1);
    expect(['crumb-starch', 'crumb-protein', 'crumb-fatty', 'crust']).toContain(drop[0]);
    const spill = spawnHumanFood(sim, 'spill', p).map((id) => sim.stores.sources.get(id));
    expect(spill[0]?.variant).toBe('sugary-spill');
    expect([10, 40, 120, 300]).toContain(spill[0]?.units);
    const kids = spawnHumanFood(sim, 'children', p).map((id) => sim.stores.sources.get(id)?.variant);
    expect(kids).toHaveLength(2);
    expect(kids[1]).toBe('sugar-granules');
  });

  it('a corpse lying outside becomes carrion with the same nutrients (nutrients are never created)', () => {
    const sim = makeSourceSim();
    const it = spawnItem(sim, { kind: 'corpse', pos: centre(sim), init: { c: 0.05, p: 0.4, bulk: 0.5 } });
    const id = carrionFromItem(sim, it.id);
    const s = sim.stores.sources.get(id);
    expect(s?.variant).toBe('insect-small');
    expect([s?.units, s?.unitBulk, s?.c, s?.p]).toEqual([1, 0.5, 0.05, 0.4]);
    expect(sim.stores.items.get(it.id)).toBeUndefined();
    const carried = spawnItem(sim, { kind: 'corpse', pos: centre(sim), init: { carrierIds: [1] } });
    expect(carrionFromItem(sim, carried.id)).toBe(-1);
  });

  it('a herd film accepts overflow up to its cap and decays (T2)', () => {
    const sim = makeSourceSim();
    const film = spawnHerdFilm(sim, centre(sim), 7, 3);
    expect([film.herdId, film.plantId, film.units, film.capacity]).toEqual([7, 3, 0, 0.5]);
    expect(addToPool(sim, film.id, 0.8)).toBeCloseTo(0.5, 12);
    expect(film.pool).toBeCloseTo(0.5, 12);
    expect(film.decayPerGd).toBeGreaterThan(0);
  });

  it('windfalls and area clean-ups', () => {
    const sim = makeSourceSim();
    const c = centre(sim);
    const plum = spawnWindfall(sim, c, 'plum');
    expect(plum.units).toBe(20);
    createSource(sim, { variant: 'crumb-starch', pos: { x: c.x + 10, y: 0, z: c.z } });
    createSource(sim, { variant: 'crumb-starch', pos: { x: c.x + 400, y: 0, z: c.z } });
    expect(removeSourcesInArea(sim, c, 50, 'sweeping', (s) => s.kind === 'crumb')).toBe(1);
    expect(plum.alive).toBe(true);
  });

  it('cheat.spawnFood builds a catalogue source; a stage makes it follow the T2 carrion rules', () => {
    const sim = makeSourceSim();
    const p = centre(sim);
    sim.enqueue({ type: 'cheat.spawnFood', kind: 'carrion', variant: 'insect-medium', pos: p, units: 0, stage: 'ripe' });
    sim.enqueue({ type: 'cheat.spawnFood', kind: 'nectar', variant: null, pos: p, units: 0, stage: null });
    sim.applyPendingCommands();
    const live = sim.stores.sources.list.filter((s) => s.alive);
    expect(live.map((s) => s.variant)).toEqual(['insect-medium', 'flower']);
    expect([live[0].stage, live[0].p, live[0].unitBulk]).toEqual(['ripe', 4, 5]);
    expect(live[1].stage).toBeNull();
  });
});

describe('intake bookkeeping (diagnostics input)', () => {
  it('records what each source gave the colony today', () => {
    const sim = makeSourceSim();
    const c = centre(sim);
    const flower = createSource(sim, { variant: 'flower', pos: c });
    const ant = addWorker(sim, c);
    takeFromSource(sim, ant, flower.id, 10);
    recordDelivery(sim, ant.colony, flower.id, 0.5, 0);
    const rows = sourceIntake(sim, ant.colony);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sourceId: flower.id, kind: 'nectar', variant: 'flower', harvests: 1, deliveredC: 0.5 });
    expect(rows[0].harvestedC).toBeCloseTo(0.5, 12);
    stepTicks(sim, TICKS_PER_DAY);
    expect(sourceIntake(sim, ant.colony)).toHaveLength(0);
    expect(sourceIntake(sim, ant.colony, 'yesterday')).toHaveLength(1);
  });
});

/** Ecology-relevant state as a comparable string (typed arrays expanded). */
function snapshot(sim: ReturnType<typeof makeSourceSim>): string {
  return JSON.stringify({
    sources: sim.state.sources, items: sim.state.items, acc: Array.from(sim.state.ecology.carrionAcc),
    consumed: sim.state.worldDelta.consumedAnchors, rng: sim.state.rngStreams['rng.ecology'] ?? null, nextId: sim.state.nextId,
  });
}

function scenario(seed: number): ReturnType<typeof makeSourceSim> {
  const anchors = [
    ...Array.from({ length: 12 }, (_, i) => anchor('crumb', 100 + i * 30, 400)),
    anchor('nectar', 300, 300), anchor('honeydew', 500, 300), anchor('sugar', 700, 300),
  ];
  const sim = makeSourceSim({ anchors, world: makeTestWorld({ sizeBu: 600, seed }) });
  const ant = addWorker(sim, anchors[0].pos);
  const crumbs = sim.stores.sources.list.filter((s) => s.kind === 'crumb');
  for (let day = 0; day < 3; day++) {
    for (const s of crumbs) {
      while (s.alive) {
        takeFromSource(sim, ant, s.id, 1, { checkReach: false });
        ant.carry = { kind: 'none', id: -1 };
      }
    }
    stepTicks(sim, TICKS_PER_DAY);
  }
  return sim;
}

describe('determinism and plain data (acceptance 7, GDD 05 I1 / I10 / App. E 24)', () => {
  it('the same seed and actions give identical source state; another seed differs', () => {
    const first = snapshot(scenario(7));
    expect(snapshot(scenario(7))).toBe(first);
    expect(snapshot(scenario(8))).not.toBe(first);
  }, 30_000); // three 3-day full-tick runs: slow on a loaded machine

  it('source state is plain data with no NaN and no negative amounts', () => {
    const sim = scenario(3);
    expect(findNonPlain(sim.state.sources)).toEqual([]);
    expect(findNonPlain(sim.state.ecology)).toEqual([]);
    for (const s of sim.state.sources) {
      for (const v of [s.units, s.capacity, s.c, s.p, s.toxin, s.water, s.quality, s.slots]) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      }
      expect(s.units).toBeLessThanOrEqual(s.capacity + 1e-9);
    }
    for (const it of sim.state.items) expect(it.c >= 0 && it.p >= 0).toBe(true);
  });

  it('a save/load round trip (structured clone) continues identically', () => {
    const a = scenario(5);
    const b = createSim(structuredClone(a.state), a.world, { systems: [sourcesSystem] }); // what restore does
    stepTicks(a, TICKS_PER_DAY);
    stepTicks(b, TICKS_PER_DAY);
    expect(snapshot(b)).toBe(snapshot(a));
  }, 30_000);
});
