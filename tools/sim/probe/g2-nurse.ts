// gate-sim-2 item 4 probe: kd #3 larvae starving with protein in store. Restores a hand-over and, every PERIOD ticks
// until game day DAYS after it, prints the colony's stores, the larvae (chamber, hunger, gut, fed, claim) and every
// nurse-task worker (state, chamber, crop, job, nav). Reads state only.
//   node tools/sim/run-ts.mjs tools/sim/probe/g2-nurse.ts FILE ARCH SEED [DAYS] [PERIOD]
import type { ArchetypeId } from '@/sim/types';
import { createSim } from '@/sim/sim';
import { SYSTEMS } from '@/sim/systems';
import { defaultGameConfig } from '@/sim/createGame';
import { generateWorld } from '@/worldgen';
import { restore } from '@/sim/save';
import { TICKS_PER_DAY } from '@/sim/time';
import { ti } from '@/sim/colony/taskIdx';

interface Fs { readFileSync(p: string): Uint8Array }
const f2 = (x: number) => x.toFixed(2);

export default async function main(args: string[]): Promise<void> {
  const { readFileSync } = (await import('node:fs' as string)) as Fs;
  const [file, arch, seedS, daysS, periodS] = args;
  const days = Number(daysS ?? 6), period = Number(periodS ?? 300);
  const base = defaultGameConfig('lasius-niger', Number(seedS), 'naturalist');
  const config = { ...base, cheats: true, world: { ...base.world, archetype: arch as ArchetypeId } };
  const sim = createSim(restore(new Uint8Array(readFileSync(file))).state, generateWorld(config.world), { systems: SYSTEMS });
  const col = sim.stores.colonies.get(sim.state.player.colonyId)!;
  const t0 = sim.state.tick, bu = sim.world.bu;
  const deaths: string[] = [];
  sim.events.on('brood-died' as never, (e: { broodId: number; cause: string }) => { deaths.push(`t ${sim.state.tick} brood ${e.broodId} ${e.cause}`); });
  while (sim.state.tick - t0 < days * TICKS_PER_DAY) {
    sim.tick();
    if ((sim.state.tick - t0) % period !== 0) continue;
    const gd = (sim.state.tick - t0) / TICKS_PER_DAY;
    const nest = sim.stores.nests.get(col.nestIds[0]);
    const ch = nest ? nest.chambers.map((c) => `${c.id}:${c.type}@${f2(c.center.x)},${f2(c.center.y)},${f2(c.center.z)} r${f2(c.radii.x / bu)}`).join(' ') : '-';
    console.log(`T ${sim.state.tick} gd ${f2(gd)} stores C ${f2(col.stores.c)} P ${f2(col.stores.p)} needP ${f2(col.needs.needP)} nurse d ${f2(col.alloc.demand[ti('nurse')])} t ${col.alloc.target[ti('nurse')]} chambers ${ch}`);
    for (const b of sim.stores.brood.list) {
      if (!b.alive || b.colony !== col.id || b.stage !== 'larva') continue;
      console.log(`  L ${b.id} ch ${b.chamberId} pos ${f2(b.pos.x)},${f2(b.pos.y)},${f2(b.pos.z)} hunger ${f2(b.hunger)} hT ${b.hungerTicks} pS ${b.pStarveTicks} gut ${f2(b.gutC)}/${f2(b.gutP)} fed ${f2(b.fedC)}/${f2(b.fedP)} carried ${b.carriedBy}`);
    }
    for (const a of sim.stores.ants.list) {
      if (!a.alive || a.colony !== col.id || a.task !== 'nurse') continue;
      console.log(`  N ${a.id} ${a.state} ch ${a.chamberId} nest ${a.nestId} pos ${f2(a.pos.x)},${f2(a.pos.y)},${f2(a.pos.z)} crop ${f2(a.cropC)}/${f2(a.cropP)} cap ${f2(a.cropCap)} job ${a.bb['bn.jk'] ?? -1}:${a.bb['bn.ji'] ?? -1} fb ${(a.bb['bn.fb'] ?? 0) - sim.state.tick} skip ${a.bb['bn.sx'] ?? -1} nav ${a.nav.status} act ${a.action?.id ?? '-'}:${a.action?.reason ?? ''} age ${sim.state.tick - a.stateTick}`);
    }
    while (deaths.length) console.log(`  D ${deaths.shift()}`);
  }
}
