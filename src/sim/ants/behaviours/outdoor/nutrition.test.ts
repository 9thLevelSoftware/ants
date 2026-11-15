// Acceptance 3 (GDD 02 §5.5 rules 2-4): with a protein deficit set in the colony foragers shift toward the protein
// source, with a carbohydrate deficit toward the sugar; statistically clear over repeated seeds.

import { describe, expect, it } from 'vitest';
import { announce, countEvents, forageScenario, run } from './testkit';

const LONG = !!(globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.FOUNDRESS_LONG;
/** Default mode: two seeds, every seed must agree; FOUNDRESS_LONG=1: the five-seed sweep, one may disagree. */
const SEEDS = LONG ? [1, 2, 3, 4, 5] : [1, 2];
const TICKS = 3 * 2500; // 3 game hours

function proteinShare(seed: number, deficit: 'protein' | 'carbohydrate'): { share: number; n: number } {
  const needs = deficit === 'protein' ? { needC: 0, needP: 1, sP: 0.5 } : { needC: 1, needP: 0, sP: 0.5 };
  const { sim, col, sources } = forageScenario({
    seed, pinned: true, holdNeeds: needs, stores: { c: 3, p: 0.5 },
    sources: [
      { kind: 'sugar', variant: 'sugar-granules', distBu: 70, bearingDeg: 0, units: 300 },
      { kind: 'crumb', variant: 'crumb-protein', distBu: 70, bearingDeg: 180, units: 300 },
    ],
  });
  const [sugar, protein] = sources;
  announce(sim, col, sugar);
  announce(sim, col, protein);
  const ev = countEvents(sim, ['delivery']);
  run(sim, TICKS);
  const d = ev.kept.filter((e) => e.type === 'delivery');
  const p = d.filter((e) => e.type === 'delivery' && e.sourceId === protein.id).length;
  const s = d.filter((e) => e.type === 'delivery' && e.sourceId === sugar.id).length;
  return { share: p + s > 0 ? p / (p + s) : 0.5, n: p + s };
}

describe('acceptance 3: collective nutrition steers source choice', () => {
  it(`protein deficit -> protein source; carbohydrate deficit -> sugar (${SEEDS.length} seeds)`, () => {
    const rows = SEEDS.map((seed) => ({ seed, pdef: proteinShare(seed, 'protein'), cdef: proteinShare(seed, 'carbohydrate') }));
    for (const r of rows) {
      console.log(`seed ${r.seed}: protein share of deliveries ${r.pdef.share.toFixed(2)} (n ${r.pdef.n}) under a protein deficit,`,
        `${r.cdef.share.toFixed(2)} (n ${r.cdef.n}) under a carbohydrate deficit`);
    }
    const meanP = rows.reduce((m, r) => m + r.pdef.share, 0) / rows.length;
    const meanC = rows.reduce((m, r) => m + r.cdef.share, 0) / rows.length;
    const agree = rows.filter((r) => r.pdef.share > r.cdef.share).length;
    console.log(`mean protein share ${meanP.toFixed(2)} vs ${meanC.toFixed(2)}; ${agree}/${rows.length} seeds agree`);
    expect(meanP).toBeGreaterThan(0.6);
    expect(meanC).toBeLessThan(0.4);
    expect(agree).toBeGreaterThanOrEqual(SEEDS.length - (LONG ? 1 : 0));
    for (const r of rows) expect(r.pdef.n + r.cdef.n).toBeGreaterThan(4);
  }, 900000);
});
