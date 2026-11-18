// Colony-life round 8 (R29 on paired trial): why the queen lays nothing after some hand-overs. Restores a cached
// hand-over and every 600 ticks for 3 gd prints R29's laying factors (care, finish), the queen chamber's live
// temperature and the finish factor's forecast for the next game days. Usage:
//   node tools/sim/run-ts.mjs tools/sim/probe/probe-lay8.ts CACHEFILE ARCHETYPE SEED
import type { ArchetypeId } from '@/sim/types';
import { defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { generateWorld } from '@/worldgen';
import { restore } from '@/sim/save';
import { TICKS_PER_DAY } from '@/sim/time';
import * as Q from '@/sim/colony/queen';
import * as E from '@/sim/colony/envAdapter';

const r2 = (x: number) => Math.round(x * 100) / 100;

export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };
  const [file, arch, seedS] = args;
  const base = defaultGameConfig('lasius-niger', Number(seedS), 'naturalist');
  const world = generateWorld({ ...base.world, archetype: arch as ArchetypeId });
  const sim = createSim(restore(new Uint8Array(fs.readFileSync(file))).state, world);
  const col = sim.stores.colonies.get(sim.state.player.colonyId)!;
  const def = sim.getSpecies(col.species)!;
  for (let k = 0; k < 12; k++) {
    for (let i = 0; i < 600; i++) sim.tick();
    const q = sim.stores.ants.get(col.queenId)!;
    const f = Q.layingFactors(sim, col, q, def);
    const d28 = E.d28Now(sim);
    const fc = q.chamberId >= 0 ? [0, 0.5, 1, 1.5, 2, 3, 4].map((dd) => r2(E.chamberForecastC(sim, q.chamberId, d28 + dd))) : null;
    console.log(JSON.stringify({ gd: r2(sim.state.tick / TICKS_PER_DAY), d28: r2(d28), qCh: q.chamberId, liveC: r2(E.chamberTempC(sim, q.chamberId)),
      forecast_d0_d4: fc, f: Object.fromEntries(Object.entries(f).map(([k2, v]) => [k2, r2(v as number)])) }));
  }
}
