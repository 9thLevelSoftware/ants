// Round 14 Part C item 2 probe (tool-side, measures only): hygiene under a larger brood. Restores FILE (a year-two
// cache) as life.ts does and runs to game day UNTIL; every game hour, for each chamber of the player colony that holds
// brood or waste: waste items lying there by kind, brood by stage, the queen's chamber; eggs laid per chamber; brood
// deaths per chamber and cause; the colony's ants on haul / nurse.waste by state; adult corpses inside the nest.
//   node tools/sim/run-ts.mjs tools/sim/probe/probe-hygiene14.ts FILE ARCH SEED UNTIL_GD OUT.json
import type { ArchetypeId } from '@/sim/types';
import { createSim } from '@/sim/sim';
import { SYSTEMS } from '@/sim/systems';
import { defaultGameConfig } from '@/sim/createGame';
import { generateWorld } from '@/worldgen';
import { restore } from '@/sim/save';
import { TICKS_PER_DAY } from '@/sim/time';
import { currentDayOfYear } from '@/sim/time';
import { BROOD_HAZARD } from '@/sim/balance/colony';

interface Fs { readFileSync(p: string): Uint8Array; writeFileSync(p: string, d: string): void }

export default async function main(args: string[]): Promise<void> {
  const { readFileSync, writeFileSync } = (await import('node:fs' as string)) as Fs;
  const [file, arch, seedS, untilS, out] = args;
  const base = defaultGameConfig('lasius-niger', Number(seedS), 'naturalist');
  const config = { ...base, cheats: true, world: { ...base.world, archetype: arch as ArchetypeId } };
  const world = generateWorld(config.world);
  const sim = createSim(restore(new Uint8Array(readFileSync(file))).state, world, { systems: SYSTEMS });
  const colId = sim.state.player.colonyId;
  const hour = TICKS_PER_DAY / 24;
  const laid = new Map<number, number>(), deaths: Record<string, number> = {}, hourDeaths: Record<string, number>[] = [];
  let hd: Record<string, number> = {};
  const chamberOfBrood = new Map<number, number>();
  sim.events.on('egg-laid', (e) => {
    const b = sim.stores.brood.get(e.broodId);
    if (b && b.colony === colId) { const ch = b.chamberId; laid.set(ch, (laid.get(ch) ?? 0) + 1); hd[`laid@${ch}`] = (hd[`laid@${ch}`] ?? 0) + 1; }
  });
  sim.events.on('brood-died', (e) => {
    if (e.colonyId !== undefined && e.colonyId !== colId) return;
    const ch = sim.stores.brood.get(e.broodId)?.chamberId ?? chamberOfBrood.get(e.broodId) ?? -9;
    const k = `${e.stage}:${e.cause}@${ch}`;
    deaths[k] = (deaths[k] ?? 0) + 1; hd[k] = (hd[k] ?? 0) + 1;
  });
  const rows: unknown[] = [];
  const until = Number(untilS) * TICKS_PER_DAY;
  while (sim.state.tick < until) {
    for (let i = 0; i < hour; i++) sim.tick();
    const col = sim.stores.colonies.get(colId);
    if (!col) break;
    const nestIds = new Set(col.nestIds);
    const ch: Record<number, { waste: Record<string, number>; brood: Record<string, number>; corpses: number; type?: string; tempC?: number }> = {};
    const slot = (id: number) => (ch[id] ??= { waste: {}, brood: {}, corpses: 0 });
    for (const b of sim.stores.brood.list) {
      if (!b.alive || b.colony !== colId) continue;
      chamberOfBrood.set(b.id, b.chamberId);
      const s = slot(b.carriedBy >= 0 ? -2 : b.chamberId);
      s.brood[b.stage] = (s.brood[b.stage] ?? 0) + 1;
    }
    for (const it of sim.stores.items.list) {
      if (!it.alive || it.carrierIds.length > 0 || !nestIds.has(it.nestId)) continue;
      if (it.kind === 'waste') { const s = slot(it.chamberId); const k = it.wasteKind ?? '?'; s.waste[k] = (s.waste[k] ?? 0) + 1; }
      else if (it.kind === 'corpse') slot(it.chamberId).corpses++;
    }
    for (const n of sim.stores.nests.list) if (n.alive && nestIds.has(n.id)) for (const c of n.chambers) if (ch[c.id]) { ch[c.id].type = c.type; ch[c.id].tempC = Math.round(c.temp * 10) / 10; }
    const q = sim.stores.ants.get(col.queenId);
    const haul: Record<string, number> = {};
    for (const a of sim.stores.ants.list) {
      if (!a.alive || a.colony !== colId || a.caste === 'queen') continue;
      if (a.task === 'haul' || a.state.startsWith('nurse.waste') || a.state === 'nurse.dump' || a.state === 'nurse.wastePick') haul[a.state] = (haul[a.state] ?? 0) + 1;
    }
    const over = Object.entries(ch).filter(([id, s]) => Number(id) >= 0 && Object.values(s.waste).reduce((x, y) => x + y, 0) > BROOD_HAZARD.wasteTolerance && Object.keys(s.brood).length > 0).map(([id]) => Number(id));
    rows.push({ gd: Math.round((sim.state.tick / TICKS_PER_DAY) * 1000) / 1000, doy: currentDayOfYear(sim.state), queenChamber: q?.alive ? q.chamberId : null,
      workers: sim.stores.ants.list.filter((a) => a.alive && a.colony === colId && a.caste === 'worker').length, chambers: ch, haul, dirtyBroodChambers: over, events: hd });
    hd = {};
  }
  writeFileSync(out, JSON.stringify({ file, laid: Object.fromEntries(laid), deaths, rows }, null, 0));
  console.log(`done at gd ${(sim.state.tick / TICKS_PER_DAY).toFixed(2)}; deaths ${JSON.stringify(deaths)}; laid by chamber ${JSON.stringify(Object.fromEntries(laid))}`);
}
