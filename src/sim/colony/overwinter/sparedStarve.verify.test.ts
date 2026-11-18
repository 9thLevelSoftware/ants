// Independent review of colony-life round 5, fix WL2 (begin.ts chargeSparedWorkers, model.ts sparedWorkersFood): the
// workers the R24 cap keeps alive now eat their winter food, but only "as far as the stores go". The extra food is
// charged after the model has run, so when it empties the stores the kept workers simply stop eating: no starvation
// is drawn for them. A colony whose nest flooded every rainy day of the winter (floods not alerted, so capped) can then
// wake with more workers than the very same colony in a dry nest, which had all its mouths to feed in the model and
// starved for it. Same seed, same draws (the model rolls the flood on every rainy day either way): the flooded colony
// must never come out ahead of the dry one.
import { describe, expect, it } from 'vitest';
import { colonyOf, makeLifeSim, send } from '../succession/testLife';

describe('WL2 review: a capped flood colony short of food starves like a dry one', () => {
  it('with stores too small for the winter, flooding every rainy day never leaves more workers at spring than no flood', () => {
    const winter = (seed: number, floodRisk: number) => {
      const sim = makeLifeSim({ chamberC: 4, workers: 20, c: 1.5, p: 6, seed });
      const col = colonyOf(sim);
      for (const ch of sim.state.nests[0].chambers) ch.floodRisk = floodRisk;
      send(sim, { type: 'cheat.triggerWinter' });
      send(sim, { type: 'overwinterChoice', choice: 'begin' });
      return col.lifecycle!.winters[0];
    };
    const rows: string[] = [];
    let compared = 0, ahead = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const flooded = winter(seed, 1);
      if ((flooded.losses.drowning ?? 0) === 0 && Object.values(flooded.losses).reduce((a, b) => a + b, 0) >= 20) continue;
      const dry = winter(seed, 0);
      if ((dry.losses.starvation ?? 0) === 0) continue; // the case is a winter the dry colony cannot feed
      compared++;
      rows.push(`seed ${seed}: workers at spring flooded ${flooded.workers1} vs dry ${dry.workers1}; C ${flooded.c1.toFixed(2)} vs ${dry.c1.toFixed(2)}; ` +
        `losses flooded ${JSON.stringify(flooded.losses)} dry ${JSON.stringify(dry.losses)}`);
      if (flooded.workers1 > dry.workers1) ahead++;
    }
    expect(compared, rows.join(' | ')).toBeGreaterThan(0);
    expect(ahead, rows.join(' | ')).toBe(0);
  }, 180_000);
});
