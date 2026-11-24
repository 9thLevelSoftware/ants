// Probe (winter-sugar A3): from a hand-over snapshot, when each digger first enters dig.unplug and first runs
// unseal-entrance, unplug lockouts (bb bn.uu set), and when the entrance opens.
//   node tools/sim/run-ts.mjs tools/sim/probe/unplugTimes.ts <snapshot.bin> [ticks]
import { restore } from '@/sim/save';
import { createSim } from '@/sim/sim';
import { generateWorld } from '@/worldgen';
declare const process: { stdout: { write(s: string): void } };

export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };
  const { state } = restore(new Uint8Array(fs.readFileSync(args[0])));
  const sim = createSim(state, generateWorld(state.config.world));
  const out = (s: string) => process.stdout.write(s + '\n');
  const col = sim.state.player.colonyId, t0 = sim.state.tick, ticks = Number(args[1] ?? 3000);
  const entered = new Map<number, number>(), bit = new Map<number, number>(), locked = new Map<number, number>();
  for (let t = 0; t < ticks; t++) {
    sim.tick();
    const rel = sim.state.tick - t0;
    for (const a of sim.state.ants) {
      if (!a.alive || a.colony !== col) continue;
      if (a.state === 'dig.unplug' && !entered.has(a.id)) entered.set(a.id, rel);
      if (a.action?.id === 'unseal-entrance' && !bit.has(a.id)) bit.set(a.id, rel);
      if ((a.bb['bn.uu'] ?? 0) > sim.state.tick && !locked.has(a.id)) { locked.set(a.id, rel); out(`+${rel} ant ${a.id} barred from unplugging until +${(a.bb['bn.uu'] - t0)} (pos ${a.pos.x.toFixed(1)},${a.pos.y.toFixed(1)},${a.pos.z.toFixed(1)})`); }
    }
    const n = sim.state.nests.find((x) => x.colony === col)!;
    if (n.entrances.some((e) => e.status === 'open')) { out(`OPEN at +${rel}`); break; }
  }
  for (const [id, t] of entered) out(`ant ${id}: dig.unplug from +${t}, first unseal bite +${bit.get(id) ?? -1}`);
}
