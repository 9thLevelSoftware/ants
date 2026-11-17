// Round-5 probe (deleted at the end of the round): entrance status of a cached hand-over over the first game day.
import type { ArchetypeId } from '@/sim/types';
import { defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { SYSTEMS } from '@/sim/systems';
import { generateWorld } from '@/worldgen';
import { restore } from '@/sim/save';
import { TICKS_PER_DAY } from '@/sim/time';
interface NodeFs { readFileSync(p: string): Uint8Array }
export default async function main(args: string[]): Promise<void> {
  const [arch, seedS, cache, gdS] = args;
  const seed = Number(seedS);
  const fs = (await import('node:fs' as string)) as NodeFs;
  const base = defaultGameConfig('lasius-niger', seed, 'naturalist');
  const world = generateWorld({ ...base.world, archetype: arch as ArchetypeId });
  const state = restore(new Uint8Array(fs.readFileSync(`${cache}/founded-lasius-niger-${arch}-${seed}-naturalist-d-any.bin`))).state;
  const sim = createSim(state, world, { systems: SYSTEMS });
  const col = sim.state.player.colonyId;
  const end = sim.state.tick + Math.round(Number(gdS ?? 1) * TICKS_PER_DAY);
  let last = '';
  while (sim.state.tick < end) {
    sim.tick();
    if (sim.state.tick % 250 !== 0) continue;
    const nests = sim.state.nests.filter((n) => n.alive && n.colony === col);
    const ent = nests.flatMap((n) => n.entrances.map((e) => `${e.id}:${e.status}/plug${(e as unknown as { plugCount?: number }).plugCount ?? '?'}`)).join(' ');
    const fnd = nests.map((n) => JSON.stringify((n as unknown as { founding?: unknown }).founding ?? null)).join(' ');
    const ants = sim.state.ants.filter((a) => a.alive && a.colony === col);
    const out = ants.filter((a) => a.nestId < 0).length;
    const tasks: Record<string, number> = {};
    for (const a of ants) tasks[a.task] = (tasks[a.task] ?? 0) + 1;
    const line = `${ent} out ${out} ${JSON.stringify(tasks)} founding ${fnd.slice(0, 120)}`;
    if (line !== last) console.log(`gd ${((sim.state.tick - (end - Math.round(Number(gdS ?? 1) * TICKS_PER_DAY))) / TICKS_PER_DAY).toFixed(2)} ${line}`);
    last = line;
  }
}
