// Round 13 probe (temporary): direction 27a item 3, kd #2's nursing gap. Restores a cached hand-over, follows every
// worker's task tick by tick (transitions and the reason the ant's decision ring gives), and every game hour from H0
// logs the nurse demand / target / alloc.actual / true count, and for each idle worker why she does not take `nurse`:
// reassignable, band, eligible, threshold, stimulus, take probability, state, chamber.
//   node tools/sim/run-ts.mjs tools/sim/probe/probe-nurse13.ts CACHE.bin ARCHETYPE SEED [H0] [H1]
import type { ArchetypeId } from '@/sim/types';
import { REASON_CODES, TASKS, taskIndex } from '@/sim/types';
import { defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { SYSTEMS } from '@/sim/systems';
import { generateWorld } from '@/worldgen';
import { restore } from '@/sim/save';
import { TICKS_PER_DAY } from '@/sim/time';
import { eligible, thresholdBand } from '@/sim/colony/allocation/groups';
import { reassignable, stimulus, takeProbability, threshold } from '@/sim/colony/allocation/assign';

export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };
  const [file, arch, seedS, h0S, h1S] = args;
  const base = defaultGameConfig('lasius-niger', Number(seedS), 'naturalist');
  const world = generateWorld({ ...base.world, archetype: arch as ArchetypeId });
  const sim = createSim(restore(new Uint8Array(fs.readFileSync(file))).state, world, { systems: SYSTEMS });
  const col = sim.stores.colonies.get(sim.state.player.colonyId)!;
  const def = sim.getSpecies(col.species)!;
  const h0 = Number(h0S ?? 48), h1 = Number(h1S ?? 68);
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const N = taskIndex('nurse');
  const last = new Map<number, string>();
  let trans: Record<string, number> = {};
  const HT = TICKS_PER_DAY / 24;
  for (let tk = 0; tk < h1 * HT; tk++) {
    sim.tick();
    const h = Math.floor(tk / HT);
    for (const a of sim.state.ants) {
      if (!a.alive || a.colony !== col.id || a.caste !== 'worker') continue;
      const prev = last.get(a.id);
      if (prev !== undefined && prev !== a.task && h >= h0) {
        const d = a.mem.decisions[0];
        const why = d ? (REASON_CODES as readonly string[])[d.code] ?? String(d.code) : '?';
        const k = `${prev}->${a.task} (${why}${d && d.code >= 0 ? `/${TASKS[d.detail] ?? d.detail}` : ''})`;
        trans[k] = (trans[k] ?? 0) + 1;
      }
      last.set(a.id, a.task);
    }
    if ((tk + 1) % HT !== 0 || h < h0) continue;
    let nurses = 0;
    const idle: unknown[] = [], nurseStates: Record<string, number> = {};
    for (const a of sim.state.ants) {
      if (!a.alive || a.colony !== col.id || a.caste !== 'worker') continue;
      if (a.task === 'nurse') { nurses++; nurseStates[a.state] = (nurseStates[a.state] ?? 0) + 1; }
      if (a.task !== 'idle') continue;
      const band = thresholdBand(a, sim.state.tick);
      idle.push({ id: a.id, st: a.state, ch: a.chamberId, re: reassignable(a), band, el: eligible(a, 'nurse', band, def),
        th: r2(threshold(sim, a, 'nurse', def)), p: r2(takeProbability(sim, col, a, 'nurse', def)), base: r2(a.thresholds[N]),
        age: r2((sim.state.tick - a.bornTick) / TICKS_PER_DAY), flags: a.flags });
    }
    let larvae = 0, hungry = 0;
    for (const b of sim.state.brood) if (b.alive && b.colony === col.id && b.stage === 'larva') { larvae++; if (b.hunger > 0.5) hungry++; }
    console.log(JSON.stringify({ h: h + 1, workers: col.core?.workers, demand: r2(col.alloc.demand[N]), target: col.alloc.target[N],
      actual: col.alloc.actual[N], nurses, stim: r2(stimulus(col, N)), nurseStates, larvae, hungry, stores: { c: r2(col.stores.c), p: r2(col.stores.p) }, idle, trans }));
    trans = {};
  }
}
