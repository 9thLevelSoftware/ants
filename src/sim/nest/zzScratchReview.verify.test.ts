import { it } from 'vitest';
import { AntFlag } from '@/sim/types';
import { navTo } from '@/sim/locomotion';
import { makeTestSim } from '@/sim/testing';
import { passiveBehaviours } from '@/sim/testing/e2e/colonyScenario';
import { carveSphere } from './carveOps';
import { colonyNests, freeDig, runFreeDig } from './freeDigKit';
import { dumpPoint } from './index';
import { moundById } from './mounds';
import { pileOverOpenings } from './moundRelax';
import { placePellet, spawnPellet } from './pellets';
import { runTicks, placeWorker } from './nestTestKit';
import { coveredEntrances } from './entrances';

it('widen transient', () => {
  const { sim, queen } = freeDig(11);
  const bu = sim.world.bu;
  const nest = colonyNests(sim, queen.colony)[0];
  const e = nest.entrances[0];
  const p = { x: 0, y: 0, z: 0 };
  for (let n = 0; n < 200; n++) { dumpPoint(sim, e, p); const it = spawnPellet(sim, p, 0.85, 'loam', nest.id, nest.colony, -1); placePellet(sim, it, { ...p }); }
  runTicks(sim, 4000);
  const m = moundById(sim, e.moundId)!;
  console.log('before widen r', e.radius / bu, 'over', pileOverOpenings(sim, m).length, 'tick', sim.state.tick);
  carveSphere(sim, { x: e.pos.x, y: e.pos.y - 0.5 * bu, z: e.pos.z }, 2.6 * bu, {});
  console.log('after widen r', e.radius / bu, 'over', pileOverOpenings(sim, m).length);
  for (let t = 0; t < 260; t += 20) { runTicks(sim, 20); console.log('t+', t + 20, 'over', pileOverOpenings(sim, m).length, 'status', e.status, 'covered', coveredEntrances(sim).length); }
}, 300_000);

it('founding queen second pit', () => {
  const sim = makeTestSim({ seed: 3, behaviours: passiveBehaviours() });
  const bu = sim.world.bu;
  const col = sim.state.colonies[0];
  const queen = sim.stores.ants.get(col.queenId)!;
  const nest0 = sim.stores.nests.get(col.nestIds[0])!;
  nest0.founding!.state = 'digging';
  navTo(sim, queen, { x: queen.pos.x + 20 * bu, y: queen.pos.y, z: queen.pos.z }, 1.5 * bu);
  for (let t = 0; t < 3000 && queen.nav.status === 'moving'; t++) sim.tick();
  runFreeDig(sim, queen, { dir: { x: 1, z: 0 }, shaftBu: 3, roomBites: 0 });
  runTicks(sim, 30);
  console.log('pit1 entrances', nest0.entrances.map((e) => [e.id, (e.pos.x / bu).toFixed(1), (e.pos.z / bu).toFixed(1), e.moundId]));
  // she walks 30 BU on, (abandons) and starts again
  // climb out first
  const out = { x: queen.pos.x - 6 * bu, y: 0, z: queen.pos.z + 30 * bu };
  out.y = sim.field.height(out.x, out.z);
  navTo(sim, queen, out, 1.5 * bu);
  for (let t = 0; t < 4000 && queen.nav.status === 'moving'; t++) sim.tick();
  console.log('queen at', (queen.pos.x / bu).toFixed(1), (queen.pos.z / bu).toFixed(1), queen.medium, queen.nav.status);
  let lastExpel: any = null;
  const off = sim.events.on('pellet-expelled', (ev) => { lastExpel = ev; });
  runFreeDig(sim, queen, { dir: { x: 1, z: 0 }, shaftBu: 3, roomBites: 0 });
  runTicks(sim, 30);
  off();
  const nests = colonyNests(sim, queen.colony);
  console.log('nests', nests.length, nests.map((n) => ({ id: n.id, ent: n.entrances.map((e) => [e.id, (e.pos.x / bu).toFixed(1), (e.pos.z / bu).toFixed(1), e.moundId]), mounds: n.moundIds })));
  if (lastExpel) { const m = moundById(sim, lastExpel.moundId)!; console.log('last expel from', (lastExpel.pos.x / bu).toFixed(1), (lastExpel.pos.z / bu).toFixed(1), 'onto mound centred', (m.centerX / bu).toFixed(1), (m.centerZ / bu).toFixed(1)); }
}, 300_000);

it('worker of established colony digs 3 far pits', () => {
  const sim = makeTestSim({ seed: 3, behaviours: passiveBehaviours(), nest: 'small', workers: 1 });
  const bu = sim.world.bu;
  const col = sim.state.colonies[0];
  const main = sim.stores.nests.get(col.nestIds[0])!;
  console.log('main origin', (main.origin.x / bu).toFixed(1), (main.origin.z / bu).toFixed(1), 'nests', col.nestIds.length);
  for (let s = 0; s < 3; s++) {
    const w = placeWorker(sim, { x: main.origin.x + (100 + 15 * s) * bu, y: 10 * bu, z: main.origin.z + 100 * bu }, { x: 1, y: 0, z: 0 });
    w.flags |= AntFlag.POSSESSED;
    runFreeDig(sim, w, { dir: { x: 1, z: 0 }, shaftBu: 3, roomBites: 0 });
    w.flags &= ~AntFlag.POSSESSED;
  }
  runTicks(sim, 60);
  console.log('nests now', colonyNests(sim, col.id).map((n) => [n.id, n.kind, n.entrances.length, n.chambers.length]));
}, 300_000);
