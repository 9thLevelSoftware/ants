// Probe (opening-fix, sweep attribution): how often the unplug floor is on in a life.ts colony after its hand-over.
//   node tools/sim/run-ts.mjs tools/sim/probe/floorProbe.ts <founded-cache.bin> [ticks]
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
  const n = Number(args[1] ?? 18000), t0 = sim.state.tick;
  const col = sim.stores.colonies.list.find((c) => c.alive && c.id === (sim.state.player.colonyId >= 0 ? sim.state.player.colonyId : c.id))!;
  let on = 0, spells = 0, prev = false, first = -1, lastOn = -1;
  const status: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    sim.tick();
    const f = unplugFloor(sim, col) > 0;
    if (f) { on++; lastOn = i; if (first < 0) first = i; if (!prev) spells++; }
    prev = f;
    if (i % 250 === 0) for (const nid of col.nestIds) for (const e of sim.stores.nests.get(nid)?.entrances ?? []) status[e.status] = (status[e.status] ?? 0) + 1;
  }
  out(`colony ${col.id} ticks ${n} from ${t0}: floor on ${on} ticks in ${spells} spells (first +${first}, last +${lastOn}); entrance status samples ${JSON.stringify(status)}`);
}
