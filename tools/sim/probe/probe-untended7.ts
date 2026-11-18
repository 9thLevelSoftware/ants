// Round 7 probe (deleted at the end of the round): egg / pupa piles left untended past UNTENDED_GD, with what the
// colony's nurses were doing then. Sampled every 50 ticks from a cached hand-over.
//   node tools/sim/run-ts.mjs tools/sim/probe/probe-untended7.ts CACHEFILE ARCHETYPE SEED GD
import type { ArchetypeId } from '@/sim/types';
import { defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { generateWorld } from '@/worldgen';
import { restore } from '@/sim/save';
import { TICKS_PER_DAY } from '@/sim/time';
import { UNTENDED_GD } from '@/sim/balance';

export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };
  const [file, arch, seedS, gdS] = args;
  const base = defaultGameConfig('lasius-niger', Number(seedS), 'naturalist');
  const world = generateWorld({ ...base.world, archetype: arch as ArchetypeId });
  const sim = createSim(restore(new Uint8Array(fs.readFileSync(file))).state, world);
  const col = sim.state.colonies.find((c) => c.isPlayer) ?? sim.state.colonies[0];
  const t0 = sim.state.tick, end = t0 + Math.round(Number(gdS) * TICKS_PER_DAY);
  const lim = UNTENDED_GD * TICKS_PER_DAY;
  const deaths: string[] = [];
  sim.events.on('brood-died' as never, ((e: { broodId: number; cause: string }) => deaths.push(`${e.cause}`)) as never);
  let lastPrint = -1e9;
  while (sim.state.tick < end) {
    sim.tick();
    if (sim.state.tick % 50 !== 0) continue;
    const late = sim.state.brood.filter((b) => b.alive && b.colony === col.id && b.stage !== 'larva' && b.carriedBy === -1 && sim.state.tick - b.lastTendedTick > lim);
    if (late.length === 0 || sim.state.tick - lastPrint < 600) continue;
    lastPrint = sim.state.tick;
    const ants = sim.state.ants.filter((a) => a.alive && a.colony === col.id && a.caste === 'worker');
    const nurses = ants.filter((a) => a.task === 'nurse');
    const near = (b: (typeof late)[0]) => Math.min(...nurses.map((a) => Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y, a.pos.z - b.pos.z)));
    const byTask: Record<string, number> = {};
    for (const a of ants) byTask[a.task] = (byTask[a.task] ?? 0) + 1;
    console.log(JSON.stringify({
      gd: Math.round(((sim.state.tick - t0) / TICKS_PER_DAY) * 100) / 100, late: late.map((b) => `${b.stage[0]}${b.id}@ch${b.chamberId} ${Math.round((sim.state.tick - b.lastTendedTick) / TICKS_PER_DAY * 100) / 100}gd nurse${Math.round(near(b))}mm`).slice(0, 6), nLate: late.length,
      nurses: nurses.map((a) => `${a.state}/${a.nav.status}${a.nestId < 0 ? '/out' : ''}`), byTask, demandNurse: Math.round((col.alloc.demand[2] ?? 0) * 10) / 10, deathsSoFar: deaths.length,
    }));
  }
  console.log(JSON.stringify({ deaths }));
}
