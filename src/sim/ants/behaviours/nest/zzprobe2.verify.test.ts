import { it } from 'vitest';
import type { Ant, Sim } from '@/sim/types';
import { FLOOD_STEP_TICKS } from '@/sim/balance/weather';
import { floodCheats } from '@/sim/nest/flood/cheats';
import { spillFor } from '@/sim/nest/flood/runtime';
import { depthOver, waterView, dryPlace } from '@/sim/nest/flood/dryPlace';
import { fillSphere } from '@/sim/nest/carveOps';
import { isFleeingWater } from './fleeWater';
import { navTo, navToTarget } from '@/sim/locomotion';
import { makeNestColony, run, type NestColony } from './testkit';
function waterForShare(sim: Sim, k: NestColony, chamberId: number, share: number): number {
  const cache = spillFor(sim, k.nest);
  const list = cache.chamberSamples.get(chamberId)!;
  const idx = list[Math.min(list.length - 1, Math.floor(share * list.length))];
  return cache.cumVol[idx + 1];
}
const feet = (a: Ant) => a.pos.y - a.up.y * a.footOffset;
it('probe2', () => {
  const k = makeNestColony({ workers: 8, seed: 3, stores: { c: 100, p: 100 } });
  const { sim } = k; const bu = sim.world.bu;
  floodCheats(sim.state).drainScale = 0; floodCheats(sim.state).rainI = 0;
  run(sim, 50);
  sim.events.on('ant-died', (e) => { const a = sim.stores.ants.get(e.antId ?? e.id); console.log('DIED', JSON.stringify(e).slice(0, 200), a ? `${a.caste} ${a.state} ch${a.chamberId} y${(a.pos.y/bu).toFixed(1)}` : ''); });
  fillSphere(sim, { ...k.entrance.pos, y: k.entrance.pos.y - 1.5 * bu }, 2.5 * bu);
  run(sim, 100);
  const target = waterForShare(sim, k, k.nursery.id, 1);
  for (let s = 0; s < 120; s++) { k.nest.flood.water = target * (s + 1) / 120; run(sim, FLOOD_STEP_TICKS); }
  const w = waterView(sim, k.nest)!;
  console.log('level', (w.level/bu).toFixed(2), 'chambers', k.nest.chambers.map((c) => `${c.type} ${((c.center.y-c.radii.y)/bu).toFixed(1)}..${((c.center.y+c.radii.y)/bu).toFixed(1)} fl ${c.flooded.toFixed(2)}`).join(' | '));
  for (let m = 0; m < 12; m++) {
    run(sim, 50);
    const w2 = waterView(sim, k.nest)!;
    for (const a of sim.stores.ants.list) if (a.alive) {
      const d = depthOver(sim, w2, a.pos, feet(a)) / bu;
      if (d > 0 || isFleeingWater(a)) {
        const dp = dryPlace(sim, w2, a.pos, bu);
        console.log(`t${m} ant ${a.id} ${a.caste} ${a.task} ${a.state} ch${a.chamberId} feet ${(feet(a)/bu).toFixed(2)} depth ${d.toFixed(2)} sub ${a.bb['wx.sub'] ?? 0} hp ${a.hp.toFixed(2)} flee ${isFleeingWater(a)} ph ${a.bb['fw.ph']} tgtY ${a.bb['fw.ty'] !== undefined ? (a.bb['fw.ty']/bu).toFixed(2) : '-'} nav ${a.nav.status} dry ${dp ? `${(dp.pos.y/bu).toFixed(1)} d=${(Math.hypot(dp.pos.x-a.pos.x,dp.pos.y-a.pos.y,dp.pos.z-a.pos.z)/bu).toFixed(1)}` : 'null'} poss ${(a.flags & 1)}`); if (m===0) { console.log(JSON.stringify(a.nav).slice(0,600)); const ok = navTo(sim, a, dp!.pos, bu); console.log('navTo ->', ok, JSON.stringify(a.nav).slice(0,400)); run(sim, 5); console.log('after', a.nav.status, JSON.stringify(a.nav).slice(0,300)); const w3 = a; const q2 = sim.stores.ants.list.find((x)=>x.caste==='worker' && x.alive)!; const t = {...q2.pos}; console.log('worker at', (t.y/bu).toFixed(1)); console.log('navTo queen->worker', navTo(sim, w3, t, bu)); run(sim,5); console.log('after2', w3.nav.status); const fc = k.food; console.log('navToTarget chamber', navToTarget(sim, w3, { kind: 'chamber', id: fc.id, pos: fc.center } as any, bu)); run(sim, 5); console.log('after3', w3.nav.status, w3.nav.fieldKind); run(sim, 300); console.log('after3b', w3.nav.status, (w3.pos.y/bu).toFixed(1), w3.chamberId); }
      }
    }
  }
}, 300_000);
