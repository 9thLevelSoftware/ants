// Round 14 Part B probe (tool-side, measures only): a life run's save -> load -> continue. Restores FILE (a --save-y2 or
// hand-over snapshot) as life.ts does, runs it K ticks (run C), snapshots, restores that into D and steps C and D side
// by side, comparing state hashes every H ticks from tick K + FROM; at the first difference prints the fields.
//   node tools/sim/run-ts.mjs tools/sim/probe/probe-restore14b.ts FILE ARCH SEED K|@T N [H] [FROM]
import type { ArchetypeId } from '@/sim/types';
import { createSim } from '@/sim/sim';
import { SYSTEMS } from '@/sim/systems';
import { defaultGameConfig } from '@/sim/createGame';
import { generateWorld } from '@/worldgen';
import { restore, snapshot, stateHash } from '@/sim/save';
import { decode, encode } from '@/core/serialize';
import { TICKS_PER_DAY } from '@/sim/time';
import { diff } from './probe-restore14';

interface Fs { readFileSync(p: string): Uint8Array; writeFileSync(p: string, d: string): void }

export default async function main(args: string[]): Promise<void> {
  const { readFileSync } = (await import('node:fs' as string)) as Fs;
  const [file, arch, seedS, kS, nS, hS, fromS] = args;
  const seed = Number(seedS), K0 = kS.startsWith('@') ? -Number(kS.slice(1)) : Number(kS), N = Number(nS), H = Number(hS ?? 50), FROM = Number(fromS ?? 0);
  const base = defaultGameConfig('lasius-niger', seed, 'naturalist');
  const config = { ...base, cheats: true, world: { ...base.world, archetype: arch as ArchetypeId } };
  const world = generateWorld(config.world);
  const c = createSim(restore(new Uint8Array(readFileSync(file))).state, world, { systems: SYSTEMS });
  // K: ticks to run before the save; '@T': run until absolute tick T
  const K = K0 < 0 ? -K0 - c.state.tick : K0;
  for (let i = 0; i < K; i++) c.tick();
  const saved = snapshot(c);
  const d = createSim(restore(saved).state, world, { systems: SYSTEMS });
  console.log(`C restored from ${file}, ran ${K} ticks to tick ${c.state.tick} (gd ${(c.state.tick / TICKS_PER_DAY).toFixed(3)}); D = its snapshot; ${stateHash(c.state) === stateHash(d.state) ? 'equal' : 'DIFFERENT'} at the save`);
  for (let t = 1; t <= N; t++) {
    c.tick(); d.tick();
    if (t < FROM || t % H !== 0) continue;
    const hc = stateHash(c.state), hd = stateHash(d.state);
    if (hc !== hd) {
      console.log(`first difference seen ${t} ticks after the save (tick ${c.state.tick}, gd ${(c.state.tick / TICKS_PER_DAY).toFixed(3)}): ${hc} vs ${hd}`);
      const out: string[] = []; diff(decode(encode(c.state)), decode(encode(d.state)), 'state', out, 80); console.log(out.join('\n'));
      return;
    }
    if (t % (H * 100) === 0) console.log(`equal at +${t} (gd ${(c.state.tick / TICKS_PER_DAY).toFixed(3)})`);
  }
  console.log(`equal for ${N} ticks`);
}
