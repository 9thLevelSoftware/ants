import { it } from 'vitest';
import { BULKING } from '@/sim/balance/nest';
import { colonyNests, freeDig } from './freeDigKit';
import { dumpPoint } from './index';
import { deposit, moundById, relax } from './mounds';
import { moundMask } from './moundRelax';
import { nestRuntime } from './runtime';
import { runTicks } from './nestTestKit';

it('scratch timing', () => {
  const { sim, queen } = freeDig(11);
  const bu = sim.world.bu;
  const nest = colonyNests(sim, queen.colony)[0];
  const e = nest.entrances[0];
  const p = { x: 0, y: 0, z: 0 };
  let m = e.moundId >= 0 ? moundById(sim, e.moundId) : undefined;
  console.log('mound', m?.id, 'entr', e.id, 'breaches', sim.carve.breaches.length);
  // mature: 1600 BU^3
  for (let n = 0; n < 1500; n++) { dumpPoint(sim, e, p); deposit(sim, m!, p.x, p.z, 0.85 * BULKING * bu ** 3); }
  for (let k = 0; k < 30 && relax(sim, m!); k++) {}
  const maskT: number[] = [], relT: number[] = [];
  for (let rep = 0; rep < 6; rep++) {
    nestRuntime(sim).moundMasks.clear();
    let t0 = performance.now(); moundMask(sim, m!); maskT.push(performance.now() - t0);
    for (let n = 0; n < 20; n++) { dumpPoint(sim, e, p); deposit(sim, m!, p.x, p.z, 0.85 * BULKING * bu ** 3); }
    t0 = performance.now(); relax(sim, m!); relT.push(performance.now() - t0);
  }
  console.log('mask ms', maskT.map((x) => x.toFixed(1)).join(' '), 'relax ms', relT.map((x) => x.toFixed(1)).join(' '));
  runTicks(sim, 1);
}, 300_000);
import * as old from './zzOldMounds';
it('scratch old relax timing', () => {
  const { sim, queen } = freeDig(11);
  const bu = sim.world.bu;
  const nest = colonyNests(sim, queen.colony)[0];
  const e = nest.entrances[0];
  const p = { x: 0, y: 0, z: 0 };
  const m = moundById(sim, e.moundId)!;
  for (let n = 0; n < 1500; n++) { dumpPoint(sim, e, p); old.deposit(sim, m, p.x, p.z, 0.85 * BULKING * bu ** 3); }
  for (let k = 0; k < 30 && old.relax(sim, m); k++) {}
  const relT: number[] = [];
  for (let rep = 0; rep < 6; rep++) {
    for (let n = 0; n < 20; n++) { dumpPoint(sim, e, p); old.deposit(sim, m, p.x, p.z, 0.85 * BULKING * bu ** 3); }
    const t0 = performance.now(); old.relax(sim, m); relT.push(performance.now() - t0);
  }
  console.log('OLD relax ms', relT.map((x) => x.toFixed(1)).join(' '));
}, 300_000);
