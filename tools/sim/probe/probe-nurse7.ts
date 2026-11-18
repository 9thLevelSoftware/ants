// Round 7 probe (deleted at the end of the round): where the nurses are while eggs in a chamber go untended.
//   node tools/sim/run-ts.mjs tools/sim/probe/probe-nurse7.ts CACHEFILE ARCHETYPE SEED FROM_GD TO_GD CHAMBER_ID
import type { ArchetypeId } from '@/sim/types';
import { defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { generateWorld } from '@/worldgen';
import { restore } from '@/sim/save';
import { TICKS_PER_DAY } from '@/sim/time';

export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };
  const [file, arch, seedS, fromS, toS, chS] = args;
  const base = defaultGameConfig('lasius-niger', Number(seedS), 'naturalist');
  const world = generateWorld({ ...base.world, archetype: arch as ArchetypeId });
  const sim = createSim(restore(new Uint8Array(fs.readFileSync(file))).state, world);
  const col = sim.state.colonies.find((c) => c.isPlayer) ?? sim.state.colonies[0];
  const t0 = sim.state.tick, from = t0 + Math.round(Number(fromS) * TICKS_PER_DAY), to = t0 + Math.round(Number(toS) * TICKS_PER_DAY);
  const chId = Number(chS), bu = sim.world.bu, r1 = (v: number) => Math.round(v * 10) / 10;
  while (sim.state.tick < to) {
    sim.tick();
    if (sim.state.tick < from || sim.state.tick % 100 !== 0) continue;
    const nest = sim.state.nests.find((n) => n.id === col.nestIds[0])!;
    const ch = nest.chambers.find((c) => c.id === chId);
    const c = ch?.center ?? { x: 0, y: 0, z: 0 };
    console.log(`gd+${r1((sim.state.tick - t0) / TICKS_PER_DAY * 100) / 100} ch${chId} flooded ${ch ? r1(ch.flooded) : '-'} alarm ${r1(sim.phero.sample(col.id, 'alarm', c))} entrances ${nest.entrances.map((e) => `${e.status} (${r1(e.pos.x)},${r1(e.pos.y)},${r1(e.pos.z)})`).join(";")} chamber center (${r1(c.x)},${r1(c.y)},${r1(c.z)})`);
    for (const a of sim.state.ants) {
      if (!a.alive || a.colony !== col.id || a.task !== 'nurse') continue;
      const n = a.nav;
      console.log(`  ${a.id} ${a.state} pos (${r1(a.pos.x)}, ${r1(a.pos.y)}, ${r1(a.pos.z)}) d${r1(Math.hypot(a.pos.x - c.x, a.pos.y - c.y, a.pos.z - c.z) / bu)}BU ch${a.chamberId} nav ${n.mode}/${n.status} field ${n.fieldKind}:${n.fieldTarget} dest d${r1(Math.hypot(n.dest.x - c.x, n.dest.y - c.y, n.dest.z - c.z) / bu)}BU stuck ${n.stuckTicks} fail ${n.failReason} f${r1(sim.field.sampleXYZ(a.pos.x, a.pos.y, a.pos.z))} ground ${r1(sim.field.height(a.pos.x, a.pos.z))} up (${r1(a.up.x)},${r1(a.up.y)},${r1(a.up.z)}) job ${a.bb['bn.jk']}:${a.bb['bn.ji']}->${a.bb['bn.jd']}`);
    }
  }
}
