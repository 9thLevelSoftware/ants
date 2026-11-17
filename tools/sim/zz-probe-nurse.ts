// SCRATCH probe (colony-life round 3): what nurses do while larvae are hungry and stores are full. Delete after use.
import type { ArchetypeId, System } from '@/sim/types';
import { defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { SYSTEMS } from '@/sim/systems';
import { generateWorld } from '@/worldgen';
import { restore } from '@/sim/save';
import { needRates } from '@/sim/colony/needs';
import { TICKS_PER_DAY } from '@/sim/time';

export default async function main(args: string[]): Promise<void> {
  const a = args[0] as ArchetypeId, seed = Number(args[1]), fromGd = Number(args[2]), spanGd = Number(args[3]);
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };
  const base = defaultGameConfig('lasius-niger', seed, 'naturalist');
  const world = generateWorld({ ...base.world, archetype: a });
  const state = restore(new Uint8Array(fs.readFileSync(`test-output/colony-life/round-3/cache/founded-lasius-niger-${a}-${seed}-naturalist-d-any.bin`))).state;
  const colId = state.player.colonyId;
  const top: System = { name: 'top', phase: 'colony-economy', run(sim) {
    if (sim.state.tick % 250 !== 0) return; const col = sim.stores.colonies.get(colId)!; const r = needRates(col);
    const dc = Math.max(0, 2 * r.c - col.stores.c), dp = Math.max(0, 2 * r.p - col.stores.p);
    if (dc + dp > 0) sim.enqueue({ type: 'cheat.addFood', colonyId: colId, c: dc, p: dp, toxin: 0 }); } };
  const sim = createSim(state, world, { systems: [...SYSTEMS, top] });
  const t0 = sim.state.tick;
  while (sim.state.tick < t0 + fromGd * TICKS_PER_DAY) sim.tick();
  const states: Record<string, number> = {}, still: Record<string, number> = {};
  let lastFeeds = 0, feeds = 0, hungry = 0, larvaS = 0, nurseS = 0, empty = 0, carried = 0;
  const failed: Record<string, number> = {};
  const perLarva = new Map<number, number>();
  sim.events.on('feed', (e) => { if (e.broodId >= 0) { feeds++; perLarva.set(e.broodId, (perLarva.get(e.broodId) ?? 0) + 1); } });
  sim.events.on('brood-died', (e) => { const b = sim.stores.brood.get(e.broodId); console.log(`DIED t+${((sim.state.tick - t0) / TICKS_PER_DAY).toFixed(2)} ${e.stage}:${e.cause} brood ${e.broodId} chamber ${b?.chamberId} feeds ${perLarva.get(e.broodId) ?? 0} temp?`); });
  sim.events.on('brood-stage', (e) => { if (e.from === 'larva') console.log(`PUPATED t+${((sim.state.tick - t0) / TICKS_PER_DAY).toFixed(2)} brood ${e.broodId} feeds ${perLarva.get(e.broodId) ?? 0}`); });
  sim.events.on('action-failed', (e) => { const ant = sim.stores.ants.get(e.antId); if (ant?.task === 'nurse') failed[`${e.action}:${e.reason}`] = (failed[`${e.action}:${e.reason}`] ?? 0) + 1; });
  const moves: Record<string, number> = {};
  sim.events.on('brood-moved', (e) => { const b = sim.stores.brood.get(e.broodId); const k = `${b?.stage} ${e.broodId} ${e.fromChamber}->${e.toChamber} ${e.reason}`; moves[k] = (moves[k] ?? 0) + 1; });
  const last = new Map<number, { x: number; z: number }>();
  const end = sim.state.tick + spanGd * TICKS_PER_DAY;
  while (sim.state.tick < end) {
    sim.tick();
    if ((sim.state.tick - t0) % 300 === 0) {
      const col = sim.stores.colonies.get(colId)!;
      const ns = sim.stores.ants.list.filter((x) => x.alive && x.colony === colId && x.task === 'nurse').map((x) => x.state.replace('nurse.', '')).join(',');
      const lv = sim.stores.brood.list.filter((b) => b.alive && b.colony === colId && b.stage === 'larva');
      const tasks: Record<string, number> = {};
      for (const x of sim.stores.ants.list) if (x.alive && x.colony === colId && x.caste !== 'queen') tasks[x.task] = (tasks[x.task] ?? 0) + 1;
      console.log(`T+${((sim.state.tick - t0) / TICKS_PER_DAY).toFixed(2)} feeds ${feeds - lastFeeds} larvae ${lv.length} empty ${lv.filter((b) => b.gutC + b.gutP < 0.001).length} maxHungerGd ${Math.max(0, ...lv.map((b) => b.hungerTicks / TICKS_PER_DAY)).toFixed(2)} nurses [${ns}] demand nurse ${col.alloc.demand[0]?.toFixed(2)} tasks ${JSON.stringify(tasks)} stage ${col.starvationStage}`);
      lastFeeds = feeds;
    }
    if (sim.state.tick % 10 !== 0) continue;
    for (const b of sim.stores.brood.list) if (b.alive && b.colony === colId && b.stage === 'larva') { larvaS++; if (b.gutC + b.gutP < 0.15) hungry++; if (b.gutC + b.gutP < 0.001) empty++; if (b.carriedBy >= 0) carried++; }
    for (const ant of sim.stores.ants.list) {
      if (!ant.alive || ant.colony !== colId || ant.task !== 'nurse') continue;
      nurseS++;
      const k = `${ant.state}${ant.action ? `/${ant.action.id}` : ''}`;
      states[k] = (states[k] ?? 0) + 1;
      const p = last.get(ant.id);
      if (p && ant.nav.status === 'moving' && Math.abs(p.x - ant.pos.x) + Math.abs(p.z - ant.pos.z) < 0.05 * sim.world.bu) still[ant.state] = (still[ant.state] ?? 0) + 1;
      last.set(ant.id, { x: ant.pos.x, z: ant.pos.z });
    }
  }
  const pct = (m: Record<string, number>, n: number) => Object.entries(m).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${(100 * v / n).toFixed(1)}%`).join(', ');
  console.log(`span ${spanGd} gd from ${fromGd}: feeds ${feeds}, nurse-gd ${(nurseS * 10 / TICKS_PER_DAY).toFixed(2)}, feeds per nurse-gd ${(feeds / Math.max(1e-6, nurseS * 10 / TICKS_PER_DAY)).toFixed(1)}, larva-gd ${(larvaS * 10 / TICKS_PER_DAY).toFixed(2)}, hungry share ${(100 * hungry / Math.max(1, larvaS)).toFixed(0)}%, empty gut ${(100 * empty / Math.max(1, larvaS)).toFixed(0)}%, being carried ${(100 * carried / Math.max(1, larvaS)).toFixed(0)}%`);
  console.log('nurse states:', pct(states, nurseS));
  console.log('moving but not moving (share of nurse samples):', pct(still, nurseS));
  console.log('moves:', JSON.stringify(moves));
  const nest = sim.stores.nests.list.find((n) => n.alive && n.colony === colId)!;
  console.log('chambers:', nest.chambers.map((c) => `${c.id} ${c.type} T${c.temp.toFixed(1)} y${(c.center.y / sim.world.bu).toFixed(1)} occ ${JSON.stringify(c.occupancy)}`).join(' | '));
  console.log('nurse action failures:', JSON.stringify(failed));
}
