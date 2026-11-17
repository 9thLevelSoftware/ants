// Colony-range siting read-out (threats-live): for each hand-over snapshot, the zone mix inside the colony ring,
// which hunting kinds the director sites there, where, and which resident occupies them after a few director runs.
//
//   node tools/sim/run-ts.mjs tools/sim/threatSites.ts [--archetypes a,b,...] [--preset P] [--cache DIR]

import type { ArchetypeId, DifficultyId } from '@/sim/types';
import { zoneAt } from '@/sim/world';
import { COLONY_RANGE_BU } from '@/sim/balance/creatures';
import { COLONY_RANGE_KINDS, colonyAnchor } from '@/sim/ecology/creatures/colonyRange';
import { runDirector } from '@/sim/ecology/creatures/director';
import { simFromSnapshot } from './threatFunnel';

interface NodeFs { readFileSync(p: string): Uint8Array; existsSync(p: string): boolean }

export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as NodeFs;
  let archs: ArchetypeId[] = ['woodland-edge', 'suburban-garden', 'playground-park', 'car-park-verge', 'kitchen-door'];
  let preset: DifficultyId | null = null, cache = 'test-output/colony-life/round-3/cache';
  for (let i = 0; i < args.length; i += 2) {
    if (args[i] === '--archetypes') archs = args[i + 1].split(',') as ArchetypeId[];
    else if (args[i] === '--preset') preset = args[i + 1] as DifficultyId;
    else if (args[i] === '--cache') cache = args[i + 1];
  }
  for (const archetype of archs) {
    const file = `${cache}/founded-lasius-niger-${archetype}-1-naturalist-d-any.bin`;
    const sim = simFromSnapshot({ archetype, seed: 1, preset, rules: null }, new Uint8Array(fs.readFileSync(file)));
    const a = colonyAnchor(sim);
    if (!a) { console.log(`${archetype}: no anchor`); continue; }
    const bu = sim.world.bu, zones: Record<string, number> = {};
    for (let i = 0; i < 400; i++) {
      const ang = (i / 400) * 2 * Math.PI * 7, r = (COLONY_RANGE_BU[0] + (COLONY_RANGE_BU[1] - COLONY_RANGE_BU[0]) * ((i % 20) / 19)) * bu;
      const z = zoneAt(sim.world, a.x + Math.cos(ang) * r, a.z + Math.sin(ang) * r);
      zones[z] = (zones[z] ?? 0) + 1;
    }
    for (let i = 0; i < 6; i++) { runDirector(sim); sim.state.tick += 50; }
    const sited = sim.state.ecology.director.territories
      .map((t, i) => ({ t, i, d: Math.hypot(t.center.x - a.x, t.center.z - a.z) / bu }))
      .filter((x) => COLONY_RANGE_KINDS.includes(x.t.kind) && x.d <= COLONY_RANGE_BU[1] + 1)
      .map((x) => `${x.t.kind}@${Math.round(x.d)}BU(${zoneAt(sim.world, x.t.center.x, x.t.center.z)})${sim.stores.creatures.has(x.t.occupantId) ? '*' : ''}`);
    console.log(`${archetype} region ${sim.world.params.region} ring zones ${JSON.stringify(zones)}\n  sited: ${sited.join(', ') || '-'}`);
  }
}
