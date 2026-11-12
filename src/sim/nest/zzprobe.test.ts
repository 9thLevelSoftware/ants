import { appendFileSync } from 'fs';
import { it } from 'vitest';
import { colonyNests, freeDig } from './freeDigKit';
const out = (x: unknown) => appendFileSync('/tmp/claude-0/-home-user/5d615ab8-0e9f-5b70-a250-dd35942c7bf1/scratchpad/sfc-probe.txt', JSON.stringify(x) + '\n');
it('probe', () => {
  const { sim, queen } = freeDig(11);
  const nest = colonyNests(sim, queen.colony)[0];
  const surf = sim.state.items.filter((it) => it.alive && it.kind === 'soil-pellet');
  out(['pellets', surf.length, surf.filter((i) => !i.inNest).length, surf.map((i) => [i.inNest, i.carrierIds.length, ((sim.state.tick - i.droppedTick) / 10).toFixed(0), i.volume.toFixed(2)].join(':')).join(' ')]);
  out(['founding', nest.founding?.state, 'tick', sim.state.tick, 'queen action', queen.action?.kind ?? null]);
});
