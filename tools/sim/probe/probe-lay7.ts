// Round 7 probe (deleted at the end of the round): which gate of the queen's laying-protein path is shut, sampled
// every game hour from a cached hand-over.
//   node tools/sim/run-ts.mjs tools/sim/probe/probe-lay7.ts CACHEFILE ARCHETYPE SEED GD
import type { ArchetypeId } from '@/sim/types';
import { defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { generateWorld } from '@/worldgen';
import { restore } from '@/sim/save';
import { TICKS_PER_DAY } from '@/sim/time';
import { queenOf, layingProteinPermitted, layingReleaseShare, winterReserveShort, queenProteinCredit, BROOD_NEED_P_KEY, PROTEIN_INTAKE_KEY } from '@/sim/colony/queen';
import { daysOfStock, targetDays } from '@/sim/colony/needs';
import { cycleCensus } from '@/sim/colony/census';
import { d28Now } from '@/sim/colony/envAdapter';

export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };
  const [file, arch, seedS, gdS] = args;
  const base = defaultGameConfig('lasius-niger', Number(seedS), 'naturalist');
  const world = generateWorld({ ...base.world, archetype: arch as ArchetypeId });
  const sim = createSim(restore(new Uint8Array(fs.readFileSync(file))).state, world);
  const col = sim.state.colonies.find((c) => c.isPlayer) ?? sim.state.colonies[0];
  const t0 = sim.state.tick, end = t0 + Math.round(Number(gdS) * TICKS_PER_DAY), hour = Math.round(TICKS_PER_DAY / 24);
  let eggs0 = col.counters.eggsLaid;
  const r = (x: number) => Math.round(x * 100) / 100;
  while (sim.state.tick < end) {
    sim.tick();
    if ((sim.state.tick - t0) % hour !== 0) continue;
    const q = queenOf(sim, col);
    if (!q || !q.queen) { console.log('no queen'); break; }
    const cen = cycleCensus(sim, col), acc = col.core?.acc ?? {};
    const ds = daysOfStock(col), td = targetDays(col);
    const gates = [
      col.starvationStage !== 'fed' && col.starvationStage !== 'lean' ? `stage:${col.starvationStage}` : '',
      ds.p < 0.25 ? 'pDays' : '', cen.meanLarvalHunger > 0.6 ? 'hunger' : '',
      cen.larvae - cen.diapause > 3 * cen.nurses + 2 ? `larvae>${3 * cen.nurses + 2}` : '',
      winterReserveShort(sim, col, cen.workers) ? 'winterC' : '',
    ].filter(Boolean).join(',');
    const supply = col.stores.p + (acc[PROTEIN_INTAKE_KEY] ?? 0) * 0.5;
    console.log(JSON.stringify({ gd: r((sim.state.tick - t0) / TICKS_PER_DAY), d28: r(d28Now(sim)), w: cen.workers, nurses: cen.nurses,
      larvae: cen.larvae, C: r(col.stores.c), P: r(col.stores.p), pDays: r(ds.p), pTarget: r(td.p), permitted: layingProteinPermitted(sim, col),
      gates, release: r(layingReleaseShare(sim, col)), supply: r(supply), broodNeedP: r(acc[BROOD_NEED_P_KEY] ?? 0),
      pot: r(acc['lay.potential'] ?? 0), budget: r(q.queen.eggBudget), credit: r(queenProteinCredit(q)), gutP: r(q.queen.gut.p), gutC: r(q.queen.gut.c),
      eggs: col.counters.eggsLaid - eggs0 }));
  }
}
