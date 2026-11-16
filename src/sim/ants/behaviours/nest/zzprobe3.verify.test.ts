import { it } from 'vitest';
import type { Sim } from '@/sim/types';
import { FLOOD_STEP_TICKS } from '@/sim/balance/weather';
import { floodCheats } from '@/sim/nest/flood/cheats';
import { fillSphere } from '@/sim/nest/carveOps';
import { spillFor } from '@/sim/nest/flood/runtime';
import { navToTarget } from '@/sim/locomotion';
import { makeNestColony, run, type NestColony } from './testkit';
function waterForShare(sim: Sim, k: NestColony, chamberId: number, share: number): number {
  const cache = spillFor(sim, k.nest);
  const list = cache.chamberSamples.get(chamberId)!;
  const idx = list[Math.min(list.length - 1, Math.floor(share * list.length))];
  return cache.cumVol[idx + 1];
}
it('probe3', () => {
  for (const water of [0, 0.5, 1]) {
    const k = makeNestColony({ workers: 8, seed: 3, stores: { c: 100, p: 100 } });
    const { sim } = k; const bu = sim.world.bu;
    floodCheats(sim.state).drainScale = 0; floodCheats(sim.state).rainI = 0;
    run(sim, 50);
    fillSphere(sim, { ...k.entrance.pos, y: k.entrance.pos.y - 1.5 * bu }, 2.5 * bu); run(sim, 100);
    const qq = k.queen; const q = sim.stores.ants.list.find((a) => a.alive && a.caste === 'worker')!; q.pos = { ...qq.pos, x: qq.pos.x + 2 * bu }; q.up = { ...qq.up }; q.nestId = qq.nestId; q.chamberId = qq.chamberId; q.medium = qq.medium; for (let t = 0; t < 3; t++) { q.thinkTick = sim.state.tick + 5; sim.tick(); }
    if (water > 0) { const t = waterForShare(sim, k, k.royal.id, water); for (let s = 0; s < 30; s++) { k.nest.flood.water = t * (s+1)/30; for (let i = 0; i < FLOOD_STEP_TICKS; i++) { q.thinkTick = sim.state.tick + 5; q.bb['fw.on'] = 0; sim.tick(); } } }
    const ok = navToTarget(sim, q, { kind: 'chamber', id: k.food.id, pos: k.food.center } as any, bu);
    for (let t = 0; t < 400; t++) { q.thinkTick = sim.state.tick + 5; sim.tick(); }
    console.log('royal water share', water, 'level', (k.nest.flood.level/bu).toFixed(1), 'queen feet', ((q.pos.y)/bu).toFixed(1), 'queen -> food chamber', ok, q.nav.status, q.nav.fieldKind, 'now ch', q.chamberId, 'royal flooded', k.royal.flooded.toFixed(2));
  }
}, 300_000);
