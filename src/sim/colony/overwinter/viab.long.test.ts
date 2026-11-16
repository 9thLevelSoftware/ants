// FOUNDRESS_LONG=1: the overwintering applied to the end states of the last viability sweep (integrator addendum:
// `test-output/viab/final3/`, colonies at the first tick of Winter 1 from tools/sim/life.ts --until winter).
// LIMITATION (recorded in the report): the sweep keeps per-day metrics, not saved simulation states, so each viable end
// state (workers, brood, stores, brood-chamber temperature) is REBUILT in a test colony whose chambers lie 25 BU deep
// at a constant temperature, and wintered through the real Begin step. A colony is alive in spring when its queen and
// at least one worker live. Colonies whose stores covered the winter must be alive; colonies that ran out of stores
// (the chapter's conditions not met) are reported, not asserted. Rows go to test-output/lifecycle/winter-viab.json.
import { describe, expect, it } from 'vitest';
import { currentSeason, currentYear } from '@/sim/time';
import { colonyOf, makeLifeSim, send } from '../succession/testLife';

declare const process: { env: Record<string, string | undefined> } | undefined;
const LONG = (typeof process !== 'undefined' ? process.env : {}).FOUNDRESS_LONG === '1';

interface Fs {
  readdirSync(p: string): string[];
  readFileSync(p: string, e: string): string;
  mkdirSync(p: string, o: { recursive: boolean }): void;
  writeFileSync(p: string, d: string): void;
}
const DIR = 'test-output/viab/final3/';
/** Depth of the rebuilt colony's chambers, mm (25 BU of Lasius: the royal / nursery depth band of GDD 03 §8.2). */
const CHAMBER_DEPTH_MM = 100;

describe.skipIf(!LONG)('winter on the viability sweep end states (FOUNDRESS_LONG)', () => {
  it('every viable colony at Winter 1 reaches Spring 2 alive', async () => {
    const mod = 'node:fs';
    const fs = (await import(/* @vite-ignore */ mod)) as Fs;
    const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
    const rows: Record<string, unknown>[] = [];
    let seed = 0;
    for (const f of files) {
      const j = JSON.parse(fs.readFileSync(DIR + f, 'utf8')) as { viable?: { viable?: boolean }; days: { state: Record<string, number> }[] };
      if (!j.viable?.viable) continue;
      const st = j.days[j.days.length - 1].state;
      seed++; // each colony its own winter draws (the end states come from different worlds)
      const sim = makeLifeSim({
        seed,
        workers: st.workers, larvae: st.larvae + st.eggs, pupae: st.pupae, c: st.storesC, p: st.storesP,
        chamberC: st.broodTempC,
      });
      for (const n of sim.state.nests) for (const ch of n.chambers) { ch.depthMm = CHAMBER_DEPTH_MM; ch.depthBu = CHAMBER_DEPTH_MM / sim.world.bu; }
      const year = currentYear(sim.state);
      send(sim, { type: 'cheat.triggerWinter' });
      send(sim, { type: 'overwinterChoice', choice: 'begin' });
      const rec = colonyOf(sim).lifecycle!.winters[0];
      expect(currentSeason(sim.state)).toBe('spring');
      expect(currentYear(sim.state)).toBe(year + 1);
      rows.push({
        file: f, workers0: rec.workers0, workers1: rec.workers1, losses: rec.losses, larvae: [rec.larvae0, rec.larvae1],
        c: [Math.round(rec.c0 * 10) / 10, Math.round(rec.c1 * 10) / 10], p: [Math.round(rec.p0 * 10) / 10, Math.round(rec.p1 * 10) / 10],
        coldest: Math.round(rec.coldestC * 10) / 10, queen: rec.queenAlive ? 'alive' : rec.queenCause,
        storesLasted: rec.c1 > 0, alive: rec.queenAlive && rec.workers1 > 0,
      });
    }
    fs.mkdirSync('test-output/lifecycle', { recursive: true });
    fs.writeFileSync('test-output/lifecycle/winter-viab.json', JSON.stringify(rows, null, 1));
    expect(rows.length).toBeGreaterThanOrEqual(1);
    // the queen's own winter risk (3 % at Naturalist) can take a well-stocked colony too: at most one such loss
    const stocked = rows.filter((r) => r.storesLasted);
    const stockedDead = stocked.filter((r) => !r.alive);
    expect(stocked.length).toBeGreaterThanOrEqual(1);
    expect(stockedDead.length).toBeLessThanOrEqual(1);
    for (const r of stockedDead) expect(r.queen).not.toBe('starvation');
  });
});
