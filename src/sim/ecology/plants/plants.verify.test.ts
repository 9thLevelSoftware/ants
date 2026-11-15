// Reviewer tests (ecology-plants): edge cases and Appendix E checks through the real tick loop. A failing test here
// demonstrates a defect for the fixer; passing ones stay as regression tests.

import { afterEach, describe, expect, it } from 'vitest';
import type { Ant, Sim, SimEvent } from '@/sim/types';
import { spawnAnt } from '@/sim/entities';
import { placeOnSurface } from '@/sim/locomotion';
import { DEFAULT_DAYS_PER_YEAR, TICKS_PER_DAY, TICKS_PER_HOUR, currentHour, currentDefaultYearDay } from '@/sim/time';
import { herdDamage } from './disturb';
import { herdSourceOf } from './links';
import { plantCommandHandlers } from './commands';
import { releaseDroplet } from './droplet';
import { runPlantsHour, runTendingStep } from './system';
import { addHerd, fixWeather, plantSim, setD28, stepTicks } from './testkit';

let restore: (() => void) | null = null;
afterEach(() => { restore?.(); restore = null; });

function events(sim: Sim, type: string): SimEvent[] {
  const out: SimEvent[] = [];
  sim.events.on(type as never, ((e: SimEvent) => out.push(e)) as never);
  return out;
}

function standingTender(sim: Sim, colonyId: number, at: { x: number; y: number; z: number }): Ant {
  const p = { x: at.x - 0.3 * sim.world.bu, y: at.y, z: at.z };
  const a = spawnAnt(sim, { colony: colonyId, caste: 'worker', pos: p, fwd: { x: 0, y: 1, z: 0 }, ageGd: 8 });
  placeOnSurface(sim, a, p, { x: 1, y: 0, z: 0 });
  a.task = 'tend';
  a.thinkTick = Number.MAX_SAFE_INTEGER;
  return a;
}

describe('claims follow the herd', () => {
  it('a collapsed herd is removed from the claiming colony\'s honeydew.herdClaims', () => {
    restore = fixWeather(20);
    const { sim, plants } = plantSim({ workers: 1 });
    const col = sim.state.colonies[0];
    const h = addHerd(sim, plants[0], 40);
    standingTender(sim, col.id, herdSourceOf(sim, h)!.pos);
    stepTicks(sim, 10);
    runTendingStep(sim, 1);
    expect(h.tenderColony).toBe(col.id);
    expect(col.honeydew!.herdClaims).toContain(h.id);
    herdDamage(sim, h.id, 1000);
    setD28(sim, 9);
    runPlantsHour(sim, 1 / 24);
    sim.events.flush();
    expect(h.alive).toBe(false);
    // the claim list must not keep dead herds (diag/UI/GDD 07 module state read it)
    expect(col.honeydew!.herdClaims).not.toContain(h.id);
  });
});

describe('cheat input hygiene (invariant I1: no NaN)', () => {
  it('cheat.spawnHerd with a missing aphid count does not create a NaN herd', () => {
    restore = fixWeather(20);
    const { sim, plants } = plantSim({ systems: [] });
    const before = sim.stores.herds.list.length;
    // the debug API passes JSON through; an omitted field arrives as undefined
    plantCommandHandlers['cheat.spawnHerd']!(sim, { type: 'cheat.spawnHerd', plantId: plants[0].id } as never);
    const made = sim.stores.herds.list.slice(before).filter((h) => h.alive);
    for (const h of made) {
      runTendingStep(sim, 1);
      runPlantsHour(sim, 1 / 24);
      expect(Number.isFinite(h.a)).toBe(true);
      expect(Number.isFinite(h.pool)).toBe(true);
    }
  });

  it('herdDamage ignores NaN, negative and missing herds; releaseDroplet ignores non-herd targets', () => {
    const { sim, plants } = plantSim({ systems: [], workers: 1 });
    const h = addHerd(sim, plants[0], 30);
    expect(herdDamage(sim, h.id, Number.NaN)).toBe(0);
    expect(herdDamage(sim, h.id, -5)).toBe(0);
    expect(herdDamage(sim, 99_999, 5)).toBe(0);
    expect(h.a).toBe(30);
    const film = sim.stores.sources.get(h.filmSourceId)!;
    const ant = sim.state.ants.find((a) => a.alive && a.caste === 'worker')!;
    h.pool = 2;
    expect(releaseDroplet(sim, ant.id, { kind: 'source', id: film.id, pos: film.pos })).toBe(0);
    expect(h.pool).toBe(2);
  });

  it('a droplet never overfills the crop and never makes the pool negative', () => {
    const { sim, plants } = plantSim({ systems: [], workers: 1 });
    const h = addHerd(sim, plants[0], 30);
    const src = herdSourceOf(sim, h)!;
    const ant = sim.state.ants.find((a) => a.alive && a.caste === 'worker')!;
    ant.cropC = ant.cropCap - 0.05;
    h.pool = 1;
    const v = releaseDroplet(sim, ant.id, { kind: 'source', id: src.id, pos: src.pos });
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(0.15);
    expect(ant.cropC + ant.cropP).toBeLessThanOrEqual(ant.cropCap + 1e-9);
    expect(h.pool).toBeCloseTo(1 - v, 9);
  });
});

describe('GDD 05 App. E 5 through the real tick loop', () => {
  it('E = 10 on day 28 23:00 -> A = 8 at day 1 07:00 (systems, not the hourly function directly)', () => {
    restore = fixWeather(20);
    const { sim, plants } = plantSim();
    const h = addHerd(sim, plants[0], 0, { e: 10 });
    setD28(sim, DEFAULT_DAYS_PER_YEAR - 1 + 23 / 24);
    expect(Math.round(currentHour(sim.state))).toBe(23);
    stepTicks(sim, 8 * TICKS_PER_HOUR);
    expect(currentDefaultYearDay(sim.state)).toBeLessThan(1);
    expect(Math.round(currentHour(sim.state))).toBe(7);
    expect(h.alive).toBe(true);
    expect(h.a).toBeGreaterThanOrEqual(8);
    expect(h.a).toBeLessThan(8.5);
  });

  it('a herd crossing into winter keeps one source and one film (no re-creation churn)', () => {
    restore = fixWeather(20);
    const { sim, plants } = plantSim();
    const h = addHerd(sim, plants[0], 60);
    const src0 = herdSourceOf(sim, h)!.id, film0 = h.filmSourceId;
    setD28(sim, 20.8);
    sim.events.flush(); // the creation events of addHerd
    const spawned = events(sim, 'food-source-spawned');
    stepTicks(sim, Math.round(0.5 * TICKS_PER_DAY));
    expect(currentDefaultYearDay(sim.state)).toBeGreaterThan(21);
    expect(h.alive).toBe(true);
    expect(h.a).toBe(0);
    expect(h.e).toBeGreaterThan(0);
    expect(herdSourceOf(sim, h)?.id).toBe(src0);
    expect(h.filmSourceId).toBe(film0);
    expect(spawned.map((e) => JSON.stringify(e))).toEqual([]);
  });
});
