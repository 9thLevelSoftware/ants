// PROBE (species-leafcutter; delete before finishing): queen feeding after the Atta hand-over (snapshot of probe-leaf-life).
import { createSim } from '@/sim/sim';
import { generateWorld } from '@/worldgen';
import { restore } from '@/sim/save';
import { defaultGameConfig } from '@/sim/createGame';
import type { ArchetypeId } from '@/sim/types';
interface Fs { readFileSync(p: string): Uint8Array }
export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as Fs;
  const arch = (args[0] ?? 'suburban-garden') as ArchetypeId, seed = Number(args[1] ?? 1);
  const base = defaultGameConfig('atta-texana', seed, 'naturalist');
  const world = generateWorld({ ...base.world, archetype: arch });
  const sim = createSim(restore(new Uint8Array(fs.readFileSync(`test-output/leaf/probe/${arch}-${seed}.bin`))).state, world);
  const col = sim.state.colonies[0];
  const q = sim.stores.ants.get(col.queenId)!;
  const fails: Record<string, number> = {};
  sim.events.on('action-failed', (e) => { const a = sim.stores.ants.get(e.antId); if (a?.task === 'queen-care' || a?.task === 'nurse') fails[`${a.task}:${e.action}:${e.reason}`] = (fails[`${a.task}:${e.action}:${e.reason}`] ?? 0) + 1; });
  let feeds = 0;
  sim.events.on('feed', (e) => { if (e.receiverId === q.id) feeds++; });
  const n = sim.state.nests.find((x) => x.colony === col.id)!;
  console.log('queen', q.chamberId, q.pos, 'chambers', n.chambers.map((c) => `${c.id}:${c.type} ${JSON.stringify(c.center)}`), 'queen founding', !!q.queen?.founding, 'mode', q.queen?.mode);
  for (let t = 0; t < 1500; t++) {
    sim.tick();
    if (t % 150 === 0) {
      const qc = sim.state.ants.filter((a) => a.alive && a.colony === col.id && a.task === 'queen-care');
      console.log(t, 'gut', q.queen!.gut.c.toFixed(3), q.queen!.gut.p.toFixed(3), 'qc', qc.map((a) => `${a.id} ${a.state} ch${a.chamberId} crop${(a.cropC + a.cropP).toFixed(3)} cap${a.cropCap.toFixed(3)} act ${a.action?.id ?? '-'} nav ${a.nav.status} d${Math.hypot(a.pos.x - q.pos.x, a.pos.y - q.pos.y, a.pos.z - q.pos.z).toFixed(1)}`).join(' | '));
    }
  }
  console.log('feeds', feeds, 'fails', JSON.stringify(fails));
}
