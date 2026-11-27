// Probe (winter-sugar, integrator ruling 1): every unplugging episode of the player's nest from a cached hand-over to
// the first tick of Winter 1 - when an entrance goes `reopening`, when it is `open` again, how many workers stood in
// dig.unplug and for how many worker-ticks, how many bites (unseal primitive starts) - plus worker-ticks on the dig
// task by day. Used to see whether A3 (unplug stand point) costs workers over the year, not only at the hand-over.
//   node tools/sim/run-ts.mjs tools/sim/probe/unplugYear.ts <snapshot.bin> [maxTicks=120000]
// Run it from the tree under test. Prints the state hash at +6000 (compare with firstDay.ts's end hash).
import { restore, stateHash } from '@/sim/save';
import { createSim } from '@/sim/sim';
import { generateWorld } from '@/worldgen';
import { currentSeason, TICKS_PER_DAY } from '@/sim/time';
declare const process: { stdout: { write(s: string): void } };

interface Episode { entrance: number; from: number; to: number; ants: Set<number>; antTicks: number; bites: number }

export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };
  const { state } = restore(new Uint8Array(fs.readFileSync(args[0])));
  const sim = createSim(state, generateWorld(state.config.world));
  const out = (s: string) => process.stdout.write(s + '\n');
  const col = sim.state.player.colonyId, t0 = sim.state.tick, max = Number(args[1] ?? 120000);
  const nestIds = new Set(sim.state.nests.filter((n) => n.colony === col).map((n) => n.id));
  const open = new Map<number, Episode>();
  const done: Episode[] = [];
  sim.events.on('entrance-state-changed', (e) => {
    const nest = sim.state.nests.find((n) => n.entrances.some((x) => x.id === e.entranceId));
    if (!nest || !nestIds.has(nest.id)) return;
    const rel = sim.state.tick - t0;
    if (e.status === 'reopening' && !open.has(e.entranceId)) open.set(e.entranceId, { entrance: e.entranceId, from: rel, to: -1, ants: new Set(), antTicks: 0, bites: 0 });
    if (e.status === 'open' && open.has(e.entranceId)) { const ep = open.get(e.entranceId)!; ep.to = rel; done.push(ep); open.delete(e.entranceId); }
  });
  const biting = new Set<number>();
  let digTicks = 0, unplugTicksAll = 0;
  const digByDay: number[] = [];
  for (let t = 1; t <= max; t++) {
    sim.tick();
    const rel = sim.state.tick - t0;
    for (const a of sim.state.ants) {
      if (!a.alive || a.colony !== col || a.caste !== 'worker') continue;
      if (a.task === 'dig') digTicks++;
      if (a.state === 'dig.unplug') {
        unplugTicksAll++;
        for (const ep of open.values()) { ep.ants.add(a.id); ep.antTicks++; }
      }
      if (a.action?.id === 'unseal-entrance') {
        if (!biting.has(a.id)) { biting.add(a.id); for (const ep of open.values()) ep.bites++; }
      } else biting.delete(a.id);
    }
    if (rel === 6000) out(`hash at +6000 ${stateHash(sim.state)}`);
    if (rel % TICKS_PER_DAY === 0) { digByDay.push(Math.round(digTicks / TICKS_PER_DAY * 100) / 100); digTicks = 0; }
    if (currentSeason(sim.state) === 'winter') { out(`winter at +${rel}`); break; }
  }
  for (const ep of [...done, ...open.values()]) {
    out(`episode entrance ${ep.entrance}: reopening +${ep.from} open +${ep.to} (${ep.to >= 0 ? ep.to - ep.from : 'never'} ticks), ${ep.ants.size} unpluggers, ${ep.antTicks} worker-ticks in dig.unplug, ${ep.bites} bites`);
  }
  const c = sim.stores.colonies.get(col)!;
  out(`episodes ${done.length} (+${open.size} unfinished); worker-ticks in dig.unplug ${unplugTicksAll}; dig worker-days by day ${digByDay.join(' ')}`);
  out(`end +${sim.state.tick - t0}: workers ${c.core?.workers ?? 0}, C ${c.stores.c.toFixed(3)}, hash ${stateHash(sim.state)}`);
}
