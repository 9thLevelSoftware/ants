// Round 12 probe (temporary): direction 26a item 1. Restores a cached hand-over and, every 1 s, for every scout of the
// player colony outside the nest, lists the unknown sources with food whose odour reaches her (ecology
// sourcesSmelledFrom, as noteSmelledFood reads it) and logs her state (phase), her perception's smelled source and
// whether the colony knows the source a minute later. Summary: scout-seconds in odour of unknown food by state and
// by the source's kind; sources first smelled by a scout and how they became known.
//   node tools/sim/run-ts.mjs tools/sim/probe/probe-scoutsmell12.ts CACHE.bin ARCHETYPE SEED [DAYS]
import type { ArchetypeId } from '@/sim/types';
import { defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { SYSTEMS } from '@/sim/systems';
import { generateWorld } from '@/worldgen';
import { restore } from '@/sim/save';
import { TICKS_PER_DAY } from '@/sim/time';
import { sourcesSmelledFrom } from '@/sim/ecology';
import { smelledSource } from '@/sim/ants/perception';

export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };
  const [file, arch, seedS, daysS] = args;
  const base = defaultGameConfig('lasius-niger', Number(seedS), 'naturalist');
  const world = generateWorld({ ...base.world, archetype: arch as ArchetypeId });
  const sim = createSim(restore(new Uint8Array(fs.readFileSync(file))).state, world, { systems: SYSTEMS });
  const col = sim.stores.colonies.get(sim.state.player.colonyId)!;
  const ticks = Number(daysS ?? 5) * TICKS_PER_DAY;
  const byState: Record<string, number> = {};
  const byStateKind: Record<string, number> = {};
  const perSource = new Map<number, { v: string; firstH: number; states: Record<string, number>; perceived: number; knownH: number }>();
  const out: number[] = [];
  for (let t = 0; t < ticks; t++) {
    sim.tick();
    for (const [id, r] of perSource) if (r.knownH < 0 && col.knownSourceIds.includes(id)) r.knownH = Math.round((t / TICKS_PER_DAY) * 240) / 10;
    if (t % 10 !== 0) continue;
    for (const a of sim.stores.ants.list) {
      if (!a.alive || a.colony !== col.id || a.task !== 'scout' || a.nestId >= 0) continue;
      for (const id of sourcesSmelledFrom(sim, a.pos, out)) {
        const s = sim.stores.sources.get(id);
        if (!s || s.herdId >= 0 || (s.c <= 0 && s.p <= 0) || col.knownSourceIds.includes(id)) continue;
        const kind = `${s.kind}/${s.variant ?? ''}`;
        byState[a.state] = (byState[a.state] ?? 0) + 1;
        byStateKind[`${s.p > s.c ? 'P' : 'C'} ${a.state}`] = (byStateKind[`${s.p > s.c ? 'P' : 'C'} ${a.state}`] ?? 0) + 1;
        let r = perSource.get(id);
        if (!r) { r = { v: kind, firstH: Math.round((t / TICKS_PER_DAY) * 240) / 10, states: {}, perceived: 0, knownH: -1 }; perSource.set(id, r); }
        r.states[a.state] = (r.states[a.state] ?? 0) + 1;
        if (smelledSource(a) === id) r.perceived++;
      }
    }
  }
  console.log(JSON.stringify({ scoutSecondsInOdourOfUnknownFoodByState: byState, byNutrientAndState: byStateKind }));
  for (const [id, r] of perSource) console.log(JSON.stringify({ src: id, ...r }));
}
