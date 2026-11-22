// Round 12 probe (temporary): direction 26 item 4a, the flood hold. Restores a cached hand-over and, each time a
// player worker OUTSIDE the nest enters the water hold (state flee.freeze with fw.on set, nestId -1), logs what she was
// walking to (her nav destination the tick before), the water over that destination's floor, the nest's water level,
// the chamber nearest the destination and how wet that chamber is, her task and the chambers holding brood.
// Summary: holds by task, destination kind, and hours held.
//   node tools/sim/run-ts.mjs tools/sim/probe/probe-hold12.ts CACHE.bin ARCHETYPE SEED [DAYS]
import type { ArchetypeId } from '@/sim/types';
import { defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { SYSTEMS } from '@/sim/systems';
import { generateWorld } from '@/worldgen';
import { restore } from '@/sim/save';
import { TICKS_PER_DAY } from '@/sim/time';
import { waterView } from '@/sim/nest/flood/dryPlace';
import { waterDepthOver } from '@/sim/nest/flood/spill';

export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };
  const [file, arch, seedS, daysS] = args;
  const base = defaultGameConfig('lasius-niger', Number(seedS), 'naturalist');
  const world = generateWorld({ ...base.world, archetype: arch as ArchetypeId });
  const sim = createSim(restore(new Uint8Array(fs.readFileSync(file))).state, world, { systems: SYSTEMS });
  const col = sim.stores.colonies.get(sim.state.player.colonyId)!;
  const bu = sim.world.bu;
  const ticks = Number(daysS ?? 6) * TICKS_PER_DAY;
  const prev = new Map<number, { dest: { x: number; y: number; z: number }; status: string; task: string; state: string; nestId: number }>();
  const holdTicks: Record<string, number> = {};
  let logged = 0;
  for (let t = 0; t < ticks; t++) {
    sim.tick();
    for (const a of sim.stores.ants.list) {
      if (!a.alive || a.colony !== col.id || a.caste !== 'worker') continue;
      const held = a.bb['fw.on'] === 1 && a.state === 'flee.freeze' && a.nestId < 0;
      if (held) {
        const k = `${a.task}`;
        holdTicks[k] = (holdTicks[k] ?? 0) + 1;
        const p = prev.get(a.id);
        if (p && !(p.state === 'flee.freeze') && logged < 400) {
          logged++;
          const nest = sim.stores.nests.get(col.nestIds[0])!;
          const w = waterView(sim, nest);
          const d = p.dest;
          const depth = w ? waterDepthOver(w.cache, sim.carve.voxel, d.x, d.y, d.z, w.level, -Infinity) / bu : null;
          let near = null as null | { id: number; kind: string; dBu: number; flooded: unknown; brood: number };
          for (const ch of nest.chambers ?? []) {
            const c = (ch as unknown as { center: { x: number; y: number; z: number } }).center;
            if (!c) continue;
            const dd = Math.sqrt((c.x - d.x) ** 2 + (c.y - d.y) ** 2 + (c.z - d.z) ** 2) / bu;
            const brood = sim.stores.brood.list.filter((b) => b.alive && b.chamberId === ch.id).length;
            if (!near || dd < near.dBu) near = { id: ch.id, kind: (ch as unknown as { type: string }).type, dBu: Math.round(dd * 10) / 10, flooded: (ch as unknown as { flooded?: unknown }).flooded, brood };
          }
          console.log(JSON.stringify({
            d: Math.floor(t / TICKS_PER_DAY), h: Math.floor(((t % TICKS_PER_DAY) / TICKS_PER_DAY) * 24), ant: a.id, task: a.task,
            prevState: p.state, prevNav: p.status, prevNest: p.nestId,
            destBu: { x: Math.round(d.x / bu), y: Math.round((d.y / bu) * 10) / 10, z: Math.round(d.z / bu) },
            posYBu: Math.round((a.pos.y / bu) * 10) / 10, levelBu: w ? Math.round((w.level / bu) * 10) / 10 : null,
            waterOverDestFloorBu: depth === null ? null : Math.round(depth * 100) / 100, destSubstrate: Math.round(sim.field.substrate(d) / bu * 10) / 10,
            nearestChamber: near, nestWater: nest.flood.water,
          }));
        }
      }
      prev.set(a.id, { dest: { ...a.nav.dest }, status: a.nav.status, task: a.task, state: a.state, nestId: a.nestId });
    }
  }
  const hrs: Record<string, number> = {};
  for (const [k, v] of Object.entries(holdTicks)) hrs[k] = Math.round((v / TICKS_PER_DAY) * 24 * 10) / 10;
  console.log(JSON.stringify({ heldOutsideAntHoursByTask: hrs }));
}
