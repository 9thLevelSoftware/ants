// Round 7 probe (deleted at the end of the round): why eggs and pupae die `untended`. Restores a cached hand-over,
// runs GD game days and, at every untended death, prints the item's last record (chamber, untended age, board job
// for it, claim), the colony's nurses (state, job, distance) and the chambers. Every 300 ticks prints the eggs/pupae
// past TEND_DUE with the job the board holds for them.
//   node tools/sim/run-ts.mjs tools/sim/probe/probe-care7.ts CACHEFILE ARCHETYPE SEED GD
import type { ArchetypeId } from '@/sim/types';
import { defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { generateWorld } from '@/worldgen';
import { restore } from '@/sim/save';
import { TICKS_PER_DAY } from '@/sim/time';

const JOBS = ['rescue', 'evacuate', 'assist', 'feed', 'move', 'tend', 'groom'];

export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };
  const [file, arch, seedS, gdS] = args;
  const seed = Number(seedS), gd = Number(gdS ?? 1.5);
  const base = defaultGameConfig('lasius-niger', seed, 'naturalist');
  const world = generateWorld({ ...base.world, archetype: arch as ArchetypeId });
  const sim = createSim(restore(new Uint8Array(fs.readFileSync(file))).state, world);
  const col = sim.state.colonies.find((c) => c.isPlayer) ?? sim.state.colonies[0];
  const last = new Map<number, { stage: string; chamberId: number; nestId: number; x: number; y: number; z: number; age: number; job: string }>();
  const t0 = sim.state.tick;
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const jobOf = (id: number): string => {
    const bd = sim.state.nurseryBoards?.find((x) => x.colonyId === col.id);
    const j = bd?.jobs.find((x) => x.id === id);
    if (!j) return 'none';
    const claimer = sim.state.ants.find((a) => a.alive && a.bb['bn.ji'] === id && (a.bb['bn.jk'] ?? -1) >= 0);
    return `${JOBS[j.kind] ?? j.kind}${j.dest >= 0 ? `->ch${j.dest}` : ''} p${r1(j.prio)}${claimer ? ` claimed by ${claimer.id} (${claimer.state})` : ' unclaimed'}`;
  };
  const nurses = (x: number, y: number, z: number): string => sim.state.ants
    .filter((a) => a.alive && a.colony === col.id && (a.task === 'nurse' || a.task === 'queen-care'))
    .map((a) => `${a.id}:${a.task}/${a.state} job ${JOBS[a.bb['bn.jk'] ?? -1] ?? '-'} d${r1(Math.hypot(a.pos.x - x, a.pos.y - y, a.pos.z - z) / sim.world.bu)}BU ch${a.chamberId} n${a.nestId}`)
    .join('; ');
  sim.events.on('brood-died', (e) => {
    if (e.colonyId !== col.id) return;
    const r = last.get(e.broodId);
    const day = r1((sim.state.tick - t0) / TICKS_PER_DAY * 10) / 10;
    if (e.cause !== 'untended') { console.log(`gd+${day} brood ${e.broodId} ${e.stage} died ${e.cause}`); return; }
    console.log(`gd+${day} UNTENDED ${e.broodId} ${e.stage}: ${r ? `ch${r.chamberId} n${r.nestId} at (${r1(r.x)}, ${r1(r.y)}, ${r1(r.z)}) untended ${r1(r.age)} gd, board job ${r.job}` : 'no record'}`);
    if (r) console.log(`   nurses/carers: ${nurses(r.x, r.y, r.z)}`);
  });
  const end = t0 + Math.round(gd * TICKS_PER_DAY);
  while (sim.state.tick < end) {
    sim.tick();
    if (sim.state.tick % 20 === 0) {
      for (const b of sim.state.brood) {
        if (!b.alive || b.colony !== col.id || b.stage === 'larva') continue;
        last.set(b.id, { stage: b.stage, chamberId: b.chamberId, nestId: b.nestId, x: b.pos.x, y: b.pos.y, z: b.pos.z, age: (sim.state.tick - b.lastTendedTick) / TICKS_PER_DAY, job: b.carriedBy >= 0 ? `carried by ${b.carriedBy}` : jobOf(b.id) });
      }
    }
    if (sim.state.tick % 600 === 0) {
      const due = sim.state.brood.filter((b) => b.alive && b.colony === col.id && b.stage !== 'larva' && b.carriedBy < 0 && sim.state.tick - b.lastTendedTick > 0.12 * TICKS_PER_DAY);
      const nest = sim.state.nests.find((n) => n.id === col.nestIds[0]);
      const counts = { egg: 0, larva: 0, pupa: 0 } as Record<string, number>;
      for (const b of sim.state.brood) if (b.alive && b.colony === col.id) counts[b.stage]++;
      const tasks: Record<string, number> = {};
      for (const a of sim.state.ants) if (a.alive && a.colony === col.id && a.caste === 'worker') tasks[a.task] = (tasks[a.task] ?? 0) + 1;
      console.log(`gd+${r1((sim.state.tick - t0) / TICKS_PER_DAY * 10) / 10} brood ${JSON.stringify(counts)} due ${due.length} tasks ${JSON.stringify(tasks)} chambers ${nest?.chambers.map((c) => `${c.id}:${c.type}`).join(',')} target nurse ${r1(col.alloc?.target?.[0] ?? -1)}`);
      for (const b of due.slice(0, 6)) console.log(`   due ${b.id} ${b.stage} ch${b.chamberId} untended ${r1((sim.state.tick - b.lastTendedTick) / TICKS_PER_DAY * 100) / 100} gd job ${jobOf(b.id)}`);
    }
  }
}
