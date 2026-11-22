// Round 13 probe (temporary): direction 27a item 4, autumn worker:lost. Restores a cached hand-over, runs to absolute game day D1,
// and every game hour from D0 prints each player worker that is outside in a `*.return` state: position, distance
// to the nearest entrance (BU), body temperature, the thermal speed multiplier, nav status, the air temperature at
// her point, and since when she is in that state.
//   node tools/sim/run-ts.mjs tools/sim/probe/probe-lost13.ts CACHE.bin ARCHETYPE SEED D0 D1
import type { ArchetypeId } from '@/sim/types';
import { defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { SYSTEMS } from '@/sim/systems';
import { generateWorld } from '@/worldgen';
import { restore } from '@/sim/save';
import { TICKS_PER_DAY, currentDayOfYear } from '@/sim/time';
import { speedMult } from '@/sim/environment/thermalResponse';
import { pointTempC } from '@/sim/colony/envAdapter';

export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };
  const [file, arch, seedS, d0S, d1S] = args;
  const base = defaultGameConfig('lasius-niger', Number(seedS), 'naturalist');
  const world = generateWorld({ ...base.world, archetype: arch as ArchetypeId });
  const sim = createSim(restore(new Uint8Array(fs.readFileSync(file))).state, world, { systems: SYSTEMS });
  const col = sim.stores.colonies.get(sim.state.player.colonyId)!;
  const d0 = Number(d0S) * TICKS_PER_DAY, d1 = Number(d1S) * TICKS_PER_DAY, HT = TICKS_PER_DAY / 24;
  const r1 = (x: number) => Math.round(x * 10) / 10;
  sim.events.on('ant-died', (e) => { if (e.colonyId === col.id && e.cause === 'lost') console.log(JSON.stringify({ lost: e.antId, gd: r1(sim.state.tick / TICKS_PER_DAY) })); });
  const ents = () => sim.stores.nests.list.filter((n) => n.alive && n.colony === col.id).flatMap((n) => n.entrances);
  // D0 / D1 are absolute game days (sim.state.tick, founding included), as the sweep's probe printed them
  while (sim.state.tick < d1) {
    sim.tick();
    const t = sim.state.tick;
    if (t < d0 || t % HT !== 0) continue;
    const out: unknown[] = [];
    for (const a of sim.state.ants) {
      if (!a.alive || a.colony !== col.id || a.caste !== 'worker' || a.nestId >= 0 || !a.state.endsWith('.return')) continue;
      let best = Infinity;
      for (const e of ents()) best = Math.min(best, Math.sqrt((e.pos.x - a.pos.x) ** 2 + (e.pos.z - a.pos.z) ** 2) / sim.world.bu);
      out.push({ id: a.id, st: a.state, sinceGd: r1((sim.state.tick - a.stateTick) / TICKS_PER_DAY), distBu: r1(best), tb: r1(a.tb),
        speed: r1(speedMult(sim, a.tb, col.species)), air: r1(pointTempC(sim, a.pos)), nav: a.nav.status, y: r1(a.pos.y) });
    }
    console.log(JSON.stringify({ gd: r1(sim.state.tick / TICKS_PER_DAY), doy: currentDayOfYear(sim.state), out }));
  }
}
