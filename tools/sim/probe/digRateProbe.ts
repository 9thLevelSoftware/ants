// Probe (opening-fix, ruling 2 R14): the unplug diggers' temperature and work rate after a night hand-over, and the
// unseal bites per game hour, until the entrance is open.
//   node tools/sim/run-ts.mjs tools/sim/probe/digRateProbe.ts <snapshot.bin>
import { restore } from '@/sim/save';
import { createSim } from '@/sim/sim';
import { generateWorld } from '@/worldgen';
import { workRate } from '@/sim/ants/actions/workRate';
import { TICKS_PER_HOUR } from '@/sim/time';
declare const process: { stdout: { write(s: string): void } };
export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };
  const { state } = restore(new Uint8Array(fs.readFileSync(args[0])));
  const sim = createSim(state, generateWorld(state.config.world));
  const out = (s: string) => process.stdout.write(s + '\n');
  const col = sim.state.player.colonyId;
  const nest = () => sim.state.nests.find((x) => x.colony === col)!;
  let bites = 0, tbSum = 0, wrSum = 0, n = 0, hourBites = 0;
  sim.events.onAny((type, e) => { if (type === 'action-started' && (e as { action?: string }).action === 'unseal-entrance') { bites++; hourBites++; } });
  const t0 = sim.state.tick;
  for (let i = 1; i <= 3000; i++) {
    sim.tick();
    for (const a of sim.state.ants) {
      if (!a.alive || a.colony !== col || a.state !== 'dig.unplug') continue;
      tbSum += a.tb; wrSum += workRate(sim, a); n++;
    }
    if (i % TICKS_PER_HOUR === 0) {
      const hour = ((sim.state.tick % 6000) / TICKS_PER_HOUR).toFixed(1), e = nest().entrances[0];
      out(`+${i} game hour ${hour}: unplug digger-ticks ${n}, mean body T ${(tbSum / Math.max(1, n)).toFixed(1)} C, mean work rate ${(wrSum / Math.max(1, n)).toFixed(2)}, unseal bites ${hourBites}, plug ${e.plugVoxelCount} ${e.status}`);
      tbSum = 0; wrSum = 0; n = 0; hourBites = 0;
    }
    if (nest().entrances.some((e) => e.status === 'open')) { out(`OPEN after ${sim.state.tick - t0} ticks, ${bites} unseal bites`); break; }
  }
}
