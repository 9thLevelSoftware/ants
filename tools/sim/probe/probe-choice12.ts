// Round 12 probe (temporary): direction 26 item 2. Restores a cached hand-over and, for every forager of the player
// colony that leaves forage.wait for an outbound trip, re-scores her choice one tick later with the module's own
// functions (choice.ts knownSources / sourceScore / tripNutrients, hunt.ts choosePatch): every candidate source's
// nutrients per trip, distance and score U, the best patch's U, the colony's weights wC / wP and needs, and her pick.
// Summary: picks by nutrient, and for C picks the share where a patch was known and its U lost.
//   node tools/sim/run-ts.mjs tools/sim/probe/probe-choice12.ts CACHE.bin ARCHETYPE SEED [DAYS]
import type { ArchetypeId } from '@/sim/types';
import { defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { SYSTEMS } from '@/sim/systems';
import { generateWorld } from '@/worldgen';
import { restore } from '@/sim/save';
import { TICKS_PER_DAY } from '@/sim/time';
import { nutrientWeights } from '@/sim/colony';
import { knownSources, sourceScore, tripNutrients } from '@/sim/ants/behaviours/outdoor/choice';
import { choosePatch } from '@/sim/ants/behaviours/outdoor/hunt';
import { FORAGE } from '@/sim/ants/behaviours/outdoor/flavours';
import { distFromHome } from '@/sim/ants/behaviours/outdoor/common';

export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };
  const [file, arch, seedS, daysS] = args;
  const base = defaultGameConfig('lasius-niger', Number(seedS), 'naturalist');
  const world = generateWorld({ ...base.world, archetype: arch as ArchetypeId });
  const sim = createSim(restore(new Uint8Array(fs.readFileSync(file))).state, world, { systems: SYSTEMS });
  const col = sim.stores.colonies.get(sim.state.player.colonyId)!;
  const bu = sim.world.bu;
  const ticks = Number(daysS ?? 2) * TICKS_PER_DAY;
  const last = new Map<number, string>();
  const cand: number[] = [];
  const sum = { picks: { C: 0, P: 0, hunt: 0 }, cWithPatch: 0, cPatchU: [] as number[], cU: [] as number[] };
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  for (let t = 0; t < ticks; t++) {
    sim.tick();
    for (const a of sim.stores.ants.list) {
      if (!a.alive || a.colony !== col.id || a.task !== 'forage') { last.delete(a.id); continue; }
      const was = last.get(a.id);
      last.set(a.id, a.state);
      if (was !== 'forage.wait' || a.state !== 'forage.outbound') continue;
      const w = nutrientWeights(col);
      knownSources(sim, a, cand);
      const cands = cand.map((id) => {
        const s = sim.stores.sources.get(id);
        if (!s) return null;
        const n = tripNutrients(sim, a, s);
        return { id, v: s.variant ?? s.kind, c: r3(n.c), p: r3(n.p), dBu: Math.round(distFromHome(sim, a, s.pos) / bu), U: r3(sourceScore(sim, a, s) * 1000) };
      }).filter((x) => x !== null);
      const hunt = choosePatch(sim, a, FORAGE);
      const src = a.bb['fo.src'] ?? -1, patch = a.bb['fo.patch'] ?? -1;
      const picked = src >= 0 ? cands.find((c) => c!.id === src) : null;
      const kind = src < 0 ? (patch >= 0 ? 'hunt' : 'marker') : (picked && picked.p > picked.c ? 'P' : 'C');
      if (kind === 'hunt') sum.picks.hunt++; else if (kind === 'P') sum.picks.P++; else if (kind === 'C') sum.picks.C++;
      if (kind === 'C' && hunt) { sum.cWithPatch++; sum.cPatchU.push(r3(hunt.u * 1000)); sum.cU.push(picked ? picked.U : 0); }
      console.log(JSON.stringify({
        d: Math.floor(t / TICKS_PER_DAY), h: Math.floor(((t % TICKS_PER_DAY) / TICKS_PER_DAY) * 24), ant: a.id, pick: kind, src, patch,
        wC: r3(w.wC), wP: r3(w.wP), needC: r3(col.needs.needC), needP: r3(col.needs.needP), sP: r3(col.needs.sP),
        stores: { c: r3(col.stores.c), p: r3(col.stores.p) }, crop: r3(a.cropCap), carry: r3(a.carryCap),
        patchU: hunt ? r3(hunt.u * 1000) : null, patchId: hunt ? hunt.patch.id : null, cands,
      }));
    }
  }
  console.log(JSON.stringify({ summary: sum }));
}
