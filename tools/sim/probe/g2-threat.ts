// gate-sim-2 item 2 probe: outdoor/review.verify "a lasting threat on the way" with variant f. Logs the forager's
// state changes with distance from the entrance, crumb count and retrace index.
import { makeTestSim } from '@/sim/testing';
import { ALARM_STRONG } from '@/sim/balance';
import { requestTask } from '@/sim/colony';
import { SYSTEMS } from '@/sim/systems';
import { announce } from '@/sim/ants/behaviours/outdoor/testkit';

export default async function main(args: string[]): Promise<void> {
  const seed = Number(args[0] ?? 5), quiet = args[1] === 'q';
  const sim = makeTestSim({
    sizeBu: 400, nest: 'small', workers: 2, seed, systems: SYSTEMS.filter((s) => s.phase !== 'colony-allocation'),
    config: { startSeason: 'summer', startDayOfSeason: 2, startHour: 10 },
  });
  const col = sim.state.colonies[0];
  const e = sim.stores.nests.get(col.nestIds[0])!.entrances[0];
  const bu = sim.world.bu;
  sim.enqueue({ type: 'cheat.addFood', colonyId: col.id, c: 3, p: 0.5, toxin: 0 });
  sim.enqueue({ type: 'cheat.spawnFood', kind: 'sugar', variant: 'sugar-granules', pos: { x: e.pos.x + 120 * bu, y: 0, z: e.pos.z }, units: 50, stage: null });
  sim.applyPendingCommands();
  announce(sim, col, sim.state.sources[sim.state.sources.length - 1]);
  const ant = sim.state.ants.find((a) => a.caste === 'worker')!;
  requestTask(sim, ant, 'forage', 'job:test');
  const spot = { x: e.pos.x + 60 * bu, y: 0, z: e.pos.z };
  spot.y = sim.field.height(spot.x, spot.z);
  let last = '', n = 0, out = -1, maxOut = 0, flees = 0;
  for (let t = 0; t < 30000 && (quiet || n < 80); t++) {
    if (ant.state === 'forage.wait') ant.activation = 1;
    if (t % 5 === 0) sim.phero.deposit(-1, 'alarm', spot, ALARM_STRONG);
    sim.tick();
    if (!ant.alive) { if (!quiet) console.log(`t ${sim.state.tick} dead`); break; }
    if (ant.state === 'flee.run' && last !== 'flee.run') flees++;
    if (ant.nestId < 0 && out < 0) out = sim.state.tick;
    if (ant.nestId >= 0 && out >= 0) { maxOut = Math.max(maxOut, (sim.state.tick - out) / 10); out = -1; }
    if (ant.state !== last && quiet) last = ant.state;
    if (ant.state !== last) {
      n++;
      const dx = (ant.pos.x - e.pos.x) / bu, dz = (ant.pos.z - e.pos.z) / bu;
      const idx = (ant.nav.loco as unknown as { crumbIdx?: number } | undefined)?.crumbIdx ?? -9;
      console.log(`t ${sim.state.tick} ${last} -> ${ant.state} at (${dx.toFixed(1)}, ${dz.toFixed(1)}) BU crumbs ${ant.mem.crumbLen} idx ${idx} flags ${ant.flags} nav ${ant.nav.mode}/${ant.nav.status}`);
      last = ant.state;
    }
  }
  if (out >= 0) maxOut = Math.max(maxOut, (sim.state.tick - out) / 10);
  console.log(`seed ${seed}: alive ${ant.alive} maxOut ${maxOut.toFixed(0)} s flees ${flees}`);
}
