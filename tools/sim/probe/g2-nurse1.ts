// gate-sim-2 item 4 probe: one nurse's walk, every EVERY ticks from tick T0 to T1 (state, nav, pass phase, target).
//   node tools/sim/run-ts.mjs tools/sim/probe/g2-nurse1.ts FILE ARCH SEED ANT T0 T1 [EVERY]
import type { ArchetypeId } from '@/sim/types';
import { createSim } from '@/sim/sim';
import { SYSTEMS } from '@/sim/systems';
import { defaultGameConfig } from '@/sim/createGame';
import { generateWorld } from '@/worldgen';
import { restore } from '@/sim/save';

interface Fs { readFileSync(p: string): Uint8Array }
const f1 = (x: number) => x.toFixed(1);

export default async function main(args: string[]): Promise<void> {
  const { readFileSync } = (await import('node:fs' as string)) as Fs;
  const [file, arch, seedS, antS, t0S, t1S, everyS] = args;
  const base = defaultGameConfig('lasius-niger', Number(seedS), 'naturalist');
  const config = { ...base, cheats: true, world: { ...base.world, archetype: arch as ArchetypeId } };
  const sim = createSim(restore(new Uint8Array(readFileSync(file))).state, generateWorld(config.world), { systems: SYSTEMS });
  const id = Number(antS), t0 = Number(t0S), t1 = Number(t1S), every = Number(everyS ?? 10);
  while (sim.state.tick < t1) {
    sim.tick();
    if (sim.state.tick < t0 || sim.state.tick % every !== 0) continue;
    const a = sim.stores.ants.get(id);
    if (!a) { console.log('gone'); return; }
    const b = sim.stores.brood.get(a.bb['bn.ji'] ?? -1);
    const n = a.nav;
    console.log(`t ${sim.state.tick} ${a.task}/${a.state} pos ${f1(a.pos.x)},${f1(a.pos.y)},${f1(a.pos.z)} ch ${a.chamberId} nest ${a.nestId} med ${a.medium} f ${f1(sim.field.sample(a.pos))}`
      + ` | job ${a.bb['bn.ji'] ?? -1} at ${b ? `${f1(b.pos.x)},${f1(b.pos.y)},${f1(b.pos.z)} fB ${f1(sim.field.sample(b.pos))}` : '-'} phase ${a.bb['bn.n'] ?? 0} pass ${f1(a.bb['bn.qx'] ?? 0)},${f1(a.bb['bn.qy'] ?? 0)},${f1(a.bb['bn.qz'] ?? 0)}`
      + ` | nav ${n.mode} ${n.status} dest ${f1(n.dest.x)},${f1(n.dest.y)},${f1(n.dest.z)} ${n.destKind}:${n.destId} field ${n.fieldKind}:${n.fieldTarget} act ${a.action?.id ?? '-'} speed ${f1(a.speed)}`);
  }
}
