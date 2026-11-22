// Round 9 probe (temporary): the weather of a new game by game hour (day, hour, state, rain mm/h, soil theta1 at the
// queen's start), to place a founding in time.  node tools/sim/run-ts.mjs tools/sim/probe/probe-rain9.ts ARCH SEED TICKS
import type { ArchetypeId } from '@/sim/types';
import { generatedWorld, sweepSim } from '@/sim/colony/founding/sweepKit';
import { queen } from '@/sim/colony/founding/testkit';
import { dayOf, hourOf } from '@/sim/time';

export default async function main(args: string[]): Promise<void> {
  const [arch, seedS, ticksS] = args;
  const { world, config } = generatedWorld(arch as ArchetypeId, Number(seedS));
  const sim = sweepSim(world, config);
  const q = queen(sim), x = q.pos.x, z = q.pos.z;
  const mo = sim.state.env.moisture;
  for (let t = 0; t < Number(ticksS); t++) {
    if (t % 250 === 0) {
      const cal = sim.state.env.calendar.startTick + sim.state.tick, w = sim.state.env.weather;
      const th = mo.nx > 0 ? mo.theta1[Math.floor(z / mo.cell) * mo.nx + Math.floor(x / mo.cell)] / 255 : -1;
      console.log(`${sim.state.tick} day ${dayOf(cal)} ${hourOf(cal).toFixed(2)} ${w.state} rain ${w.rainRateMmH.toFixed(2)} theta1 ${th.toFixed(2)}`);
    }
    sim.tick();
  }
}
