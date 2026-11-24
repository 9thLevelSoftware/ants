// Probe (opening-fix, ruling 3): every task change of a life.ts colony's workers for N ticks after the hand-over.
//   node tools/sim/run-ts.mjs tools/sim/probe/taskTrace.ts <founded-cache.bin> [ticks]
import { restore } from '@/sim/save';
import { createSim } from '@/sim/sim';
import { generateWorld } from '@/worldgen';
declare const process: { stdout: { write(s: string): void } };
export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };
  const { state } = restore(new Uint8Array(fs.readFileSync(args[0])));
  const sim = createSim(state, generateWorld(state.config.world));
  const out = (s: string) => process.stdout.write(s + '\n');
  const n = Number(args[1] ?? 1500);
  const col = sim.stores.colonies.list.find((c) => c.alive && c.id === sim.state.player.colonyId) ?? sim.stores.colonies.list.find((c) => c.alive)!;
  const last = new Map<number, string>();
  for (const a of sim.state.ants) if (a.alive && a.colony === col.id) last.set(a.id, a.task);
  out(`+0 ${[...last.entries()].map(([k, v]) => `${k}:${v}`).join(' ')}`);
  sim.events.onAny((type, e) => { if (String(type).includes('herd') || String(type).includes('aphid') || String(type) === 'source-discovered') out(`  +? ${String(type)} ${JSON.stringify(e).slice(0, 120)}`); });
  for (let i = 1; i <= n; i++) {
    sim.tick();
    for (const a of sim.state.ants) {
      if (!a.alive || a.colony !== col.id) continue;
      if (last.get(a.id) !== a.task) { out(`+${i} ant ${a.id} ${last.get(a.id)} -> ${a.task} (${a.state}) nest ${a.nestId}`); last.set(a.id, a.task); }
    }
  }
}
