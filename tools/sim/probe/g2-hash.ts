// gate-sim-2 item 7 probe: state hash after N ticks from a snapshot (two trees that should not differ for Lasius).
//   node tools/sim/run-ts.mjs tools/sim/probe/g2-hash.ts FILE ARCH SEED TICKS
import type { ArchetypeId } from '@/sim/types';
import { createSim } from '@/sim/sim';
import { SYSTEMS } from '@/sim/systems';
import { defaultGameConfig } from '@/sim/createGame';
import { generateWorld } from '@/worldgen';
import { restore, stateHash } from '@/sim/save';

interface Fs { readFileSync(p: string): Uint8Array }

export default async function main(args: string[]): Promise<void> {
  const { readFileSync } = (await import('node:fs' as string)) as Fs;
  const [file, arch, seedS, ticksS] = args;
  const base = defaultGameConfig('lasius-niger', Number(seedS), 'naturalist');
  const config = { ...base, cheats: true, world: { ...base.world, archetype: arch as ArchetypeId } };
  const sim = createSim(restore(new Uint8Array(readFileSync(file))).state, generateWorld(config.world), { systems: SYSTEMS });
  const n = Number(ticksS);
  for (let i = 1; i <= n; i++) {
    sim.tick();
    if (i % 6000 === 0 || i === n) console.log(`tick ${sim.state.tick} hash ${stateHash(sim.state)}`);
  }
}
