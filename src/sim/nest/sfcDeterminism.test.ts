// sim-fix-colony acceptance 6: the state this task added (a mound relaxation in progress, partly tamped pellets and
// their retry clock, the colony's midden-blocked flag and report tick) is deterministic and survives a save / load:
// a run saved and restored in the middle ends in the same state hash as an uninterrupted one.
import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { PELLET_TAMP_S } from '@/sim/balance/nest';
import { createSim } from '@/sim/sim';
import { restore, snapshot, stateHash } from '@/sim/save';
import { commandsSystem } from '@/sim/systems';
import { TICKS_PER_SECOND } from '@/sim/time';
import { economySystem, isMiddenBlocked } from '@/sim/colony';
import { spawnAnt } from '@/sim/entities';
import { internalDumpSite } from './deadEnd';
import { nestSim, playerNest } from './nestTestKit';
import { loosePellets, placePellet, spawnPellet } from './pellets';
import { nestSystem } from './system';

const BU = 4;
const SYSTEMS = [commandsSystem, nestSystem, economySystem];

/** The small nest with five workers, a heap of old spoil at the blind branch's tip and fresh soil around the mouth. */
function scene(): Sim {
  const sim = nestSim({ nest: 'small', seed: 9, systems: SYSTEMS });
  const nest = playerNest(sim);
  const food = nest.chambers.find((c) => c.type === 'food')!;
  for (let n = 0; n < 5; n++) {
    spawnAnt(sim, { colony: nest.colony, caste: 'worker', pos: { ...food.center }, ageGd: 5, nestId: nest.id, chamberId: food.id });
  }
  const floor = internalDumpSite(sim, nest.id)!.pos; // the blind branch's tip: a 2 BU tunnel
  for (let n = 0; n < 14; n++) {
    const it = spawnPellet(sim, floor, 0.85, 'loam', nest.id, nest.colony, -1);
    placePellet(sim, it, floor);
    it.droppedTick = sim.state.tick - PELLET_TAMP_S * TICKS_PER_SECOND + 200 + 10 * n; // due from tick ~200
  }
  const e = nest.entrances[0];
  for (let n = 0; n < 500; n++) {
    const a = (n / 500) * 2 * Math.PI, r = e.radius + (2 + (n % 5)) * BU;
    const p = { x: e.pos.x + Math.cos(a) * r, y: 0, z: e.pos.z + Math.sin(a) * r };
    p.y = sim.field.height(p.x, p.z);
    const it = spawnPellet(sim, p, 0.85, 'loam', nest.id, nest.colony, -1);
    placePellet(sim, it, p);
    it.droppedTick = sim.state.tick - 3000; // settles at the next batches
  }
  return sim;
}

/** Runs to `until`; at tick 600 the entrance is filled (no plug), so the midden is blocked from then on. */
function run(sim: Sim, until: number): void {
  while (sim.state.tick < until) {
    if (sim.state.tick === 600) {
      const e = sim.state.nests[0].entrances[0];
      sim.enqueue({ type: 'cheat.fillSphere', pos: { x: e.pos.x, y: e.pos.y - 1.5 * BU, z: e.pos.z }, r: 3 * BU, loose: true });
    }
    sim.tick();
  }
}

describe('sim-fix-colony state: determinism and save / load (acceptance 6)', () => {
  it('saved mid-relaxation, mid-tamping and with the midden blocked: same hash as an uninterrupted run', () => {
    const a = scene();
    run(a, 1400);
    const nest = a.state.nests[0];
    // the run exercised the new state
    expect(loosePellets(a, nest.id).some((it) => it.volume < 0.85 - 1e-9)).toBe(true); // a partly tamped pellet
    expect(a.state.worldDelta.mounds.length).toBeGreaterThan(0);
    expect(isMiddenBlocked(a.state.colonies[0])).toBe(true);
    const relaxing = (sim: Sim) => sim.state.worldDelta.mounds.some((m) => (m.relaxSweep ?? -1) >= 0);
    for (const mode of ['mid-relaxation', 'tick 900'] as const) {
      const b0 = scene();
      if (mode === 'tick 900') run(b0, 900);
      else while (!relaxing(b0) && b0.state.tick < 1000) run(b0, b0.state.tick + 1);
      if (mode === 'mid-relaxation') expect(relaxing(b0)).toBe(true);
      const saveAt = b0.state.tick;
      const { state } = restore(snapshot(b0));
      const b = createSim(state, b0.world, { systems: SYSTEMS });
      run(b, 1400);
      expect(stateHash(b.state), `saved at ${saveAt}`).toBe(stateHash(a.state));
    }
  }, 120_000);
});
