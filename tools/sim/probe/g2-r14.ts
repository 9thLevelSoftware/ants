// gate-sim-2 item 6 probe (R13 / R14): for one hand-over snapshot, the founding site's flood reading (assessSite at
// the nest origin: floodSafety factor, raw floodRisk) and the game hours from the hand-over until an entrance is open.
//   node tools/sim/run-ts.mjs tools/sim/probe/g2-r14.ts FILE ARCH SEED
import type { ArchetypeId } from '@/sim/types';
import { createSim } from '@/sim/sim';
import { SYSTEMS } from '@/sim/systems';
import { defaultGameConfig } from '@/sim/createGame';
import { generateWorld } from '@/worldgen';
import { restore } from '@/sim/save';
import { TICKS_PER_HOUR } from '@/sim/time';
import { assessSite } from '@/sim/colony/founding/siteAssess';

interface Fs { readFileSync(p: string): Uint8Array }

export default async function main(args: string[]): Promise<void> {
  const { readFileSync } = (await import('node:fs' as string)) as Fs;
  const [file, arch, seedS] = args;
  const base = defaultGameConfig('lasius-niger', Number(seedS), 'naturalist');
  const config = { ...base, cheats: true, world: { ...base.world, archetype: arch as ArchetypeId } };
  const sim = createSim(restore(new Uint8Array(readFileSync(file))).state, generateWorld(config.world), { systems: SYSTEMS });
  const col = sim.stores.colonies.get(sim.state.player.colonyId)!;
  const nest = sim.stores.nests.get(col.nestIds[0])!;
  const site = assessSite(sim, nest.origin);
  const t0 = sim.state.tick;
  let open = -1;
  const status0 = nest.entrances.map((e) => e.status).join(',');
  for (let i = 0; i < 12 * TICKS_PER_HOUR && open < 0; i++) {
    sim.tick();
    if (nest.entrances.some((e) => e.status === 'open')) open = sim.state.tick - t0;
  }
  console.log(`R14 ${arch} ${seedS}: entrances at hand-over ${status0}; open after ${open < 0 ? '> 12' : (open / TICKS_PER_HOUR).toFixed(2)} game h; site floodSafety ${site.factors.map((f) => f.toFixed(2)).join('/')} floodRisk ${site.raw.floodRisk.toFixed(3)} word ${site.word}`);
}
