// viab-loco acceptance 1 (FOUNDRESS_LONG=1): the colony-life runs of the gate's stall sites (gate-1B-sim-report §12
// L10: suburban-garden #1, woodland-edge #1 and #2, playground-park #2, kitchen-door #3), founded with the founding
// module's own state machine (cheat.completeFounding, as tools/sim/life.ts) and lived to game day 10 with no player:
// the walker-stall and walker-in-bounds invariants report nothing (checked every 500 ticks, as the life tool does).
// About 5-8 minutes per run on the shared machine; one run per test. The reduced fast cases of the sites' causes are
// in viabLoco.test.ts (climbing, thin sheet, pile crest) and possessedSweep.test.ts.
import { describe, expect, it } from 'vitest';
import type { ArchetypeId } from '@/sim/types';
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { TICKS_PER_DAY } from '@/sim/time';
import { collectInvariants } from '@/sim/testing/invariants';
import { generateWorld } from '@/worldgen';

declare const process: { env: Record<string, string | undefined> };
const LONG = process.env.FOUNDRESS_LONG === '1';
const UNTIL_DAY = 10;

function lifeViolations(archetype: ArchetypeId, seed: number): string[] {
  const base = defaultGameConfig('lasius-niger', seed, 'naturalist');
  const config = { ...base, cheats: true, world: { ...base.world, archetype } };
  const world = generateWorld(config.world);
  const sim = createSim(createNewGame(config, world).state, world);
  sim.enqueue({ type: 'cheat.completeFounding', workers: 10 });
  const watch = collectInvariants().filter((i) => i.name === 'walker-stall' || i.name === 'walker-in-bounds');
  const out: string[] = [];
  const end = UNTIL_DAY * TICKS_PER_DAY;
  while (sim.state.tick < end) {
    sim.tick();
    if (sim.state.tick % 500 === 0) for (const inv of watch) inv.check(sim, (d) => { if (out.length < 20) out.push(`${sim.state.tick} ${inv.name}: ${d}`); });
  }
  return out;
}

describe.skipIf(!LONG)('stall sites of the gate (L10), colony life to game day 10 (FOUNDRESS_LONG=1)', () => {
  const runs: [ArchetypeId, number][] = [['suburban-garden', 1], ['woodland-edge', 1], ['woodland-edge', 2], ['playground-park', 2], ['kitchen-door', 3]];
  for (const [a, s] of runs) it(`${a} #${s}: no stalled ant, nobody outside the map`, () => expect(lifeViolations(a, s)).toEqual([]), 3_600_000);
});
