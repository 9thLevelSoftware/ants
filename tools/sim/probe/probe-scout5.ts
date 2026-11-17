// Round-5 probe (deleted at the end of the round): where scouts walk relative to the prey patches near the nest.
import type { ArchetypeId } from '@/sim/types';
import { defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { SYSTEMS } from '@/sim/systems';
import { generateWorld } from '@/worldgen';
import { restore } from '@/sim/save';
import { TICKS_PER_DAY } from '@/sim/time';
interface NodeFs { readFileSync(p: string): Uint8Array }
export default async function main(args: string[]): Promise<void> {
  const [arch, seedS, cache, gdS] = args;
  const seed = Number(seedS);
  const fs = (await import('node:fs' as string)) as NodeFs;
  const base = defaultGameConfig('lasius-niger', seed, 'naturalist');
  const world = generateWorld({ ...base.world, archetype: arch as ArchetypeId });
  const state = restore(new Uint8Array(fs.readFileSync(`${cache}/founded-lasius-niger-${arch}-${seed}-naturalist-d-any.bin`))).state;
  const sim = createSim(state, world, { systems: SYSTEMS });
  const colId = sim.state.player.colonyId, bu = sim.world.bu;
  const nest = sim.state.nests.find((n) => n.alive && n.colony === colId)!;
  const e = nest.entrances[0].pos;
  const patches = sim.state.ecology.preyPatches.map((p) => ({ p, d: Math.sqrt((p.center.x - e.x) ** 2 + (p.center.z - e.z) ** 2) / bu }))
    .filter((x) => x.d - x.p.radius / bu < 320);
  for (const x of patches) console.log(`patch ${x.p.id} centre dist ${x.d.toFixed(0)} BU r ${(x.p.radius / bu).toFixed(0)} count ${x.p.count.toFixed(0)}/${x.p.k.toFixed(0)} bearing ${(Math.atan2(x.p.center.z - e.z, x.p.center.x - e.x) * 180 / Math.PI).toFixed(0)}`);
  const inside: Record<string, number> = {}, outsideSamples: Record<string, number> = {};
  let spawned = 0;
  sim.events.on('creature-spawned', (ev) => { if (ev.kind === 'springtail' || ev.kind === 'mite') spawned++; });
  const end = sim.state.tick + Math.round(Number(gdS ?? 1) * TICKS_PER_DAY);
  const bearings: Record<string, number> = {};
  let hourLast = -1;
  while (sim.state.tick < end) {
    sim.tick();
    if (sim.state.tick % 10 !== 0) continue;
    for (const a of sim.state.ants) {
      if (!a.alive || a.colony !== colId || a.nestId >= 0) continue;
      const k = a.task;
      outsideSamples[k] = (outsideSamples[k] ?? 0) + 1;
      for (const x of patches) {
        const d = Math.sqrt((a.pos.x - x.p.center.x) ** 2 + (a.pos.z - x.p.center.z) ** 2);
        if (d <= x.p.radius) inside[`${k}@${x.p.id}`] = (inside[`${k}@${x.p.id}`] ?? 0) + 1;
      }
      if (k === 'scout') {
        const r = Math.sqrt((a.pos.x - e.x) ** 2 + (a.pos.z - e.z) ** 2) / bu;
        if (r > 50) { const b = Math.round(Math.atan2(a.pos.z - e.z, a.pos.x - e.x) * 180 / Math.PI / 30) * 30; bearings[b] = (bearings[b] ?? 0) + 1; }
      }
    }
    const hour = Math.floor((sim.state.tick % TICKS_PER_DAY) / (TICKS_PER_DAY / 24));
    if (hour !== hourLast && hour % 3 === 0) {
      hourLast = hour;
      const out = sim.state.ants.filter((a) => a.alive && a.colony === colId && a.nestId < 0).map((a) => a.task);
      const known = sim.state.ecology.preyPatches.filter((p) => ((p.knownBy ?? 0) & 1) !== 0).length;
      console.log(`hour ${hour} outside ${out.join(',')} | patches known ${known} | prey spawned ${spawned}`);
    }
  }
  console.log('samples outside (x1 s):', JSON.stringify(outsideSamples));
  console.log('samples inside patches:', JSON.stringify(inside));
  console.log('scout bearings beyond 50 BU (deg: samples):', JSON.stringify(bearings));
}
