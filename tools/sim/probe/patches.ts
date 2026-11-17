// colony-life round 2 probe (deleted after use): prey patches and P sources near the nest of cached hand-overs.
import { defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { restore } from '@/sim/save';
import { generateWorld } from '@/worldgen';
import type { ArchetypeId } from '@/sim/types';

declare const process: { argv: string[] };
export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };
  for (const spec of args) {
    const [arch, seedS] = spec.split(':');
    const seed = Number(seedS);
    const base = defaultGameConfig('lasius-niger', seed, 'naturalist');
    const world = generateWorld({ ...base.world, archetype: arch as ArchetypeId });
    const bin = new Uint8Array(fs.readFileSync(`test-output/colony-life/round-2/cache/founded-lasius-niger-${arch}-${seed}-naturalist-d-any.bin`));
    const sim = createSim(restore(bin).state, world);
    const bu = sim.world.bu;
    const nest = sim.stores.nests.list.find((n) => n.alive && n.colony === sim.state.player.colonyId)!;
    const e = nest.entrances[0].pos;
    const d = (p: { x: number; z: number }) => Math.hypot(p.x - e.x, p.z - e.z) / bu;
    const patches = sim.state.ecology.preyPatches.map((p) => ({ id: p.id, edgeBu: Math.round(d(p.center) - p.radius / bu), rBu: Math.round(p.radius / bu), k: Math.round(p.k), count: Math.round(p.count) }))
      .filter((p) => p.edgeBu <= 300).sort((a, b) => a.edgeBu - b.edgeBu);
    const zones: Record<string, number> = {};
    console.log(JSON.stringify({ run: spec, patchesWithin300: patches, totalPatches: sim.state.ecology.preyPatches.length, zones }));
  }
}
