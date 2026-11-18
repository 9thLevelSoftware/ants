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
import { devRate, stageDu } from '@/sim/colony/life';

const r2 = (x: number) => Math.round(x * 100) / 100;

export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };
  const [file, arch, seedS] = args;
  const base = defaultGameConfig('lasius-niger', Number(seedS), 'naturalist');
  const world = generateWorld({ ...base.world, archetype: arch as ArchetypeId });
  const sim = createSim(restore(new Uint8Array(fs.readFileSync(file))).state, world);
  const col = sim.stores.colonies.get(sim.state.player.colonyId)!;
  const def = sim.getSpecies(col.species)!;
  // the finish factor's own walk from now (queen.ts finishFactor), printed step by step once
  {
    for (let i = 0; i < 600; i++) sim.tick();
    const q = sim.stores.ants.get(col.queenId)!;
    const toPupa = stageDu(def, 'egg', 'worker') + stageDu(def, 'larva', 'worker');
    const toAdult = toPupa + stageDu(def, 'pupa', 'worker');
    let du = 0;
    const walk: string[] = [];
    for (let t = E.d28Now(sim); t < 21 && du < toAdult; t += 0.25) {
      const tc = E.chamberForecastC(sim, q.chamberId, t + 0.125);
      du += devRate(def, tc) * 0.25;
      walk.push(`${r2(t)}:${r2(tc)}C/${r2(du)}`);
    }
    console.log(JSON.stringify({ toPupa, toAdult, walk: walk.join(' ') }));
  }
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
