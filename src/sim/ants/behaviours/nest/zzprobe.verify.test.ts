import { it } from 'vitest';
import type { Ant, Sim } from '@/sim/types';
import { FLOOD_STEP_TICKS } from '@/sim/balance/weather';
import { floodCheats } from '@/sim/nest/flood/cheats';
import { spillFor } from '@/sim/nest/flood/runtime';
import { depthOver, waterView } from '@/sim/nest/flood/dryPlace';
import { isFleeingWater } from './fleeWater';
import { makeNestColony, run, type NestColony } from './testkit';

function waterForShare(sim: Sim, k: NestColony, chamberId: number, share: number): number {
  const cache = spillFor(sim, k.nest);
  const list = cache.chamberSamples.get(chamberId)!;
  const idx = list[Math.min(list.length - 1, Math.floor(share * list.length))];
  return cache.cumVol[idx + 1];
}
const feet = (a: Ant) => a.pos.y - a.up.y * a.footOffset;
it('probe', () => {
  const k = makeNestColony({ workers: 12, seed: 3, stores: { c: 100, p: 100 }, brood: [
    { stage: 'egg', n: 3, chamber: 'royal' }, { stage: 'larva', n: 3, chamber: 'royal' }, { stage: 'pupa', n: 2, chamber: 'royal', progress: 0.1 }] });
  const { sim } = k;
  floodCheats(sim.state).drainScale = 0; floodCheats(sim.state).rainI = 0;
  run(sim, 50);
  const bu = sim.world.bu;
  console.log('chambers', k.nest.chambers.map((c) => `${c.id}:${c.type} floorY=${((c.center.y - c.radii.y)/bu).toFixed(1)} vol`).join(' | '), 'entrance y', (k.entrance.pos.y/bu).toFixed(1));
  const deaths: string[] = [];
  sim.events.on('ant-died', (e) => deaths.push(e.cause));
  sim.events.on('brood-died', (e) => deaths.push(`brood:${e.cause}`));
  const full = waterForShare(sim, k, k.royal.id, 1);
  const secs = Number(process.env.RAMP ?? 80);
  let at25 = -1;
  for (let s = 0; s < secs; s++) {
    k.nest.flood.water = full * (s + 1) / secs;
    run(sim, FLOOD_STEP_TICKS);
    const w = waterView(sim, k.nest);
    if (s % 5 === 0 && w && isFleeingWater(k.queen)) { const a = k.queen; console.log('  Q nav', a.nav.status, 'ph', a.bb['fw.ph'], 'tgt', ((a.bb['fw.tx']-a.pos.x)/bu).toFixed(2), ((a.bb['fw.ty']-a.pos.y)/bu).toFixed(2), ((a.bb['fw.tz']-a.pos.z)/bu).toFixed(2), 'level', (w.level/bu).toFixed(2), 'feet', (feet(a)/bu).toFixed(2), 'upy', a.up.y.toFixed(2)); }
    if (s % 5 === 0) console.log('s', s, 'royal', k.royal.flooded.toFixed(2), 'q', k.queen.state, 'ch', k.queen.chamberId, 'hp', k.queen.hp.toFixed(3), 'sub', k.queen.bb['wx.sub'] ?? 0, 'depth', w ? (depthOver(sim, w, k.queen.pos, feet(k.queen))/bu).toFixed(2) : '-');
    if (at25 < 0 && k.royal.flooded >= 0.25 && w) {
      at25 = s;
      const wet = sim.stores.brood.list.filter((b) => b.alive && b.carriedBy < 0 && depthOver(sim, w, b.pos, b.pos.y) > 0);
      console.log('royal 25% at s', s, 'brood lying in water', wet.length, 'of', sim.stores.brood.list.filter((b) => b.alive).length);
    }
  }
  for (let m = 0; m < 6; m++) {
    run(sim, 250);
    const q = k.queen, w = waterView(sim, k.nest)!;
    console.log(`t+${m+1}h queen ch=${q.chamberId} nest=${q.nestId} state=${q.state} flee=${isFleeingWater(q)} depth=${(depthOver(sim, w, q.pos, feet(q))/bu).toFixed(2)} hp=${q.hp}/${q.maxHp} sub=${q.bb['wx.sub'] ?? 0}`);
    const states = new Map<string, number>();
    for (const a of sim.stores.ants.list) if (a.alive && a.caste !== 'queen') states.set(`${a.state}@${a.chamberId}`, (states.get(`${a.state}@${a.chamberId}`) ?? 0) + 1);
    console.log('  ants', [...states].map(([s, n]) => `${s}x${n}`).join(' '));
    const bl = sim.stores.brood.list.filter((b) => b.alive);
    for (const a of sim.stores.ants.list) if (a.alive && isFleeingWater(a)) console.log('   fleeing', a.id, a.task, a.state, 'ch', a.chamberId, 'nestId', a.nestId, 'sub', sim.field.substrate(a.pos).toFixed(1), 'y', (a.pos.y/bu).toFixed(1), 'ph', a.bb['fw.ph'], 't0', a.bb['fw.t0'], 'origin', (a.bb['fw.oy']/bu).toFixed(1), 'nav', a.nav.status, 'depth', (depthOver(sim, w, a.pos, feet(a))/bu).toFixed(2), 'tgt', ((a.bb['fw.tx']-a.pos.x)/bu).toFixed(2), ((a.bb['fw.ty']-a.pos.y)/bu).toFixed(2), ((a.bb['fw.tz']-a.pos.z)/bu).toFixed(2), 'level', (w.level/bu).toFixed(2), 'feet', (feet(a)/bu).toFixed(2), 'wxsub', a.bb['wx.sub'] ?? 0);
    console.log('  brood', bl.map((b) => `${b.stage[0]}@${b.chamberId}${b.carriedBy>=0?'c':''}:${(depthOver(sim, w, b.pos, b.pos.y)/bu).toFixed(1)}`).join(' '));
  }
  console.log('deaths', deaths);
}, 300_000);
