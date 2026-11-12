// Flee (GDD 02 §10.12, Tier 1 triggers of the task spec): alarm pheromone and a looming human event make an outdoor
// ant run, freeze and re-check, at most three cycles, then resume its task (laden ants go home).

import { describe, expect, it } from 'vitest';
import type { Ant, Sim } from '@/sim/types';
import { ALARM_STRONG } from '@/sim/balance';
import { requestTask } from '@/sim/colony';
import { SYSTEMS } from '@/sim/systems';
import { makeTestSim } from '@/sim/testing';
import { K, PHASE } from './keys';
import { announce } from './testkit';

function outbound(): { sim: Sim; ant: Ant } {
  const sim = makeTestSim({
    sizeBu: 400, nest: 'small', workers: 2, seed: 5, systems: SYSTEMS.filter((s) => s.phase !== 'colony-allocation'),
    config: { startSeason: 'summer', startDayOfSeason: 2, startHour: 10 },
  });
  const col = sim.state.colonies[0];
  const e = sim.stores.nests.get(col.nestIds[0])!.entrances[0];
  sim.enqueue({ type: 'cheat.addFood', colonyId: col.id, c: 3, p: 0.5, toxin: 0 });
  sim.enqueue({ type: 'cheat.spawnFood', kind: 'sugar', variant: 'sugar-granules', pos: { x: e.pos.x + 120 * sim.world.bu, y: 0, z: e.pos.z }, units: 50, stage: null });
  sim.applyPendingCommands();
  announce(sim, col, sim.state.sources[sim.state.sources.length - 1]);
  const ant = sim.state.ants.find((a) => a.caste === 'worker')!;
  requestTask(sim, ant, 'forage', 'job:test');
  for (let t = 0; t < 4000 && !(ant.nestId < 0 && ant.bb[K.phase] === PHASE.outbound && Math.hypot(ant.pos.x - e.pos.x, ant.pos.z - e.pos.z) > 30 * sim.world.bu); t++) {
    if (ant.state === 'forage.wait') ant.activation = 1;
    sim.tick();
  }
  return { sim, ant };
}

describe('flee', () => {
  it('alarm where an outbound forager walks: run, freeze, re-check, then resume the trip', () => {
    const { sim, ant } = outbound();
    expect(ant.bb[K.phase]).toBe(PHASE.outbound);
    const seen: string[] = [];
    // an alarm spot just ahead, refreshed for a while (nobody fights in Tier 1, so the test lays it)
    const spot = { x: ant.pos.x + ant.fwd.x * 8, y: ant.pos.y, z: ant.pos.z + ant.fwd.z * 8 };
    const start = { ...ant.pos };
    for (let t = 0; t < 600; t++) {
      if (t < 50) sim.phero.deposit(-1, 'alarm', spot, ALARM_STRONG);
      sim.tick();
      if (seen[seen.length - 1] !== ant.state) seen.push(ant.state);
    }
    console.log('flee states:', seen.join(' -> '), `ran ${(Math.hypot(ant.pos.x - start.x, ant.pos.z - start.z) / sim.world.bu).toFixed(0)} BU`);
    expect(seen).toContain('flee.run');
    expect(seen).toContain('flee.freeze');
    expect(seen.filter((s) => s === 'flee.run').length).toBeLessThanOrEqual(3);
    const after = seen[seen.lastIndexOf('flee.freeze') + 1];
    expect(after === 'forage.outbound' || after === 'forage.return').toBe(true); // the task resumed
  }, 120000);

  it('a looming human event (shadow cue) makes it run away from the cue', () => {
    const { sim, ant } = outbound();
    const o = { x: ant.pos.x + 10, y: 0, z: ant.pos.z };
    sim.state.env.human.active.push({
      instId: 99, progressS: 0, nextImpactTick: sim.state.tick + 40,
      cues: [{ kind: 'shadow', origin: o, radiusMm: 80, intensity: 1, startTick: sim.state.tick, impactTick: sim.state.tick + 40 }],
    });
    const d0 = Math.hypot(ant.pos.x - o.x, ant.pos.z - o.z);
    let ran = false;
    for (let t = 0; t < 60; t++) { sim.tick(); if (ant.state === 'flee.run') ran = true; }
    const d1 = Math.hypot(ant.pos.x - o.x, ant.pos.z - o.z);
    console.log(`human cue: fled ${ran}, distance from the cue ${(d0 / sim.world.bu).toFixed(1)} -> ${(d1 / sim.world.bu).toFixed(1)} BU`);
    expect(ran).toBe(true);
    expect(d1).toBeGreaterThan(d0);
  }, 120000);
});
