// Round 7 probe (deleted at the end of the round): nest field components of stuck nurses vs the royal chamber.
import type { ArchetypeId } from '@/sim/types';
import { defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { generateWorld } from '@/worldgen';
import { restore } from '@/sim/save';
import { TICKS_PER_DAY } from '@/sim/time';

export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };
  const [file, arch, seedS, atS] = args;
  const base = defaultGameConfig('lasius-niger', Number(seedS), 'naturalist');
  const world = generateWorld({ ...base.world, archetype: arch as ArchetypeId });
  const sim = createSim(restore(new Uint8Array(fs.readFileSync(file))).state, world);
  const col = sim.state.colonies.find((c) => c.isPlayer) ?? sim.state.colonies[0];
  const t0 = sim.state.tick, at = t0 + Math.round(Number(atS) * TICKS_PER_DAY);
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const report = () => {
    const nest = sim.state.nests.find((n) => n.id === col.nestIds[0])!;
    const nav = sim.nestNav;
    const ids = nav.targets().filter((id) => id.startsWith(`nest:${nest.id}:`));
    console.log(`tick ${sim.state.tick} (gd+${r1((sim.state.tick - t0) / TICKS_PER_DAY * 100) / 100}) fields ${ids.join(' ')}`);
    for (const c of nest.chambers) console.log(`  chamber ${c.id} ${c.type} center comp ${nav.componentAt(c.center)} (${r1(c.center.x)},${r1(c.center.y)},${r1(c.center.z)})`);
    for (const e of nest.entrances) console.log(`  entrance ${e.id} ${e.status} comp ${nav.componentAt(e.pos)} r ${r1(e.radius)}`);
    for (const a of sim.state.ants) {
      if (!a.alive || a.colony !== col.id || a.nestId !== nest.id) continue;
      const d = ids.map((id) => `${id.split(':').slice(2).join(':')}=${r1(nav.distanceAt(id, a.pos))}`).join(' ');
      console.log(`  ant ${a.id} ${a.task}/${a.state} comp ${nav.componentAt(a.pos)} pos (${r1(a.pos.x)},${r1(a.pos.y)},${r1(a.pos.z)}) ch${a.chamberId} nav ${a.nav.mode}/${a.nav.status} ${a.nav.failReason ?? ''} | ${d}`);
    }
    for (const b of sim.state.brood) if (b.alive && b.colony === col.id) console.log(`  brood ${b.id} ${b.stage} comp ${nav.componentAt(b.pos)} ch${b.chamberId}`);
  };
  while (sim.state.tick < at) sim.tick();
  report();
}
