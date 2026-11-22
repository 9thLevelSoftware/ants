// Review after colony-life round 8: suburban-garden #3 made 2 trips in 12 gd. Restores the cached hand-over and, every
// game hour for the first 2 gd, prints each worker's task, state, phase, nav status / fail reason, nest and chamber,
// and the colony's forage / scout demand and targets (tool-side observer; changes nothing).
//   node tools/sim/run-ts.mjs tools/sim/probe/probe-idle8.ts CACHE.bin ARCHETYPE SEED [HOURS]
import type { ArchetypeId, Colony } from '@/sim/types';
import { defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { SYSTEMS } from '@/sim/systems';
import { generateWorld } from '@/worldgen';
import { restore } from '@/sim/save';
import { TICKS_PER_DAY } from '@/sim/time';
import { ti } from '@/sim/colony/taskIdx';

const r1 = (x: number) => Math.round(x * 10) / 10;

export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };
  const [file, arch, seedS, hoursS] = args;
  const seed = Number(seedS), hours = Number(hoursS ?? 48);
  const base = defaultGameConfig('lasius-niger', seed, 'naturalist');
  const world = generateWorld({ ...base.world, archetype: arch as ArchetypeId });
  const sim = createSim(restore(new Uint8Array(fs.readFileSync(file))).state, world, { systems: SYSTEMS });
  const col = sim.stores.colonies.get(sim.state.player.colonyId) as Colony;
  const bu = sim.world.bu;
  const nest = sim.state.nests.find((n) => n.alive && n.colony === col.id)!;
  console.log(JSON.stringify({ entrances: nest.entrances.map((e) => ({ id: e.id, status: e.status, pos: [r1(e.pos.x / bu), r1(e.pos.y / bu), r1(e.pos.z / bu)], plug: e.plugVoxelCount })) }));
  for (let h = 0; h < hours; h++) {
    for (let t = 0; t < TICKS_PER_DAY / 24; t++) sim.tick();
    const ws = sim.stores.ants.list.filter((a) => a.alive && a.colony === col.id && a.caste === 'worker');
    const tally: Record<string, number> = {};
    for (const a of ws) {
      const k = `${a.task}/${a.state}/ph${a.bb['fo.ph'] ?? '-'}/nav:${a.nav.status}${a.nav.failReason ? ':' + a.nav.failReason : ''}/${a.nestId >= 0 ? 'in' : 'out'}`;
      tally[k] = (tally[k] ?? 0) + 1;
    }
    const d = col.alloc.demand, tg = col.alloc.target;
    console.log(JSON.stringify({
      day: r1(sim.state.tick / TICKS_PER_DAY), C: r1(col.stores.c), P: r1(col.stores.p),
      demand: { forage: r1(d[ti('forage')]), scout: r1(d[ti('scout')]) }, target: { forage: tg[ti('forage')], scout: tg[ti('scout')] },
      entrances: nest.entrances.map((e) => `${e.id}:${e.status}:${e.plugVoxelCount}`), tally,
    }));
  }
}
