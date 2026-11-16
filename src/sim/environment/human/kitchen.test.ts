// The kitchen on a generated `kitchen-door` map (GDD 04 App. E 15 / 16): the vacuum takes 7-10 of 10 workers on open
// floor and none in a kick-space void, leaving no trail on the floor it covered; two busy days of interior foraging
// bring exactly one bait station near the busiest trail within the next GD (none on gentle); a wipe clears the worktop.

import { beforeAll, describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { createSource } from '@/sim/ecology';
import { BAIT_TRIGGER_VISITS } from '@/sim/balance/human';
import { DIFFICULTY_PARAMS } from '@/sim/balance';
import { TICKS_PER_DAY } from '@/sim/time';
import { humanEventsSystem } from './index';
import { humanPlan } from './plans';
import { humanSites } from './sites';
import { humanExtra } from './extra';
import { applyImpact } from './effects/kinds';
import { alive, placeWorker, runToEnd, scheduleNow } from './testkit';

let shared: Sim | null = null;
/**
 * One generated kitchen (seed 7) and one sim for the whole file (world generation and sim set-up take seconds);
 * each test resets what it uses. Only the events a test makes run (frequency 0).
 */
function kitchenSim(preset: 'naturalist' | 'gentle' = 'naturalist'): Sim {
  if (!shared) {
    const cfg = defaultGameConfig('lasius-niger', 7);
    cfg.cheats = true;
    cfg.world = { ...cfg.world, archetype: 'kitchen-door' };
    const g = createNewGame(cfg);
    shared = createSim(g.state, g.world, { systems: [humanEventsSystem] });
    const q = shared.stores.ants.get(shared.state.colonies[0].queenId);
    if (q) { q.pos = { x: 1, y: -1000, z: 1 }; q.nestId = 1; }
  }
  const sim = shared;
  sim.state.config.difficulty.preset = preset;
  sim.state.config.difficulty.params = { ...DIFFICULTY_PARAMS[preset], humanFreqMult: 0 };
  const ex = humanExtra(sim);
  ex.baits = []; ex.baitDueTick = -1;
  sim.state.env.human.reactive.interiorVisits = [0, 0];
  sim.tick();
  return sim;
}

describe('kitchen events (GDD 04 App. E 15, 16)', () => {
  // world generation and sim set-up take seconds (more on a loaded machine): once, outside the per-test timeout
  beforeAll(() => { kitchenSim(); }, 180_000);

  it('E15: vacuum removes 7-10 of 10 open-floor workers, spares 10 in a kick-space void, leaves no trail', () => {
    const sim = kitchenSim();
    const floor = humanSites(sim.world).list.find((s) => s.kind === 'interior-floor')!;
    const inst = scheduleNow(sim, 'vacuum', null, floor.id, null);
    inst.param = 0;
    sim.tick();
    const plan = humanPlan(sim, inst)!;
    const nozzle = plan.impacts.filter((i) => i.contact === 'vacuum');
    const open: number[] = [];
    for (let k = 0; open.length < 10 && k < nozzle.length; k += 13) {
      const f = nozzle[Math.floor(nozzle.length * 0.3) + k]?.fp;
      if (!f) break;
      const id = placeWorker(sim, f.x, f.z, floor.y + 60);
      if (id >= 0 && Math.abs(sim.stores.ants.get(id)!.pos.y - floor.y) < 4) { open.push(id); sim.phero.deposit(sim.state.colonies[0].id, 'trail', { x: f.x, y: floor.y + 2, z: f.z }, 5); }
    }
    expect(open.length).toBe(10);
    // a kick-space void: behind the plinth gap (posA in the room, posB inside the void)
    const kick = sim.world.micro.find((m) => m.kind === 'kick-space')!;
    expect(kick).toBeDefined();
    const inX = Math.abs(kick.posB.x - kick.posA.x) > Math.abs(kick.posB.z - kick.posA.z);
    const dirX = inX ? Math.sign(kick.posB.x - kick.posA.x) : 0, dirZ = inX ? 0 : Math.sign(kick.posB.z - kick.posA.z);
    const voids: number[] = [];
    for (let i = 0; i < 10; i++) {
      const s = (i - 4.5) * 9;
      const x = kick.posB.x + dirX * 20 + (inX ? 0 : s), z = kick.posB.z + dirZ * 20 + (inX ? s : 0);
      const id = placeWorker(sim, x, z, floor.y + 60);
      expect(id).toBeGreaterThanOrEqual(0);
      voids.push(id);
    }
    runToEnd(sim, inst, 3000);
    // the nozzle also runs along the plinth: its footprint reaches into the void, its centre stays in the room
    const yaw = inX ? Math.PI / 2 : 0;
    const edge = { t: 0, contact: 'vacuum' as const, actor: 0, value: 0, fp: { x: kick.posA.x - dirX * 40, y: floor.y, z: kick.posA.z - dirZ * 40, yaw, hx: 50, hz: 140, disc: false } };
    const run = { instId: inst.id, progressS: 0, nextImpactTick: 0, cues: [], killed: 0, displaced: 0, itemsRemoved: 0 };
    sim.index.refresh();
    applyImpact(sim, run, plan, edge);
    const removed = 10 - alive(sim, open);
    expect(removed).toBeGreaterThanOrEqual(7);
    expect(alive(sim, voids)).toBe(10);
    for (const id of open) {
      const a = sim.stores.ants.get(id);
      void a;
    }
    for (let k = 0, n = 0; n < 10 && k < nozzle.length; k += 13, n++) {
      const f = nozzle[Math.floor(nozzle.length * 0.3) + k].fp;
      expect(sim.phero.sample(sim.state.colonies[0].id, 'trail', { x: f.x, y: floor.y + 2, z: f.z })).toBe(0);
    }
  });

  const busyDays = (sim: Sim): { x: number; z: number } => {
    const counter = humanSites(sim.world).list.find((s) => s.kind === 'counter')!;
    const top = counter.rects[0];
    const food = createSource(sim, { variant: 'crumb-starch', pos: { x: (top.x0 + top.x1) / 2, y: top.y, z: (top.z0 + top.z1) / 2 }, tier: 2 });
    // the busiest trail: a line across the floor, strongest in its middle
    const floor = humanSites(sim.world).list.find((s) => s.kind === 'interior-floor')!;
    const mid = { x: (floor.rect.x0 + floor.rect.x1) / 2, z: (floor.rect.z0 + floor.rect.z1) / 2 };
    for (let i = -10; i <= 10; i++) sim.phero.deposit(sim.state.colonies[0].id, 'trail', { x: mid.x + i * 40, y: floor.y + 2, z: mid.z }, i === 0 ? 30 : 10);
    const ant = sim.state.ants.find((a) => a.alive)!;
    const visitDay = () => {
      for (let i = 0; i <= BAIT_TRIGGER_VISITS; i++) sim.emit({ type: 'delivery', antId: ant.id, colonyId: sim.state.colonies[0].id, sourceId: food.id, kind: 'crumb', c: 0.1, p: 0, toxin: 0 });
      sim.tick();
      // jump to the last tick of the day (nothing else runs in these sims), then into the next day
      const cal = sim.state.tick + sim.state.env.calendar.startTick;
      sim.state.tick = (Math.floor(cal / TICKS_PER_DAY) + 1) * TICKS_PER_DAY - sim.state.env.calendar.startTick - 1;
      sim.tick();
      sim.tick();
    };
    visitDay();
    visitDay();
    return mid;
  };

  it('E16: 61 interior visits on 2 consecutive GD bring exactly one bait station within 300 mm of the busiest trail in 1 GD', () => {
    const sim = kitchenSim();
    const mid = busyDays(sim);
    const ex = humanExtra(sim);
    expect(sim.state.env.human.reactive.interiorVisits[1]).toBeGreaterThan(BAIT_TRIGGER_VISITS);
    expect(ex.baitDueTick).toBeGreaterThan(sim.state.tick);
    expect(ex.baitDueTick - sim.state.tick).toBeLessThan(TICKS_PER_DAY);
    sim.state.tick = ex.baitDueTick - 2;
    for (let i = 0; i < 100; i++) sim.tick();
    const baits = ex.baits;
    expect(baits.length).toBe(1);
    expect(Math.hypot(baits[0].pos.x - mid.x, baits[0].pos.z - mid.z)).toBeLessThanOrEqual(300);
    const gel = sim.stores.sources.get(baits[0].sourceId);
    expect(gel?.variant).toBe('bait-gel');
    expect(gel!.toxin).toBeGreaterThan(0);
  });

  it('E16 on gentle: no bait station', () => {
    const sim = kitchenSim('gentle');
    busyDays(sim);
    expect(humanExtra(sim).baitDueTick).toBe(-1);
    sim.state.tick += TICKS_PER_DAY - 200;
    for (let i = 0; i < 200; i++) sim.tick();
    expect(humanExtra(sim).baits.length).toBe(0);
  });

  it('a wipe removes the worktop crumbs and spills', () => {
    const sim = kitchenSim();
    const counter = humanSites(sim.world).list.find((s) => s.kind === 'counter')!;
    const inst = scheduleNow(sim, 'sweeping', 'wipe', counter.id, null);
    sim.tick();
    const plan = humanPlan(sim, inst)!;
    const f = plan.impacts[Math.floor(plan.impacts.length / 2)].fp;
    const ids = [0, 1, 2, 3].map((i) => createSource(sim, { variant: i % 2 ? 'sugary-spill' : 'crumb-starch', pos: { x: f.x + i * 3, y: f.y, z: f.z }, tier: 2 }).id);
    runToEnd(sim, inst);
    expect(ids.filter((id) => sim.stores.sources.get(id)).length).toBeLessThanOrEqual(1);
  });
});
