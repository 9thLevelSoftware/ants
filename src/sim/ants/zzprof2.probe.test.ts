import { it } from 'vitest';
import { requestTask } from '@/sim/colony';
import { SYSTEMS } from '@/sim/systems';
import { makeTestSim } from '@/sim/testing';
import { announce, run } from '@/sim/ants/behaviours/outdoor/testkit';
it('prof outdoor', () => {
  const systems = SYSTEMS.filter((s) => s.phase !== 'colony-allocation');
  const sim = makeTestSim({ sizeBu: 800, nest: 'small', workers: 500, seed: 2, systems, config: { startSeason: 'summer', startDayOfSeason: 1, startHour: 9 } });
  const col = sim.state.colonies[0];
  sim.enqueue({ type: 'cheat.addFood', colonyId: col.id, c: 3, p: 0.5, toxin: 0 });
  const e = sim.stores.nests.get(col.nestIds[0])!.entrances[0];
  const bu = sim.world.bu;
  for (const [d, a] of [[80, 0], [120, 120], [150, 240]]) {
    const x = e.pos.x + Math.cos((a * Math.PI) / 180) * d * bu, z = e.pos.z + Math.sin((a * Math.PI) / 180) * d * bu;
    sim.enqueue({ type: 'cheat.spawnFood', kind: 'sugar', variant: 'sugar-granules', pos: { x, y: 0, z }, units: 300, stage: null });
  }
  sim.applyPendingCommands();
  for (const s of sim.state.sources) announce(sim, col, s);
  const workers = sim.state.ants.filter((a) => a.caste === 'worker');
  workers.forEach((a, i) => { requestTask(sim, a, i % 10 === 0 ? 'scout' : 'forage', 'job:test'); a.activation = 5; });
  const push = () => { for (const a of workers) { if (a.state === 'forage.wait') a.activation = 5; if (a.task === 'idle') requestTask(sim, a, 'forage', 'job:test'); } };
  run(sim, 3000, 1, push);
}, 600000);
