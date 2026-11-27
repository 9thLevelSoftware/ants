// Probe (winter-sugar, integrator ruling 1): the first N ticks after a cached hand-over in one line - when the entrance
// opens, worker-ticks spent outside, the farthest any worker got from the mouth, and the first source of each kind the
// colony discovers - so trees with and without A3 can be compared on all 15 hand-overs at once.
//   node tools/sim/run-ts.mjs tools/sim/probe/earlyOut.ts <snapshot.bin> [ticks=3000]
import { restore } from '@/sim/save';
import { createSim } from '@/sim/sim';
import { generateWorld } from '@/worldgen';
declare const process: { stdout: { write(s: string): void } };

export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as { readFileSync(p: string): Uint8Array };
  const { state } = restore(new Uint8Array(fs.readFileSync(args[0])));
  const sim = createSim(state, generateWorld(state.config.world));
  const col = sim.state.player.colonyId, t0 = sim.state.tick, ticks = Number(args[1] ?? 3000);
  const nest = sim.state.nests.find((x) => x.colony === col)!;
  const mouth = nest.entrances[0].pos, bu = sim.world.bu;
  const firsts: Record<string, number> = {};
  sim.events.on('food-source-discovered', (e) => {
    const k = e.variant ?? e.kind;
    if (e.colonyId === col && firsts[k] === undefined) firsts[k] = sim.state.tick - t0;
  });
  let openAt = -1, outTicks = 0, far = 0;
  for (let t = 1; t <= ticks; t++) {
    sim.tick();
    if (openAt < 0 && nest.entrances.some((e) => e.status === 'open')) openAt = sim.state.tick - t0;
    for (const a of sim.state.ants) {
      if (!a.alive || a.colony !== col || a.caste !== 'worker' || a.nestId >= 0) continue;
      outTicks++;
      far = Math.max(far, Math.hypot(a.pos.x - mouth.x, a.pos.z - mouth.z) / bu);
    }
  }
  const f = Object.entries(firsts).map(([k, v]) => `${k}@${v}`).join(' ') || '-';
  process.stdout.write(`open ${openAt} outWorkerTicks ${outTicks} farBU ${Math.round(far)} firsts ${f}\n`);
}
