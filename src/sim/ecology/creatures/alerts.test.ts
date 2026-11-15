// Alerts this module raises (GDD 05 App. C, GDD 08 §6.5) through the real progression alert engine:
// predator-near (warning) raised for a lurking predator near the possessed ant and cleared once that is over;
// nest-attacked (critical) for an invading centipede, cleared 30 s after it left. Plus the bird's extra effects:
// a sparrow eats up to 10 crumb units, a woodpecker asks the nest module for its throat carves.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Vec3 } from '@/core/math/vec3';
import { createSource } from '@/sim/ecology/sources';
import { spawnBrood } from '@/sim/entities';
import {
  BIRD_CRUMBS_MAX, NEST_ATTACKED_CLEAR_S, PREDATOR_NEAR_CLEAR_S, WOODPECKER_CARVES_MAX,
} from '@/sim/balance/creatures';
import { triggerBird } from './index';
import { eatCrumbs } from './bird';
import { triggerInvasion } from './invasion';
import { spawnKind } from './spawn';
import {
  creatureScene, installFakeCombat, placeWorker, possess, quietHistory, sendQueenAway, setClock, spawnAt, step,
} from './testkit';
import { ports } from './ports';

let restore: () => void;
beforeEach(() => { restore = installFakeCombat({ realAlerts: true }).restore; });
afterEach(() => restore());

const active = (sim: ReturnType<typeof creatureScene>, kind: string) => sim.state.progression.alerts.filter((a) => a.kind === kind);

describe('predator-near', () => {
  it('is raised (warning) while a wolf spider lurks within 15 BU of the possessed ant and cleared 30 s after', () => {
    const sim = creatureScene({ seed: 2, director: true });
    setClock(sim, 'summer', 3, 23);
    sendQueenAway(sim);
    const ant = placeWorker(sim, 200, 200);
    possess(sim, ant);
    const spider = spawnAt(sim, 'wolf-spider', 230, 200, { state: 'ambush', stateS: 300 });
    step(sim, 60);
    const a = active(sim, 'predator-near');
    expect(a.length).toBe(1);
    expect(a[0].level).toBe('warning');
    expect(a[0].subjectId).toBe(spider.id);
    // the spider gives up and rests far away: the alert clears after PREDATOR_NEAR_CLEAR_S
    spider.state = 'rest'; spider.stateTimer = 1e6;
    step(sim, PREDATOR_NEAR_CLEAR_S * 10 + 120);
    expect(active(sim, 'predator-near').length).toBe(0);
  });

  it('is cleared at once when the creature is gone', () => {
    const sim = creatureScene({ seed: 2, director: true });
    setClock(sim, 'summer', 3, 23);
    sendQueenAway(sim);
    possess(sim, placeWorker(sim, 200, 200));
    const spider = spawnAt(sim, 'wolf-spider', 230, 200, { state: 'ambush', stateS: 300 });
    step(sim, 60);
    expect(active(sim, 'predator-near').length).toBe(1);
    sim.stores.creatures.markDead(spider.id);
    sim.emit({ type: 'creature-died', id: spider.id, kind: spider.kind, cause: 'test' });
    step(sim, 2);
    expect(active(sim, 'predator-near').length).toBe(0);
  });
});

describe('nest-attacked', () => {
  it('a centipede invasion raises it as critical; it clears 30 s after the invader left', () => {
    const sim = creatureScene({ seed: 3, director: true, nest: 'small' });
    setClock(sim, 'summer', 3, 23);
    quietHistory(sim, 20);
    const nest = sim.state.nests[0];
    const ch = nest.chambers[0];
    spawnBrood(sim, { colony: nest.colony, stage: 'larva', destined: 'worker', nestId: nest.id, chamberId: ch.id, pos: { ...ch.center } });
    expect(triggerInvasion(sim, nest.colony, true, (p: Vec3) => spawnKind(sim, 'centipede', p, { state: 'prowl' }))).toBe(true);
    step(sim, 60);
    const a = active(sim, 'nest-attacked');
    expect(a.length).toBe(1);
    expect(a[0].level).toBe('critical');
    for (const c of sim.stores.creatures.list) if (c.kind === 'centipede') { sim.stores.creatures.markDead(c.id); sim.emit({ type: 'creature-died', id: c.id, kind: c.kind, cause: 'test' }); }
    step(sim, NEST_ATTACKED_CLEAR_S * 10 - 100);
    expect(active(sim, 'nest-attacked').length).toBe(1);
    step(sim, 200);
    expect(active(sim, 'nest-attacked').length).toBe(0);
  });
});

describe('bird variants (§2.6)', () => {
  it('a sparrow eats up to 10 crumb units near its landing point', () => {
    const sim = creatureScene({ seed: 4 });
    const a = createSource(sim, { variant: 'crumb-starch', pos: { x: 200, y: 0, z: 200 }, units: 6 });
    const b = createSource(sim, { variant: 'crumb-starch', pos: { x: 230, y: 0, z: 200 }, units: 8 });
    const far = createSource(sim, { variant: 'crumb-starch', pos: { x: 400, y: 0, z: 200 }, units: 8 });
    expect(eatCrumbs(sim, { x: 200, y: 0, z: 200 })).toBe(BIRD_CRUMBS_MAX);
    expect(a.alive).toBe(false);
    expect(b.units).toBe(4);
    expect(far.units).toBe(8);
  });

  it('a woodpecker asks the nest module for a 3 BU carve at the entrance every 5 s, at most 6', () => {
    const sim = creatureScene({ seed: 5, nest: 'small' });
    setClock(sim, 'summer', 3, 12);
    quietHistory(sim, 20);
    const carves: { p: Vec3; r: number; cause: string }[] = [];
    ports.disturbNest = (_s, p, r, cause) => { carves.push({ p, r, cause }); };
    const e = sim.state.nests[0].entrances[0].pos;
    for (let i = 0; i < 20; i++) placeWorker(sim, e.x + 10 + (i % 5) * 6, e.z + Math.floor(i / 5) * 6);
    expect(triggerBird(sim, 'woodpecker', { x: e.x, y: e.y, z: e.z }, true)).toBe(true);
    step(sim, 30 + 400);
    expect(carves.length).toBeGreaterThan(0);
    expect(carves.length).toBeLessThanOrEqual(WOODPECKER_CARVES_MAX);
    expect(carves.every((c) => c.cause === 'woodpecker' && Math.abs(c.r - 3 * sim.world.bu) < 1e-9)).toBe(true);
    expect(Math.hypot(carves[0].p.x - e.x, carves[0].p.z - e.z)).toBeLessThan(1e-6);
  });
});
