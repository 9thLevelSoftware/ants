// Probe (opening-fix, ruling 3): task headcounts of a life.ts colony after its hand-over, every 250 ticks for the first
// game day, then every 1500 ticks to 2 days: does the unplug floor / draft leave anything behind once the entrance opens?
//   node tools/sim/run-ts.mjs tools/sim/probe/allocProbe.ts <founded-cache.bin>
import { restore } from '@/sim/save';
import { createSim } from '@/sim/sim';
import { generateWorld } from '@/worldgen';
import { unplugFloor } from '@/sim/colony/allocation/demand';
declare const process: { stdout: { write(s: string): void } };
export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };
  const { state } = restore(new Uint8Array(fs.readFileSync(args[0])));
  const sim = createSim(state, generateWorld(state.config.world));
  const out = (s: string) => process.stdout.write(s + '\n');
  const col = sim.stores.colonies.list.find((c) => c.alive && c.id === sim.state.player.colonyId) ?? sim.stores.colonies.list.find((c) => c.alive)!;
  let trips = 0;
  sim.events.onAny((type) => { if (String(type) === 'forage-trip-ended' || String(type) === 'food-delivered') trips++; });
  const show = (i: number) => {
    const t: Record<string, number> = {};
    for (const a of sim.state.ants) if (a.alive && a.colony === col.id && a.caste !== 'queen') t[a.task] = (t[a.task] ?? 0) + 1;
    const open = col.nestIds.some((nid) => sim.stores.nests.get(nid)?.entrances.some((e) => e.status === 'open'));
    out(`+${i} floor ${unplugFloor(sim, col)} open ${open} storesC ${col.stores.c.toFixed(2)} deliv ${trips} tasks ${JSON.stringify(t)}`);
  };
  show(0);
  for (let i = 1; i <= 12000; i++) { sim.tick(); if ((i <= 6000 && i % 250 === 0) || i % 1500 === 0) show(i); }
}
