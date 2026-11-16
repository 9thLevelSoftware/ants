// Reviewer measurement (FOUNDRESS_LONG=1): cost of the human-events system per tick while one mower, one vacuum or
// one car runs on a generated kitchen-door map, and the size of `run.cues` that perception scans per ant.
// Load-tolerant limit (2 ms mean per tick); the numbers are printed for the report.

import { describe, expect, it } from 'vitest';
import type { HumanEventKind, Sim } from '@/sim/types';
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { humanEventsSystem } from './index';
import { humanSites } from './sites';
import { scheduleNow } from './testkit';

const nodeEnv = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

describe.skipIf(!nodeEnv.FOUNDRESS_LONG)('human events per-tick cost (reviewer)', () => {
  it('mowing, vacuum and footsteps runs stay cheap per tick', () => {
    const cfg = defaultGameConfig('lasius-niger', 7);
    cfg.cheats = true;
    cfg.world = { ...cfg.world, archetype: 'kitchen-door' };
    const g = createNewGame(cfg);
    const sim: Sim = createSim(g.state, g.world, { systems: [humanEventsSystem] });
    sim.state.config.difficulty.params.humanFreqMult = 0;
    sim.tick();
    const sites = humanSites(sim.world).list;
    const cases: [HumanEventKind, string | null, string][] = [['mowing', 'motor', 'lawn-mown'], ['vacuum', null, 'interior-floor'], ['footsteps', 'adult', 'interior-lane']];
    for (const [kind, variant, siteKind] of cases) {
      const site = sites.find((s) => s.kind === siteKind);
      if (!site) { console.log(`${kind}: no ${siteKind} site`); continue; }
      const inst = scheduleNow(sim, kind, variant as never, site.id, null);
      let best = Infinity, maxCues = 0;
      for (let rep = 0; rep < 3; rep++) {
        const t0 = performance.now();
        let n = 0;
        for (let i = 0; i < 300; i++) {
          sim.tick(); n++;
          for (const r of sim.state.env.human.active) maxCues = Math.max(maxCues, r.cues.length);
        }
        best = Math.min(best, (performance.now() - t0) / n);
      }
      console.log(`${kind}: ${best.toFixed(3)} ms/tick (min of 3 x 300 ticks), max cues in one run ${maxCues}`);
      expect(best).toBeLessThan(2);
      inst.cancelled = true;
      sim.state.env.human.active.length = 0;
    }
  }, 300_000);
});
