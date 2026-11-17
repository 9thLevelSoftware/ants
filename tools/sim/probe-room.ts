// probe (colony-life round 1, deleted after use): the player's chambers and the queen's place at hand-over.
import { createSim } from '@/sim/sim';
import { restore } from '@/sim/save';
import { generateWorld } from '@/worldgen';
import { defaultGameConfig } from '@/sim/createGame';
import type { ArchetypeId } from '@/sim/types';
export default async function main(args: string[]) {
  const [snap, arch, seedS] = args;
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };
  const base = defaultGameConfig('lasius-niger', Number(seedS), 'naturalist');
  const world = generateWorld({ ...base.world, archetype: arch as ArchetypeId });
  const sim = createSim(restore(new Uint8Array(fs.readFileSync(snap))).state, world);
  const col = sim.stores.colonies.get(sim.state.player.colonyId)!, bu = sim.world.bu;
  const q = sim.stores.ants.get(col.queenId)!;
  for (const id of col.nestIds) for (const c of sim.stores.nests.get(id)!.chambers) {
    const dq = Math.hypot(q.pos.x - c.center.x, q.pos.z - c.center.z) / bu;
    console.log(`chamber ${c.id} ${c.type} radii ${(c.radii.x / bu).toFixed(2)},${(c.radii.y / bu).toFixed(2)},${(c.radii.z / bu).toFixed(2)} BU; queen ch ${q.chamberId}, ${dq.toFixed(2)} BU from its centre`);
  }
}
