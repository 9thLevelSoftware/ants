// Round 12 probe (temporary): direction 26 item 1, R39. Restores a cached hand-over and, every game hour, logs the
// allocation's demand / target / actual for forage, tend, scout and idle, the old tend demand (Σ slots, herdTendDemand),
// the forage cap (known.ants + 1), the forage want of each nutrient, the known patches holding prey, and the stores.
//   node tools/sim/run-ts.mjs tools/sim/probe/probe-r39.ts CACHE.bin ARCHETYPE SEED [DAYS]
import type { ArchetypeId } from '@/sim/types';
import { taskIndex } from '@/sim/types';
import { defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { SYSTEMS } from '@/sim/systems';
import { generateWorld } from '@/worldgen';
import { restore } from '@/sim/save';
import { TICKS_PER_DAY } from '@/sim/time';
import { herdTendDemand } from '@/sim/ecology/plants/demand';
import { forageWant, knownCapacity } from '@/sim/colony/allocation/demand';
import { colonySlotBit } from '@/sim/entities';

export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };
  const [file, arch, seedS, daysS] = args;
  const base = defaultGameConfig('lasius-niger', Number(seedS), 'naturalist');
  const world = generateWorld({ ...base.world, archetype: arch as ArchetypeId });
  const sim = createSim(restore(new Uint8Array(fs.readFileSync(file))).state, world, { systems: SYSTEMS });
  const col = sim.stores.colonies.get(sim.state.player.colonyId)!;
  const hours = Number(daysS ?? 3) * 24;
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const T = (t: string) => taskIndex(t as never);
  const sum = { forage: 0, tend: 0, scout: 0, idle: 0, oldTend: 0, newTend: 0, n: 0 };
  for (let h = 0; h < hours; h++) {
    for (let t = 0; t < TICKS_PER_DAY / 24; t++) sim.tick();
    const a = col.alloc, k = knownCapacity(sim, col), w = forageWant(col);
    const bit = colonySlotBit(sim, col.id);
    const patches = sim.state.ecology.preyPatches.filter((p) => ((p.knownBy ?? 0) & bit) !== 0 && p.count >= 1).map((p) => r2(p.count));
    const row = {
      d: Math.floor(h / 24), h: h % 24, workers: col.core?.workers,
      forage: [r2(a.demand[T('forage')]), a.target[T('forage')], a.actual[T('forage')]],
      tend: [r2(a.demand[T('tend')]), a.target[T('tend')], a.actual[T('tend')]], oldTend: herdTendDemand(sim, col.id),
      scout: [r2(a.demand[T('scout')]), a.target[T('scout')], a.actual[T('scout')]],
      idle: [a.target[T('idle')], a.actual[T('idle')]], forageCap: r2(k.ants + 1), want: { c: r2(w.c), p: r2(w.p) },
      patchesWithPrey: patches, stores: { c: r2(col.stores.c), p: r2(col.stores.p) },
    };
    sum.forage += a.actual[T('forage')]; sum.tend += a.actual[T('tend')]; sum.scout += a.actual[T('scout')]; sum.idle += a.actual[T('idle')];
    sum.oldTend += herdTendDemand(sim, col.id); sum.newTend += a.demand[T('tend')]; sum.n++;
    console.log(JSON.stringify(row));
  }
  const m = (x: number) => r2(x / sum.n);
  console.log(JSON.stringify({ meanActual: { forage: m(sum.forage), tend: m(sum.tend), scout: m(sum.scout), idle: m(sum.idle) }, meanTendDemand: { slots: m(sum.oldTend), r39: m(sum.newTend) } }));
}
