// PROBE (independent sweep after colony-life round 2; delete after use): why patch prey that appears ahead of
// colony ants is not hunted. Restores a cached hand-over, runs N game days, and for every springtail / mite of a
// patch records the colony ant nearest to it when it appeared (task, state, outdoor phase, carry, crop), whether any
// ant hunted it, and how it ended.
//   node tools/sim/run-ts.mjs tools/sim/probe-hunt.ts CACHE_BIN ARCHETYPE SEED DAYS
import { createSim } from '@/sim/sim';
import { SYSTEMS } from '@/sim/systems';
import { restore } from '@/sim/save';
import { generateWorld } from '@/worldgen';
import { defaultGameConfig } from '@/sim/createGame';
import { TICKS_PER_DAY } from '@/sim/time';
import type { ArchetypeId } from '@/sim/types';

export default async function main(args: string[]): Promise<void> {
  const [file, archetype, seedS, daysS] = args;
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };
  const base = defaultGameConfig('lasius-niger', Number(seedS), 'naturalist');
  const world = generateWorld({ ...base.world, archetype: archetype as ArchetypeId });
  const sim = createSim(restore(new Uint8Array(fs.readFileSync(file))).state, world, { systems: SYSTEMS });
  const colId = sim.state.player.colonyId;
  const bu = sim.world.bu;
  type Rec = { id: number; kind: string; tick: number; near: string; dBu: number; hunted: boolean; minD: number; end: string };
  const recs = new Map<number, Rec>();
  sim.events.on('creature-spawned', (e) => {
    if (e.kind !== 'springtail' && e.kind !== 'mite') return;
    const c = sim.stores.creatures.get(e.id);
    if (!c || c.bb.patch === undefined) return;
    let best = '', bd = Infinity;
    for (const a of sim.stores.ants.list) {
      if (!a.alive || a.colony !== colId || a.caste === 'queen') continue;
      const d = Math.hypot(a.pos.x - c.pos.x, a.pos.z - c.pos.z) / bu;
      if (d < bd) {
        bd = d;
        const crop = a.cropCap > 0 ? (a.cropC + a.cropP) / a.cropCap : 0;
        best = `${a.task}/${a.state} ph${a.bb['fo.ph'] ?? '-'} carry:${a.carry.kind} crop${crop.toFixed(2)} nest${a.nestId} act:${a.action?.id ?? '-'} src${a.bb['fo.src'] ?? '-'}`;
      }
    }
    recs.set(e.id, { id: e.id, kind: e.kind, tick: sim.state.tick, near: best, dBu: Math.round(bd * 10) / 10, hunted: false, minD: bd, end: 'alive' });
  });
  sim.events.on('creature-despawned', (e) => { const r = recs.get(e.id); if (r) r.end = `despawned:${e.cause}`; });
  sim.events.on('creature-died', (e) => { const r = recs.get(e.id); if (r) r.end = `died:${e.cause}`; });
  // kills by colony ants and what each killer delivered next
  const killers = new Map<number, number>(); // ant id -> kills not yet followed by a delivery
  const afterKill: string[] = [];
  const deliveries: string[] = [];
  sim.events.on('prey-subdued', (e) => {
    for (const id of e.antIds) {
      const a = sim.stores.ants.get(id);
      if (a && a.colony === colId) killers.set(id, (killers.get(id) ?? 0) + 1);
    }
  });
  sim.events.on('delivery', (e) => {
    if (e.colonyId !== colId) return;
    const a = sim.stores.ants.get(e.antId);
    const line = `t${(sim.state.tick / TICKS_PER_DAY).toFixed(2)} ${e.kind} c${e.c.toFixed(3)} p${e.p.toFixed(3)} src${e.sourceId} ant${e.antId} ${a?.task}/${a?.state} patch${a?.bb['fo.patch'] ?? '-'}`;
    if (killers.has(e.antId)) { afterKill.push(line); killers.delete(e.antId); }
    if (e.kind === 'unknown' || e.kind === 'prey' || e.p > 0.1) deliveries.push(line);
  });
  const until = sim.state.tick + Math.round(Number(daysS) * TICKS_PER_DAY);
  while (sim.state.tick < until) {
    sim.tick();
    if (sim.state.tick % 10 !== 0) continue;
    for (const r of recs.values()) {
      if (r.end !== 'alive') continue;
      const c = sim.stores.creatures.get(r.id);
      if (!c) continue;
      for (const a of sim.stores.ants.list) {
        if (!a.alive || a.colony !== colId) continue;
        if (a.bb['fo.prey'] === r.id && a.bb['fo.ph'] === 14) r.hunted = true;
        const d = Math.hypot(a.pos.x - c.pos.x, a.pos.z - c.pos.z) / bu;
        if (d < r.minD) r.minD = d;
      }
    }
  }
  const list = [...recs.values()];
  const byNear = new Map<string, number>();
  for (const r of list) {
    const k = r.near.replace(/ crop[0-9.]+/, '').replace(/ src-?[0-9]+/, '').replace(/ act:\S+/, '');
    byNear.set(k, (byNear.get(k) ?? 0) + 1);
  }
  console.log(`patch prey appeared: ${list.length}; hunted ${list.filter((r) => r.hunted).length}; ends ${JSON.stringify(list.reduce((m: Record<string, number>, r) => { m[r.end] = (m[r.end] ?? 0) + 1; return m; }, {}))}`);
  console.log('nearest colony ant when it appeared (task/state phase carry nest):');
  for (const [k, n] of [...byNear.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${n}  ${k}`);
  console.log(`killers' next delivery (${afterKill.length}; killers with none: ${killers.size}):`);
  for (const l of afterKill) console.log('  ' + l);
  console.log(`deliveries unknown / prey / P > 0.1 (${deliveries.length}):`);
  for (const l of deliveries) console.log('  ' + l);
  console.log('first 40:');
  for (const r of list.slice(0, 40)) console.log(`  ${r.kind} t${((r.tick) / TICKS_PER_DAY).toFixed(2)}gd d${r.dBu}BU minD${r.minD.toFixed(1)} hunted:${r.hunted} ${r.end} | ${r.near}`);
}
