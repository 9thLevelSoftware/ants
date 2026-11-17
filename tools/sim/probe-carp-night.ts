// TEMPORARY probe (species-carpenter; delete before the task ends): from a cached Camponotus hand-over, live N game
// days and count the colony's adult workers outside (nestId -1) at every game hour, binned by hour of day, with the
// air temperature. Numbers for the report's night-shift check (AC3).
//   node tools/sim/run-ts.mjs tools/sim/probe-carp-night.ts <cache.bin> <archetype> <seed> <days>

import { createSim } from '@/sim/sim';
import { SYSTEMS } from '@/sim/systems';
import { restore } from '@/sim/save';
import { generateWorld } from '@/worldgen';
import { defaultGameConfig } from '@/sim/createGame';
import { TICKS_PER_DAY } from '@/sim/time';
import { calendarNow } from '@/sim/environment/calendar';
import { airTemp } from '@/sim/environment/temperature';
import type { ArchetypeId } from '@/sim/types';

export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };
  const [file, archetype, seedS, daysS] = args;
  const base = defaultGameConfig('camponotus-pennsylvanicus', Number(seedS));
  const world = generateWorld({ ...base.world, archetype: archetype as ArchetypeId });
  const sim = createSim(restore(new Uint8Array(fs.readFileSync(file))).state, world, { systems: SYSTEMS });
  const col = sim.state.colonies[0];
  // optional: hungry colony (stores set to C,P) with extra minors, so foragers have a reason to go out
  const [, , , , storesArg, extraArg] = args;
  if (storesArg) { const [c, p] = storesArg.split(',').map(Number); col.stores.c = c; col.stores.p = p; }
  if (extraArg) (sim.state.config as { cheats: boolean }).cheats = true;
  if (extraArg) sim.enqueue({ type: 'cheat.spawnAnts', colonyId: col.id, n: Number(extraArg), caste: 'minor', ageGd: 5, task: null, pos: null });
  const perHour = Array.from({ length: 24 }, () => ({ n: 0, outside: 0, workers: 0, temp: 0, departs: 0, tasks: {} as Record<string, number> }));
  const wasOut = new Map<number, boolean>();
  const hourTicks = TICKS_PER_DAY / 24;
  const end = sim.state.tick + Number(daysS) * TICKS_PER_DAY;
  while (sim.state.tick < end) {
    const h0 = Math.floor(calendarNow(sim).hour) % 24;
    for (let i = 0; i < hourTicks; i++) {
      sim.tick();
      if (i % 10 !== 0) continue;
      for (const a of sim.state.ants) {
        if (!a.alive || a.colony !== col.id || a.caste === 'queen') continue;
        const out = a.nestId < 0;
        if (out && wasOut.get(a.id) === false && (a.task === 'forage' || a.task === 'scout' || a.task === 'tend')) perHour[h0].departs++;
        wasOut.set(a.id, out);
      }
    }
    const cal = calendarNow(sim);
    const h = Math.floor(cal.hour) % 24;
    let out = 0, w = 0;
    for (const a of sim.state.ants) {
      if (!a.alive || a.colony !== col.id || a.caste === 'queen') continue;
      w++;
      if (a.nestId < 0) { out++; perHour[h].tasks[a.task] = (perHour[h].tasks[a.task] ?? 0) + 1; }
    }
    const b = perHour[h];
    b.n++; b.outside += out; b.workers += w; b.temp += airTemp(sim);
  }
  const rows = perHour.map((b, h) => `${h}\t${b.n ? (b.outside / b.n).toFixed(2) : '-'}\t${b.n ? (b.departs / b.n).toFixed(2) : '-'}\t${b.n ? (b.workers / b.n).toFixed(1) : '-'}\t${b.n ? (b.temp / b.n).toFixed(1) : '-'}\t${JSON.stringify(b.tasks)}`);
  console.log(`hour\toutside\tdeparts/h\tworkers\tairC\ttasks outside (sum)\n${rows.join('\n')}`);
}
