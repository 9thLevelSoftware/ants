// Round 11 probe (temporary): direction 25 item 4, brood hygiene deaths (measurement). Restores a cached hand-over and
// logs every game hour in which a brood chamber holds more waste than the tolerance: the chamber, its brood, the waste
// items in it by kind (meconium / cocoon / brood-corpse / other), haul demand / target / actual, the haulers' states,
// and the brood that died of hygiene that hour.
//   node tools/sim/run-ts.mjs tools/sim/probe/probe-hyg11.ts CACHE.bin ARCHETYPE SEED [DAYS]
import type { ArchetypeId } from '@/sim/types';
import { defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { SYSTEMS } from '@/sim/systems';
import { generateWorld } from '@/worldgen';
import { restore } from '@/sim/save';
import { TICKS_PER_DAY } from '@/sim/time';
import { taskIndex } from '@/sim/types';

export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };
  const [file, arch, seedS, daysS] = args;
  const base = defaultGameConfig('lasius-niger', Number(seedS), 'naturalist');
  const world = generateWorld({ ...base.world, archetype: arch as ArchetypeId });
  const sim = createSim(restore(new Uint8Array(fs.readFileSync(file))).state, world, { systems: SYSTEMS });
  const col = sim.stores.colonies.get(sim.state.player.colonyId)!;
  const H = taskIndex('haul' as never);
  let hygDeaths: Record<string, number> = {};
  sim.events.on('brood-died' as never, (e: { cause?: string; stage?: string }) => {
    if (e.cause === 'hygiene') hygDeaths[e.stage ?? '?'] = (hygDeaths[e.stage ?? '?'] ?? 0) + 1;
  });
  const hours = Number(daysS ?? 13) * 24;
  for (let h = 0; h < hours; h++) {
    for (let t = 0; t < TICKS_PER_DAY / 24; t++) sim.tick();
    const byCh = new Map<number, Record<string, number>>();
    for (const it of sim.stores.items.list) {
      if (!it.alive || it.kind !== 'waste' || !it.inNest || it.colony !== col.id) continue;
      const r = byCh.get(it.chamberId) ?? {};
      const k = it.carrierIds.length > 0 ? 'carried' : (it.wasteKind ?? 'other');
      r[k] = (r[k] ?? 0) + 1; byCh.set(it.chamberId, r);
    }
    const brood = new Map<number, number>();
    for (const b of sim.stores.brood.list) if (b.alive && b.colony === col.id && b.chamberId >= 0) brood.set(b.chamberId, (brood.get(b.chamberId) ?? 0) + 1);
    const dirty: unknown[] = [];
    for (const [ch, n] of brood) {
      const w = col.core?.acc[`waste.${ch}`] ?? 0;
      if (w > 3 || Object.keys(hygDeaths).length) dirty.push({ ch, brood: n, wasteAcc: w, items: byCh.get(ch) ?? {} });
    }
    if (dirty.length === 0) { hygDeaths = {}; continue; }
    const haulers: Record<string, number> = {};
    for (const a of sim.stores.ants.list) if (a.alive && a.colony === col.id && a.task === 'haul') haulers[a.state] = (haulers[a.state] ?? 0) + 1;
    console.log(JSON.stringify({ d: Math.floor(h / 24) + 1, h: h % 24, workers: col.core?.workers, dirty, hygDeaths,
      haul: [Math.round(col.alloc.demand[H] * 10) / 10, col.alloc.target[H], col.alloc.actual[H]], haulers }));
    hygDeaths = {};
  }
}
