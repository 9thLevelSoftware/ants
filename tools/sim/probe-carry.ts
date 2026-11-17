// probe (colony-life round 1, deleted after use): egg carry episodes and the tend clock at pick-up / put-down / death.
import { createSim } from '@/sim/sim';
import { restore } from '@/sim/save';
import { generateWorld } from '@/worldgen';
import { defaultGameConfig } from '@/sim/createGame';
import type { ArchetypeId } from '@/sim/types';
import { TICKS_PER_DAY } from '@/sim/time';
export default async function main(args: string[]) {
  const [snap, arch, seedS, daysS] = args;
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };
  const base = defaultGameConfig('lasius-niger', Number(seedS), 'naturalist');
  const world = generateWorld({ ...base.world, archetype: arch as ArchetypeId });
  const sim = createSim(restore(new Uint8Array(fs.readFileSync(snap))).state, world);
  const col = sim.state.player.colonyId;
  const gd = (t: number) => (t / TICKS_PER_DAY).toFixed(3);
  const carry = new Map<number, { by: number; t: number; age: number }>();
  const tended = new Map<number, number>();
  const tendBy: Record<string, number> = {};
  sim.events.on('brood-died', (e) => {
    if (e.colonyId !== col) return;
    console.log(`${gd(sim.state.tick)} DIED ${e.broodId} ${e.stage}:${e.cause}`);
  });
  const end = sim.state.tick + Number(daysS) * TICKS_PER_DAY;
  while (sim.state.tick < end) {
    sim.tick();
    for (const b of sim.stores.brood.list) {
      if (!b.alive || b.colony !== col || b.stage === 'larva') continue;
      const c = carry.get(b.id);
      const age = (sim.state.tick - b.lastTendedTick) / TICKS_PER_DAY;
      if (b.carriedBy >= 0 && !c) carry.set(b.id, { by: b.carriedBy, t: sim.state.tick, age });
      if (b.carriedBy < 0 && c) {
        const a = sim.stores.ants.get(c.by);
        console.log(`${gd(sim.state.tick)} brood ${b.id} ${b.stage} carried ${((sim.state.tick - c.t) / TICKS_PER_DAY).toFixed(3)} gd by ${c.by} ${a?.task}/${a?.state}; tend clock at pick-up ${c.age.toFixed(3)}, at put-down ${age.toFixed(3)}`);
        carry.delete(b.id);
      }
      const prev = tended.get(b.id);
      if (prev !== undefined && prev !== b.lastTendedTick) {
        // who tended: the nearest worker
        let best = '', bd = Infinity;
        for (const a of sim.stores.ants.list) if (a.alive && a.colony === col) { const d = Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y, a.pos.z - b.pos.z); if (d < bd) { bd = d; best = `${a.task}/${a.state}`; } }
        tendBy[best] = (tendBy[best] ?? 0) + 1;
      }
      tended.set(b.id, b.lastTendedTick);
    }
  }
  console.log('tended by', JSON.stringify(tendBy));
}
