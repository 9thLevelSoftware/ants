// gate-sim-2 fix probe: does a save / restore in the middle change the run? (item 4 kept: climbToFree reads the field
// gradient). node tools/sim/run-ts.mjs tools/sim/probe/g2f-restore.ts FILE ARCH SEED SAVE_AT TICKS EVERY
import type { ArchetypeId, Sim } from '@/sim/types';
import { createSim } from '@/sim/sim';
import { SYSTEMS } from '@/sim/systems';
import { defaultGameConfig } from '@/sim/createGame';
import { generateWorld } from '@/worldgen';
import { restore, snapshot, stateHash } from '@/sim/save';

interface Fs { readFileSync(p: string): Uint8Array }

export default async function main(args: string[]): Promise<void> {
  const { readFileSync } = (await import('node:fs' as string)) as Fs;
  const [file, arch, seedS, saveS, ticksS, everyS] = args;
  const base = defaultGameConfig('lasius-niger', Number(seedS), 'naturalist');
  const config = { ...base, cheats: true, world: { ...base.world, archetype: arch as ArchetypeId } };
  const world = generateWorld(config.world);
  const bytes = new Uint8Array(readFileSync(file));
  const saveAt = Number(saveS), n = Number(ticksS), every = Number(everyS);
  const run = (sim: Sim, from: number, to: number, tag: string, out: Map<number, string>): void => {
    for (let i = from + 1; i <= to; i++) {
      sim.tick();
      if (i % every === 0) { const h = stateHash(sim.state); out.set(i, h); }
    }
    console.log(`${tag} done to ${to}`);
  };
  const a = new Map<number, string>(), b = new Map<number, string>();
  const simA = createSim(restore(bytes).state, world, { systems: SYSTEMS });
  run(simA, 0, n, 'A (continuous)', a);
  const simB0 = createSim(restore(bytes).state, world, { systems: SYSTEMS });
  run(simB0, 0, saveAt, 'B (before save)', b);
  const mid = snapshot(simB0);
  const simB = createSim(restore(mid).state, world, { systems: SYSTEMS });
  run(simB, saveAt, n, 'B (after restore)', b);
  let first = -1;
  for (const [t, h] of a) {
    const hb = b.get(t);
    console.log(`tick +${t} A ${h} B ${hb}${h === hb ? '' : '  DIFF'}`);
    if (h !== hb && first < 0) first = t;
  }
  console.log(first < 0 ? 'EQUAL' : `FIRST DIFF at +${first} ticks (save at +${saveAt})`);
}
