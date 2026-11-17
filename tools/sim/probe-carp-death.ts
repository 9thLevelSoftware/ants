// TEMPORARY probe (species-carpenter; delete before the task ends): from a cached Camponotus hand-over, live N game
// days and print every worker death with cause, position, nest, chamber flood state and weather; plus the wood the
// nest lies in.  node tools/sim/run-ts.mjs tools/sim/probe-carp-death.ts <cache.bin> <archetype> <seed> <days>

import { createSim } from '@/sim/sim';
import { SYSTEMS } from '@/sim/systems';
import { restore } from '@/sim/save';
import { generateWorld } from '@/worldgen';
import { defaultGameConfig } from '@/sim/createGame';
import { TICKS_PER_DAY } from '@/sim/time';
import type { ArchetypeId } from '@/sim/types';
import { footTrafficAt } from '@/sim/colony/founding/siteAssess';

export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };
  const [file, archetype, seedS, daysS] = args;
  const base = defaultGameConfig('camponotus-pennsylvanicus', Number(seedS));
  const world = generateWorld({ ...base.world, archetype: archetype as ArchetypeId });
  const sim = createSim(restore(new Uint8Array(fs.readFileSync(file))).state, world, { systems: SYSTEMS });
  const bu = sim.world.bu;
  const col = sim.state.colonies[0];
  const nest = sim.state.nests.find((n) => n.alive && n.colony === col.id)!;
  const ch = nest.chambers[0];
  const prim = ch ? sim.field.primAt(ch.center, bu) : null;
  const w = prim ? sim.state.worldDelta.wood.find((x) => x.primId === prim.id) : null;
  console.log(`nest ${nest.id} origin ${JSON.stringify(nest.origin)} ground ${sim.field.height(nest.origin.x, nest.origin.z).toFixed(1)} chamber ${JSON.stringify(ch?.center)} prim ${prim?.id} ${prim?.material} wood mc ${w?.moisture.toFixed(1)} decay ${w?.decay} ${w?.placement}`);
  console.log(`traffic at origin ${footTrafficAt(sim, nest.origin.x, nest.origin.z).toFixed(2)}`);
  console.log(`entrances ${JSON.stringify(nest.entrances.map((e) => ({ pos: e.pos, status: e.status, kind: e.kind })))}`);
  sim.events.on('ant-died', (e) => {
    if (e.colonyId !== col.id) return;
    const g = sim.field.height(e.pos.x, e.pos.z);
    const a = sim.stores.ants.get(e.antId) ?? sim.state.ants.find((x) => x.id === e.antId);
    console.log(`t ${(sim.state.tick / TICKS_PER_DAY).toFixed(2)} ${e.caste} ${e.cause} task ${e.task} pos (${(e.pos.x / bu).toFixed(1)}, ${(e.pos.y / bu).toFixed(1)}, ${(e.pos.z / bu).toFixed(1)}) BU, ${((e.pos.y - g) / bu).toFixed(1)} BU over ground, nest ${a?.nestId} state ${a?.state} weather ${sim.state.env.weather.state} flooded ${nest.chambers.map((c) => c.flooded.toFixed(2)).join(',')}`);
  });
  const end = sim.state.tick + Number(daysS) * TICKS_PER_DAY;
  while (sim.state.tick < end) sim.tick();
}
