// Stage 1B integration gate (int-1B-sim): the cross-module seams this gate connected, one test each.
import { afterEach, describe, expect, it } from 'vitest';
import type { Ant, Sim } from '@/sim/types';
import { idleIntent, taskIndex } from '@/sim/types';
import { HEALTH_REGEN_ELSEWHERE, HEALTH_REGEN_IN_NEST } from '@/sim/balance/colony';
import { odourRadiusMm } from '@/sim/ecology';
import { herdTendDemand } from '@/sim/ecology/plants/demand';
import { addHerd, plantSim } from '@/sim/ecology/plants/testkit';
import { herdSourceOf } from '@/sim/ecology/plants/links';
import { colonySlotBit } from '@/sim/entities';
import { placeOnSurface } from '@/sim/locomotion';
import { integratePossessedFrame, possessedPose } from '@/sim/locomotion/possessed';
import { registerMovementOverride } from '@/sim/locomotion/runtime';
import { perceiveNow, smelledSource } from '@/sim/ants/perception';
import { fleeBehaviour } from '@/sim/ants/behaviours/outdoor/fleeTask';
import { feedQueenFromReserve } from '@/sim/colony/queen';
import { computeDemand, tendKeep } from '@/sim/colony/allocation/demand';
import { censusOf } from '@/sim/colony/census';
import { SYSTEMS } from '@/sim/systems';
import { TICKS_PER_DAY } from '@/sim/time';
import { makeTestSim } from '@/sim/testing';

let restoreFns: (() => void)[] = [];
afterEach(() => { for (const f of restoreFns) f(); restoreFns = []; });

const workers = (sim: Sim): Ant[] => sim.state.ants.filter((a) => a.alive && a.caste === 'worker');

describe('gate 1B seams', () => {
  it('a source raised above the ground (flower head) is smelled in plan view from the ground below it', () => {
    const sim = makeTestSim({ sizeBu: 200, nest: 'small', workers: 1, systems: [] });
    const bu = sim.world.bu, ant = workers(sim)[0];
    placeOnSurface(sim, ant, { x: 60 * bu, y: 0, z: 60 * bu });
    ant.nestId = -1; ant.chamberId = -1;
    const n = sim.state.sources.length;
    sim.enqueue({ type: 'cheat.spawnFood', kind: 'sugar', variant: 'sugar-granules', pos: { x: 64 * bu, y: 0, z: 60 * bu }, units: 50, stage: null });
    sim.applyPendingCommands();
    const s = sim.state.sources[n];
    s.pos.y += 25 * bu; // as a flower head on a 25 BU stem
    expect(odourRadiusMm(s, bu)).toBeLessThan(25 * bu); // in 3D the ant on the ground would be out of range
    sim.index.refresh();
    perceiveNow(sim, ant);
    expect(smelledSource(ant)).toBe(s.id);
    placeOnSurface(sim, ant, { x: 64 * bu - odourRadiusMm(s, bu) - 2 * bu, y: 0, z: 60 * bu });
    sim.index.refresh();
    perceiveNow(sim, ant);
    expect(smelledSource(ant)).toBe(-1);
  });

  it('flee hands a badly hurt ant back as rest, a lightly hurt one as idle (GDD 02 §10.13)', () => {
    const sim = makeTestSim({ nest: 'small', workers: 2, systems: [] });
    const [a, b] = workers(sim);
    a.hp = 0.2 * a.maxHp; b.hp = 0.6 * b.maxHp;
    for (const x of [a, b]) { x.task = 'flee'; fleeBehaviour.enter(sim, x); fleeBehaviour.update(sim, x); }
    expect(a.task).toBe('rest');
    expect(b.task).toBe('idle');
  });

  it('feedQueenFromReserve refuses unless the colony rations (S2..S4), whoever calls it (GDD 02 §5.7)', () => {
    const sim = makeTestSim({ nest: 'small', workers: 1, systems: [] });
    const col = sim.state.colonies[0], w = workers(sim)[0];
    const q = sim.stores.ants.get(col.queenId)!;
    if (q.queen) { q.queen.founding = null; q.queen.gut.c = 0; q.queen.gut.p = 0; }
    w.energy = 0.3;
    col.starvationStage = 'fed';
    expect(feedQueenFromReserve(sim, w, 0.1)).toBe(0);
    expect(w.energy).toBe(0.3);
    col.starvationStage = 'rationing';
    expect(feedQueenFromReserve(sim, w, 0.1)).toBeCloseTo(0.1, 9);
  });

  it('workers regenerate health at 0.25 / gd in the nest with crop C, 0.1 / gd with an empty crop (GDD 05 §4.7)', () => {
    const sim = makeTestSim({ nest: 'small', workers: 2, systems: SYSTEMS });
    const col = sim.state.colonies[0];
    sim.enqueue({ type: 'cheat.addFood', colonyId: col.id, c: 50, p: 20, toxin: 0 });
    sim.tick();
    const [a, b] = workers(sim);
    a.hp = 0.5 * a.maxHp; b.hp = 0.5 * b.maxHp;
    const ticks = TICKS_PER_DAY / 10;
    for (let i = 0; i < ticks; i++) {
      a.cropC = Math.max(a.cropC, 0.2); b.cropC = 0; a.fatigue = b.fatigue = 0; a.nestId = b.nestId = Math.max(0, a.nestId);
      sim.tick();
    }
    const gain = (x: Ant) => (x.hp / x.maxHp - 0.5) / 0.1; // per gd
    expect(gain(a)).toBeGreaterThan(HEALTH_REGEN_IN_NEST * 0.8);
    expect(gain(a)).toBeLessThan(HEALTH_REGEN_IN_NEST * 1.2);
    expect(gain(b)).toBeGreaterThan(HEALTH_REGEN_ELSEWHERE * 0.7);
    expect(gain(b)).toBeLessThan(HEALTH_REGEN_ELSEWHERE * 1.3);
  });

  it('colony allocation computes the tend demand from the colony\'s herds (no plants-side adapter)', () => {
    const { sim, plants } = plantSim({ workers: 6 });
    const col = sim.state.colonies[0];
    const h = addHerd(sim, plants[0], 120);
    herdSourceOf(sim, h)!.discoveredBy |= colonySlotBit(sim, col.id);
    const d = computeDemand(sim, col, censusOf(sim, col.id));
    // R39 (direction 26 item 1, after this test was written): tenders follow the carbohydrate the colony wants, at most
    // the herds' slots and at least their keep while the surface is workable (restated gate-sim-2; was "= the slots")
    expect(d[taskIndex('tend')]).toBeLessThanOrEqual(herdTendDemand(sim, col.id));
    expect(d[taskIndex('tend')]).toBeGreaterThanOrEqual(Math.min(herdTendDemand(sim, col.id), tendKeep(h.a)));
    expect(d[taskIndex('tend')]).toBeGreaterThan(0);
  });

  it('the per-frame prediction holds a possessed ant that a movement override moves (no twitch when pinned)', () => {
    const sim = makeTestSim({ nest: 'small', workers: 1 });
    const w = workers(sim)[0];
    sim.enqueue({ type: 'possess', antId: w.id });
    sim.tick();
    restoreFns.push(registerMovementOverride(sim, (_s, walker) => walker === w)); // pinned: the override holds it
    sim.setPlayerIntent({ ...idleIntent(), dir: { x: 1, y: 0, z: 0 }, hurry: true });
    sim.tick();
    const at = { ...w.pos };
    for (let i = 0; i < 5; i++) integratePossessedFrame(sim, w, 0.05);
    const p = possessedPose(sim)!;
    expect(Math.hypot(p.pos.x - at.x, p.pos.y - at.y, p.pos.z - at.z)).toBeLessThan(1e-6);
  });
});
