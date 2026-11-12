// AC8: cost of the colony systems with 1,500 ants and 600 brood, measured per tick (the scripted care fake that
// stands in for nurses is excluded from the measurement). The colony API that behaviours call per ant and tick
// is included: 300 waiting foragers ask shouldDepart every tick, as beh-forage will.

import { describe, expect, it } from 'vitest';
import { heavyLoad } from '@/sim/testing/perfLoad';
import type { System } from '@/sim/types';
import { TASKS } from '@/sim/types';
import { createSim } from '@/sim/sim';
import { makeTestSim } from '@/sim/testing';
import { commandsSystem } from '@/sim/systems';
import {
  allocationSystem, broodSystem, colonyDiagnosticsSystem, colonyStatsSystem, economySystem, queenSystem,
  taskReevalSystem,
} from './colonySystems';
import { addBrood, addChamber, addWorkers, careSystem, colonyOf, establishQueen } from './testkit';
import { setClimateOverride } from './envAdapter';
import { shouldDepart } from './activation';

/** Stand-in for beh-forage's wait state: every waiting forager asks shouldDepart each tick. */
/** AC8 budget of the colony systems, CPU ms per tick (strict). */
const CPU_BUDGET_MS = 0.35;

const waitingForagers: System = {
  name: 'perf-forage-wait', phase: 'behaviours',
  run(sim) {
    for (const a of sim.stores.ants.list) if (a.alive && a.state === 'forage.wait') shouldDepart(sim, a);
  },
};

/** Process CPU time (Node; vitest runs each test file in its own process). */
const cpuUsage = (prev?: { user: number; system: number }): { user: number; system: number } =>
  (globalThis as unknown as { process: { cpuUsage(p?: { user: number; system: number }): { user: number; system: number } } }).process.cpuUsage(prev);

describe('colony systems performance (AC8)', () => {
  it('1,500 ants + 600 brood cost under 0.35 ms per tick on average (load-tolerant; strict with FOUNDRESS_PERF_STRICT=1)', { timeout: 120000 }, () => {
    let spent = 0, cpu = 0;
    const per: Record<string, number> = {};
    const timed = (s: System): System => ({
      ...s,
      run: (sim) => {
        const c0 = cpuUsage();
        const t0 = performance.now();
        s.run(sim);
        const dt = performance.now() - t0;
        const c1 = cpuUsage(c0);
        spent += dt;
        cpu += (c1.user + c1.system) / 1000;
        per[s.name] = (per[s.name] ?? 0) + dt;
      },
    });
    const colonySystems = [allocationSystem, taskReevalSystem, queenSystem, broodSystem, economySystem, colonyStatsSystem, colonyDiagnosticsSystem];
    const base = makeTestSim({ seed: 3, config: { startSeason: 'summer', startDayOfSeason: 2, startHour: 0 } });
    const sim = createSim(base.state, base.world, {
      systems: [
        commandsSystem, ...colonySystems.map(timed), timed(waitingForagers),
        careSystem({ tend: true, feedLarvae: true, assist: true, feedQueen: true, lay: true }),
      ],
    });
    setClimateOverride(sim, { chamberTemp: () => 25, pointTemp: () => 25, rh: () => 0.8, surfaceActivity: () => 1 });
    const nursery = addChamber(sim, 'nursery', { x: 100, y: -40, z: 100 }, 400);
    addChamber(sim, 'food', { x: 160, y: -40, z: 100 }, 600);
    establishQueen(sim, nursery);
    for (let i = 0; i < 1500; i++) {
      const [a] = addWorkers(sim, 1, { chamber: i % 5 === 0 ? null : nursery, ageGd: i % 25, task: TASKS[(i * 7) % 12] });
      a.state = i % 3 === 0 ? 'forage.outbound' : 'idle';
    }
    // 300 foragers waiting in the nest between trips.
    let waiting = 0;
    for (const a of sim.stores.ants.list) {
      if (waiting < 300 && a.alive && a.caste === 'worker' && a.nestId !== -1 && a.task !== 'rest') {
        a.task = 'forage'; a.state = 'forage.wait'; waiting++;
      }
    }
    // Brood starts a little above 600 and the queen keeps laying, so the measured blocks hold about 600.
    addBrood(sim, 'egg', 230, nursery, 0.2);
    addBrood(sim, 'larva', 230, nursery, 0.2);
    addBrood(sim, 'pupa', 230, nursery, 0.2);
    sim.enqueue({ type: 'cheat.addFood', colonyId: colonyOf(sim).id, c: 1000, p: 400, toxin: 0 });
    for (let i = 0; i < 600; i++) sim.tick(); // warm-up (JIT, first allocation and diagnostics passes)
    // The machine is shared with other jobs: measure 6 blocks of 500 ticks and use the median block, so a burst
    // of foreign load in one block does not decide the result. The mean over all blocks is reported too.
    const ticks = 500;
    const blocks: number[] = [];
    let total = 0, broodSum = 0;
    for (const k of Object.keys(per)) per[k] = 0;
    cpu = 0;
    for (let k = 0; k < 6; k++) {
      spent = 0;
      for (let i = 0; i < ticks; i++) sim.tick();
      broodSum += sim.stores.brood.count;
      blocks.push(spent / ticks);
      total += spent;
    }
    blocks.sort((x, y) => x - y);
    const perTick = (blocks[2] + blocks[3]) / 2;
    const meanPerTick = total / (6 * ticks);
    const cpuPerTick = cpu / (6 * ticks);
    const brood = broodSum / 6;
    // eslint-disable-next-line no-console
    console.log(`colony systems: CPU ${cpuPerTick.toFixed(4)} ms per tick; wall median ${perTick.toFixed(4)} (mean ${meanPerTick.toFixed(4)}, best block ${blocks[0].toFixed(4)}) with ${sim.stores.ants.count} ants and ${brood.toFixed(0)} brood (mean of blocks)`, Object.fromEntries(Object.entries(per).map(([k, v]) => [k, +(v / (6 * ticks)).toFixed(4)])));
    expect(sim.stores.ants.count).toBeGreaterThanOrEqual(1500);
    expect(brood).toBeGreaterThanOrEqual(570);
    // CPU time is the cost measure: wall time on this shared machine includes time slices given to other jobs.
    // Even CPU time inflates on a saturated machine (shared caches, hyper-threads): under heavy load the budget is
    // load-tolerant (x3); FOUNDRESS_PERF_STRICT=1 always asserts the budget itself.
    expect(cpuPerTick).toBeLessThan(heavyLoad() ? 3 * CPU_BUDGET_MS : CPU_BUDGET_MS);
  });
});
