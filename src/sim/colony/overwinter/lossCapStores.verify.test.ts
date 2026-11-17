// Independent review of colony-life round 4, fix WL1 (ruling R24, the lapse loss cap). `beginOverwinter` runs the
// winter model, which charges the winter's food for the workers it expects to live day by day (a flood drowns half the
// cluster, and from that day on half the colony eats), and then trims the drawn worker losses to the cap. The capped
// colony wakes with the workers the model had drowned, but the stores at spring are still the model's: the workers
// kept alive by the cap ate nothing all winter. Same seed, same draws: a colony that keeps more workers must end the
// winter with less food than one that lost them.
import { describe, expect, it } from 'vitest';
import { colonyOf, makeLifeSim, send } from '../succession/testLife';
import { lifecycleOf } from '../succession/lifecycleState';

describe('R24 review: the workers the cap keeps eat through the winter', () => {
  it('in a flood-prone nest, the capped (not alerted) colony ends the winter with less C than the alerted one that drowned', () => {
    const winter = (seed: number, alerted: boolean) => {
      const sim = makeLifeSim({ chamberC: 4, workers: 20, c: 20, p: 6, seed });
      const col = colonyOf(sim);
      for (const ch of sim.state.nests[0].chambers) ch.floodRisk = 1; // every rain end may flood the cluster
      if (alerted) lifecycleOf(col).hazardAlertTicks = { 'nest-flooding': sim.state.tick };
      send(sim, { type: 'cheat.triggerWinter' });
      send(sim, { type: 'overwinterChoice', choice: 'begin' });
      return col.lifecycle!.winters[0];
    };
    const rows: string[] = [];
    let compared = 0, ateMore = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const drowned = winter(seed, true);
      if ((drowned.losses.drowning ?? 0) < 3) continue; // a flood in this winter's draws
      const capped = winter(seed, false);
      expect(capped.workers1, `seed ${seed}`).toBeGreaterThan(drowned.workers1);
      rows.push(`seed ${seed}: workers ${capped.workers1} vs ${drowned.workers1}, C at spring ${capped.c1.toFixed(3)} vs ${drowned.c1.toFixed(3)}`);
      compared++;
      // a flood on the last day leaves no day to eat: only "never less" would be a fair failure, so count the seeds
      if (capped.c1 < drowned.c1 - 1e-6) ateMore++;
    }
    expect(compared).toBeGreaterThan(0);
    expect(ateMore, rows.join('; ')).toBeGreaterThan(0);
  }, 120_000);
});
