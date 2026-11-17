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
  const perHour = Array.from({ length: 24 }, () => ({ n: 0, outside: 0, workers: 0, temp: 0 }));
  const hourTicks = TICKS_PER_DAY / 24;
  const end = sim.state.tick + Number(daysS) * TICKS_PER_DAY;
  while (sim.state.tick < end) {
    for (let i = 0; i < hourTicks; i++) sim.tick();
    const cal = calendarNow(sim);
    const h = Math.floor(cal.hour) % 24;
    let out = 0, w = 0;
    for (const a of sim.state.ants) {
      if (!a.alive || a.colony !== col.id || a.caste === 'queen') continue;
      w++;
      if (a.nestId < 0) out++;
    }
    const b = perHour[h];
    b.n++; b.outside += out; b.workers += w; b.temp += airTemp(sim);
  }
  const rows = perHour.map((b, h) => `${h}\t${b.n ? (b.outside / b.n).toFixed(2) : '-'}\t${b.n ? (b.workers / b.n).toFixed(1) : '-'}\t${b.n ? (b.temp / b.n).toFixed(1) : '-'}`);
  console.log(`hour\toutside\tworkers\tairC\n${rows.join('\n')}`);
}
