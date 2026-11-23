// gate-sim-2 item 1 probe: behaviours/nest/stall.soak (32 % of ant-ticks 'moving' at speed 0). Same scenario; counts
// stalled ant-ticks by state and nav target kind, and prints the worst ants' details. Reads state only.
//   node tools/sim/run-ts.mjs tools/sim/probe/g2-stall.ts [TICKS]
import { makeNestColony } from '@/sim/ants/behaviours/nest/testkit';

export default async function main(args: string[]): Promise<void> {
  const n = Number(args[0] ?? 600);
  const k = makeNestColony({
    workers: 40, stores: { c: 300, p: 200 }, seed: 5,
    brood: [
      { stage: 'egg', n: 15, chamber: 'nursery' }, { stage: 'larva', n: 20, chamber: 'nursery' },
      { stage: 'pupa', n: 10, chamber: 'nursery' },
    ],
  });
  const sim = k.sim, eps = 0.01 * sim.world.bu;
  const by: Record<string, number> = {}, per = new Map<number, number>();
  let moving = 0, stalled = 0;
  for (let t = 0; t < n; t++) {
    sim.tick();
    for (const a of sim.stores.ants.list) {
      if (!a.alive || a.caste === 'queen' || a.nav.status !== 'moving' || a.medium === 'air') continue;
      moving++;
      if (a.speed >= eps) continue;
      stalled++;
      const key = `${a.task}/${a.state} act ${a.action?.id ?? '-'} goal ${(a.nav as unknown as { goal?: { kind?: string } }).goal?.kind ?? '?'}`;
      by[key] = (by[key] ?? 0) + 1;
      per.set(a.id, (per.get(a.id) ?? 0) + 1);
    }
  }
  console.log(`moving ${moving} stalled ${stalled}`);
  for (const [k2, v] of Object.entries(by).sort((x, y) => y[1] - x[1]).slice(0, 25)) console.log(`${v}\t${k2}`);
  const worst = [...per.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5);
  for (const [id, c] of worst) {
    const a = sim.stores.ants.get(id)!;
    console.log(`ant ${id} stalled ${c} ${a.task}/${a.state} pos ${a.pos.x.toFixed(1)},${a.pos.y.toFixed(1)},${a.pos.z.toFixed(1)} nav ${JSON.stringify(a.nav).slice(0, 400)}`);
  }
}
