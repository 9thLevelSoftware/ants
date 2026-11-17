// Round-5 probe (deleted at the end of the round): the protein ledger of a cached hand-over, every 3 game hours,
// the columns of the sweep-4 review's probe (round-4/sweep-review/probe-r4-cpv1.txt).
import type { ArchetypeId } from '@/sim/types';
import { defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { SYSTEMS } from '@/sim/systems';
import { generateWorld } from '@/worldgen';
import { restore } from '@/sim/save';
import { TICKS_PER_HOUR } from '@/sim/time';
interface NodeFs { readFileSync(p: string): Uint8Array }
export default async function main(args: string[]): Promise<void> {
  const [arch, seedS, cache, hoursS] = args;
  const seed = Number(seedS);
  const fs = (await import('node:fs' as string)) as NodeFs;
  const base = defaultGameConfig('lasius-niger', seed, 'naturalist');
  const world = generateWorld({ ...base.world, archetype: arch as ArchetypeId });
  const state = restore(new Uint8Array(fs.readFileSync(`${cache}/founded-lasius-niger-${arch}-${seed}-naturalist-d-any.bin`))).state;
  const sim = createSim(state, world, { systems: SYSTEMS });
  const col = sim.stores.colonies.get(sim.state.player.colonyId)!;
  const r = (x: number) => Math.round(x * 100) / 100;
  console.log('h poolC poolP queenResP larvae | inRecycledP inDeliveryP outLarvaeP outSpoiledP spoiledItems');
  const t0 = sim.state.tick;
  for (let h = 0; h <= Number(hoursS ?? 72); h += 3) {
    const q = sim.stores.ants.get(col.queenId);
    const larvae = sim.state.brood.filter((b) => b.alive && b.colony === col.id && b.stage === 'larva').length;
    const items = sim.state.items.filter((i) => i.alive && i.wasteKind === 'spoiled-food').length;
    const L = col.ledger as unknown as Record<string, number>;
    console.log(`${h} ${r(col.stores.c)} ${r(col.stores.p)} ${r(q?.queen?.reserveP ?? 0)} ${larvae} | ${r(L.inRecycledP)} ${r(L.inDeliveryP)} ${r(L.outLarvaeP)} ${r(L.outSpoiledP)} ${items}`);
    while (sim.state.tick < t0 + (h + 3) * TICKS_PER_HOUR) sim.tick();
  }
}
