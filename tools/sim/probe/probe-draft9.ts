// Round 9 probe (temporary): R33 drafts. Restores a cached hand-over, runs DAYS game days and counts task changes
// with reason job:tend-overdue by the task left, forager departures, hunting trips started, per game day.
//   node tools/sim/run-ts.mjs tools/sim/probe/probe-draft9.ts CACHE.bin ARCHETYPE SEED [DAYS]
import type { ArchetypeId } from '@/sim/types';
import { defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { SYSTEMS } from '@/sim/systems';
import { generateWorld } from '@/worldgen';
import { restore } from '@/sim/save';
import { TICKS_PER_DAY } from '@/sim/time';

export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };
  const [file, arch, seedS, daysS] = args;
  const base = defaultGameConfig('lasius-niger', Number(seedS), 'naturalist');
  const world = generateWorld({ ...base.world, archetype: arch as ArchetypeId });
  const sim = createSim(restore(new Uint8Array(fs.readFileSync(file))).state, world, { systems: SYSTEMS });
  const colId = sim.state.player.colonyId;
  let day: Record<string, number> = {};
  sim.events.on('task-changed', (e) => {
    const a = sim.stores.ants.get(e.antId);
    if (!a || a.colony !== colId) return;
    if (e.reason === 'job:tend-overdue') day[`draft:${e.from}`] = (day[`draft:${e.from}`] ?? 0) + 1;
  });
  sim.events.on('forager-departed', (e) => { const a = sim.stores.ants.get(e.antId); if (a && a.colony === colId) day.departures = (day.departures ?? 0) + 1; });
  const days = Number(daysS ?? 3);
  for (let d = 0; d < days; d++) {
    for (let t = 0; t < TICKS_PER_DAY; t++) sim.tick();
    console.log(JSON.stringify({ day: d + 1, ...day }));
    day = {};
  }
}
