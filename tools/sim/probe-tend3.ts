// probe (colony-life round 1, deleted after use): long tending gaps of egg / pupa piles and what nurses did meanwhile.
import { createSim } from '@/sim/sim';
import { restore } from '@/sim/save';
import { generateWorld } from '@/worldgen';
import { defaultGameConfig } from '@/sim/createGame';
import type { ArchetypeId } from '@/sim/types';
import { TICKS_PER_DAY } from '@/sim/time';
export default async function main(args: string[]) {
  const [snap, arch, seedS, daysS] = args;
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };
  const base = defaultGameConfig('lasius-niger', Number(seedS), 'naturalist');
  const world = generateWorld({ ...base.world, archetype: arch as ArchetypeId });
  const sim = createSim(restore(new Uint8Array(fs.readFileSync(snap))).state, world);
  const col = sim.state.player.colonyId, bu = sim.world.bu;
  const lastT = new Map<number, number>();
  const gapStates = new Map<number, Record<string, number>>();
  sim.events.on('brood-died', (e) => { if (e.colonyId === col) console.log(`${(sim.state.tick / TICKS_PER_DAY).toFixed(3)} DIED ${e.broodId} ${e.stage}:${e.cause} during gap: ${JSON.stringify(gapStates.get(e.broodId))}`); });
  const end = sim.state.tick + Number(daysS) * TICKS_PER_DAY;
  let jobSeen = 0, jobNone = 0;
  const gaps: number[] = [];
  while (sim.state.tick < end) {
    sim.tick();
    if (sim.state.tick % 20 !== 0) continue;
    const nurses = sim.stores.ants.list.filter((a) => a.alive && a.colony === col && a.task === 'nurse');
    const board = sim.state.nurseryBoards?.find((x) => x.colonyId === col);
    const tendJobs = board?.jobs.filter((j) => j.kind === 5).length ?? 0;
    for (const b of sim.stores.brood.list) {
      if (!b.alive || b.colony !== col || b.stage === 'larva') continue;
      const prev = lastT.get(b.id);
      const rec = gapStates.get(b.id) ?? {};
      const age = (sim.state.tick - b.lastTendedTick) / TICKS_PER_DAY;
      if (age > 0.12) {
        for (const n of nurses) { const d = Math.hypot(n.pos.x - b.pos.x, n.pos.y - b.pos.y, n.pos.z - b.pos.z) / bu; const k = `${n.state}${d < 3 ? '(near)' : ''}`; rec[k] = (rec[k] ?? 0) + 1; }
        if (nurses.length === 0) rec['no-nurse'] = (rec['no-nurse'] ?? 0) + 1;
        const onBoard = board?.jobs.some((j) => j.id === b.id) ? 'onBoard' : 'offBoard';
        rec[onBoard] = (rec[onBoard] ?? 0) + 1;
        const cl = sim.stores.ants.list.find((a) => a.alive && a.colony === col && a.bb['bn.ji'] === b.id && a.caste !== 'queen');
        const ck = cl ? `claim:${cl.task}/${cl.state}${cl.carry.kind !== 'none' ? '+carry' : ''}` : 'claim:-';
        rec[ck] = (rec[ck] ?? 0) + 1;
      }
      gapStates.set(b.id, rec);
      if (prev !== undefined && b.lastTendedTick !== prev) {
        const gap = (b.lastTendedTick - prev) / TICKS_PER_DAY;
        gaps.push(gap);
        if (gap > 0.18) console.log(`brood ${b.id} ${b.stage} ch${b.chamberId} gap ${gap.toFixed(3)} gd during: ${JSON.stringify(rec)}`);
        gapStates.set(b.id, {});
      }
      lastT.set(b.id, b.lastTendedTick);
    }
    if (tendJobs > 0) jobSeen++; else jobNone++;
  }

  gaps.sort((a, b) => a - b);
  console.log(`gaps n ${gaps.length} median ${gaps[Math.floor(gaps.length / 2)]?.toFixed(3)} p90 ${gaps[Math.floor(gaps.length * 0.9)]?.toFixed(3)}; samples with tend jobs ${jobSeen} / ${jobSeen + jobNone}`);
  for (const [id, rec] of gapStates) if (Object.keys(rec).length > 0) console.log(`open gap brood ${id}: ${JSON.stringify(rec)}`);
}
