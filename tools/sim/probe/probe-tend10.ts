// Round 10 probe (temporary): R35 point 5, why a colony tends no herd. Restores a cached hand-over and prints, every
// game hour: herds known / workable, tend demand / target / actual, forage demand / target, the demand sum against the
// workforce, the prospective protein rate, needC, sP.
//   node tools/sim/run-ts.mjs tools/sim/probe/probe-tend10.ts CACHE.bin ARCHETYPE SEED [DAYS]
import type { ArchetypeId } from '@/sim/types';
import { defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { SYSTEMS } from '@/sim/systems';
import { generateWorld } from '@/worldgen';
import { restore } from '@/sim/save';
import { TICKS_PER_DAY } from '@/sim/time';
import { taskIndex } from '@/sim/types';
import { colonySlotBit } from '@/sim/entities';
import { herdWorkable } from '@/sim/ecology/plants/demand';
import { herdSourceOf } from '@/sim/ecology/plants/links';

export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };
  const [file, arch, seedS, daysS] = args;
  const base = defaultGameConfig('lasius-niger', Number(seedS), 'naturalist');
  const world = generateWorld({ ...base.world, archetype: arch as ArchetypeId });
  const sim = createSim(restore(new Uint8Array(fs.readFileSync(file))).state, world, { systems: SYSTEMS });
  const col = sim.stores.colonies.get(sim.state.player.colonyId)!;
  const bit = colonySlotBit(sim, col.id);
  const T = (t: string) => taskIndex(t as never);
  const hours = Number(daysS ?? 3) * 24;
  const home = sim.stores.nests.get(col.nestIds[0])!.entrances[0].pos;
  const near: string[] = [];
  for (const hd of sim.stores.herds.list) {
    const s = herdSourceOf(sim, hd);
    if (!hd.alive || !s) continue;
    const dx = s.pos.x - home.x, dz = s.pos.z - home.z, dBu = Math.sqrt(dx * dx + dz * dz) / sim.world.bu;
    if (dBu < 300) near.push(`${dBu.toFixed(0)}BU a${hd.a.toFixed(0)} y${(s.pos.y / sim.world.bu).toFixed(1)}`);
  }
  console.log('herds within 300 BU:', near.sort((a, b) => parseFloat(a) - parseFloat(b)).join(', '));
  const herdLog: string[] = [];
  sim.events.on('decision' as never, () => {});
  void herdLog;
  for (let h = 0; h < hours; h++) {
    for (let t = 0; t < TICKS_PER_DAY / 24; t++) sim.tick();
    let alive = 0, known = 0, workable = 0;
    for (const hd of sim.stores.herds.list) {
      if (!hd.alive) continue;
      alive++;
      const s = herdSourceOf(sim, hd);
      if (s && (s.discoveredBy & bit) !== 0) known++;
      if (herdWorkable(sim, col, hd)) workable++;
    }
    const d = col.alloc.demand, tg = col.alloc.target, ac = col.alloc.actual;
    let sum = 0;
    for (let i = 0; i < d.length; i++) sum += d[i];
    const r = (x: number) => Math.round(x * 100) / 100;
    console.log(JSON.stringify({
      h: h + 1, workers: col.core?.workers, herds: [alive, known, workable],
      tend: [r(d[T('tend')]), tg[T('tend')], ac[T('tend')]], forage: [r(d[T('forage')]), tg[T('forage')], ac[T('forage')]],
      scout: [r(d[T('scout')]), tg[T('scout')]], nurse: [r(d[T('nurse')]), tg[T('nurse')]], sumDemand: r(sum),
      prospP: r(col.core?.acc['need.prospP'] ?? 0), needC: r(col.needs.needC), sP: r(col.needs.sP), C: r(col.stores.c), P: r(col.stores.p),
    }));
  }
}
