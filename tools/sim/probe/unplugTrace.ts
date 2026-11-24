// Probe (opening-fix, R14): restore a hand-over snapshot and trace, tick by tick, what each worker of the player's
// colony does until the founding entrance is open: time per (task/state/action), unseal bites and the plug voxels
// each removed, failed unplug attempts, and where the unplug diggers stand relative to the entrance.
//   node tools/sim/run-ts.mjs tools/sim/probe/unplugTrace.ts <snapshot.bin> [maxTicks]
import { restore } from '@/sim/save';
import { createSim } from '@/sim/sim';
import { generateWorld } from '@/worldgen';
declare const process: { stdout: { write(s: string): void } };

export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };
  const { state } = restore(new Uint8Array(fs.readFileSync(args[0])));
  const sim = createSim(state, generateWorld(state.config.world));
  const max = Number(args[1] ?? 4000);
  const out = (s: string) => process.stdout.write(s + '\n');
  const col = sim.state.player.colonyId;
  const nest = () => sim.state.nests.find((x) => x.colony === col)!;
  const t0 = sim.state.tick;
  const buckets = new Map<number, Map<string, number>>();
  const last = new Map<number, string>();
  const bites = new Map<number, number>();
  let plugPrev = nest().entrances[0]?.plugVoxelCount ?? 0;
  const bu = sim.world.bu;
  for (let t = 0; t < max; t++) {
    const actBefore = new Map<number, string>();
    for (const a of sim.state.ants) if (a.alive && a.colony === col) actBefore.set(a.id, a.action?.id ?? '-');
    sim.tick();
    const n = nest(), e = n.entrances[0];
    const plug = e?.plugVoxelCount ?? 0;
    for (const a of sim.state.ants) {
      if (!a.alive || a.colony !== col || a.caste !== 'worker') continue;
      const key = `${a.task}/${a.state}/${a.action?.id ?? '-'}/${a.carry.kind}`;
      const m = buckets.get(a.id) ?? new Map<string, number>();
      m.set(key, (m.get(key) ?? 0) + 1);
      buckets.set(a.id, m);
      const ab = actBefore.get(a.id);
      if (ab === 'unseal-entrance' && (a.action?.id ?? '-') !== 'unseal-entrance') bites.set(a.id, (bites.get(a.id) ?? 0) + 1);
      const sk = `${a.task}/${a.state}`;
      if (last.get(a.id) !== sk) {
        const d = e ? Math.hypot(a.pos.x - e.pos.x, a.pos.y - e.pos.y, a.pos.z - e.pos.z) / bu : -1;
        out(`  +${sim.state.tick - t0} ant ${a.id} -> ${sk} dEntr ${d.toFixed(2)} BU pos ${[a.pos.x, a.pos.y, a.pos.z].map((v) => v.toFixed(1)).join(',')} plug ${plug}`);
        last.set(a.id, sk);
      }
    }
    if (plug !== plugPrev) {
      if ((sim.state.tick - t0) % 1 === 0) out(`  +${sim.state.tick - t0} plug ${plugPrev} -> ${plug} status ${e?.status}`);
      plugPrev = plug;
    }
    if (e && e.status === 'open') { out(`OPEN after ${sim.state.tick - t0} ticks`); break; }
  }
  for (const [id, m] of buckets) {
    out(`ant ${id} bites ${bites.get(id) ?? 0}`);
    for (const [k, v] of [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) out(`    ${k} ${v}`);
  }
}
