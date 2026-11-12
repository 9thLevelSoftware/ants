import { it } from 'vitest';
import { navTo } from '@/sim/locomotion';
import { makeTestSim } from '@/sim/testing';
import { passiveBehaviours } from '@/sim/testing/e2e/colonyScenario';
import { canDo } from '@/sim/ants';
import { foundingReadiness } from './chambers/foundingCell';
import { colonyNests, runFreeDig } from './freeDigKit';
import { runTicks } from './nestTestKit';

function walk(sim: any, a: any, dx: number, dz: number) {
  const bu = sim.world.bu;
  const out = { x: a.pos.x + dx * bu, y: 0, z: a.pos.z + dz * bu };
  out.y = sim.field.height(out.x, out.z);
  navTo(sim, a, out, 1.5 * bu);
  for (let t = 0; t < 4000 && a.nav.status === 'moving'; t++) sim.tick();
  return a.nav.status;
}
it('three sites', () => {
  const sim = makeTestSim({ seed: 3, behaviours: passiveBehaviours() });
  const bu = sim.world.bu;
  const col = sim.state.colonies[0];
  const queen = sim.stores.ants.get(col.queenId)!;
  console.log('queen start', (queen.pos.x / bu).toFixed(1), (queen.pos.z / bu).toFixed(1));
  walk(sim, queen, 15, -20);
  runFreeDig(sim, queen, { dir: { x: 1, z: 0 }, shaftBu: 2, roomBites: 0 });
  console.log('walk', walk(sim, queen, -6, 15));
  runFreeDig(sim, queen, { dir: { x: 1, z: 0 }, shaftBu: 2, roomBites: 0 });
  console.log('walk', walk(sim, queen, -6, 15));
  const d = runFreeDig(sim, queen, { dir: { x: 1, z: 0 } });
  runTicks(sim, 60);
  const nests = colonyNests(sim, queen.colony);
  const nest = nests[0];
  const r = foundingReadiness(sim, nest)!;
  sim.state.player.opening!.phase = 'lay';
  console.log('nests', nests.length, 'entr', nest.entrances.length, 'chambers', nest.chambers.map((c) => [c.type, c.volume.toFixed(1)]),
    'ready', r.ready, r.openings, r.readiness.toFixed(2), 'shaftTick', d.shaftTick, 'canLay', JSON.stringify(canDo(sim, queen, 'lay-egg', null)));
}, 300_000);
