// Independent review after colony-life round 6 (fix RS): save -> load must not change the run. Restores a cached
// hand-over, runs it, and at several split points snapshots the live sim, builds a second sim from the snapshot, steps
// both the same number of ticks and compares stateHash. Usage:
//   node tools/sim/run-ts.mjs tools/sim/probe/probe-restore-r6.ts CACHEFILE ARCHETYPE SEED [SPLITS] [EVERY] [AFTER]
import type { ArchetypeId } from '@/sim/types';
import { defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { generateWorld } from '@/worldgen';
import { restore, snapshot, stateHash } from '@/sim/save';

export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };
  const [file, arch, seedS, splitsS, everyS, afterS] = args;
  const seed = Number(seedS), splits = Number(splitsS ?? 6), every = Number(everyS ?? 1500), after = Number(afterS ?? 300);
  const base = defaultGameConfig('lasius-niger', seed, 'naturalist');
  const world = generateWorld({ ...base.world, archetype: arch as ArchetypeId });
  const a = createSim(restore(new Uint8Array(fs.readFileSync(file))).state, world);
  for (let s = 0; s < splits; s++) {
    for (let i = 0; i < every; i++) a.tick();
    const snap = snapshot(a);
    const b = createSim(restore(snap).state, world);
    const t0 = a.state.tick;
    let firstDiff = -1;
    // a second copy of the live sim, so A runs on unchanged
    const a2 = createSim(restore(snap).state, world);
    void a2;
    for (let i = 0; i < after; i++) {
      a.tick(); b.tick();
      if (firstDiff < 0 && (i % 10 === 9) && stateHash(a.state) !== stateHash(b.state)) firstDiff = i + 1;
    }
    const ha = stateHash(a.state), hb = stateHash(b.state);
    console.log(JSON.stringify({ split: t0, after, equal: ha === hb, firstDiffTick: firstDiff, ha, hb, ants: a.state.ants.filter((x) => x.alive).length }));
  }
}
