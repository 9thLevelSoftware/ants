// Acceptance 2 and 3 (architect spec): a founding nest grows with a scripted population to 300 workers, every
// architect plan is completed at once by a test digger; over 10 seeds the nest matches the Lasius template of
// GDD 03 §8.2 / §8.6 and keeps the navigability and spacing rules of §5.3 / §8.5, measured on the carve grid.

import { describe, expect, it } from 'vitest';
import { ARCH_BAND_SLACK_BU, REQUIRED_TYPES } from '@/sim/balance/architect';
import { nestTemplate } from '@/sim/balance/nest';
import { grow, testLog, type Grown } from './architectTestKit';
import { checkNest, type NestReport } from './nestChecks';
import { architectRuntime } from './runtime';

const LN = nestTemplate('lasius-niger');
const FINAL_WORKERS = 300;
/** Open volume per adult worker accepted at FINAL_WORKERS (GDD 03 D4: about 2 BU^3), BU^3. */
const D4_PER_ADULT: [number, number] = [1.5, 3];

const log = (...a: unknown[]) => testLog(false, ...a);

function describeReport(seed: number, r: NestReport, g: Grown): string {
  const { probe: _p, ...rt } = architectRuntime(g.sim);
  return `seed ${seed}: ${JSON.stringify(r.chambersByType)} vol ${r.volume.toFixed(0)} footprint ${r.footprintBu.toFixed(1)} `
    + `entrances ${r.openEntrances} plans ${g.created.length} ${JSON.stringify(rt)} at40 ${JSON.stringify(g.at40)}`;
}

describe('architect growth to 300 workers (acceptance 2, 3)', () => {
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  it.each(seeds)('seed %i: template, navigability and spacing hold', (seed) => {
    const g = grow({ seed, workers: FINAL_WORKERS });
    const r = checkNest(g.sim, g.nest, g.created, ARCH_BAND_SLACK_BU);
    log(describeReport(seed, r, g));
    if (r.thinWalls.length || r.outOfBand.length || r.unreachable.length) log('  ', JSON.stringify(r));
    // chamber counts by type (GDD 03 §8.2 required types, §6.5 one royal)
    expect(r.chambersByType.royal).toBe(1);
    for (const q of REQUIRED_TYPES['lasius-niger']) expect(r.chambersByType[q.type] ?? 0).toBeGreaterThanOrEqual(q.count);
    expect(r.chambersByType.founding ?? 0).toBe(0);
    // growth reference (GDD 03 §8.6): at 25-40 workers food S and rest M exist. Volume: recorded contradiction
    // inside GDD 03 - deviation D4 says about 2 BU^3 per adult, the §8.6 tester table says ~350 BU^3 at 25-40
    // workers and ~1,000 at 150 (6-9 per adult; it meets D4 only at 1,500). D4 is the chapter's design rule
    // (the needs' capacities produce it); §8.6 is a reference, so the test holds D4: 300 workers, 1.5-3 per adult.
    expect(g.at40?.types.food ?? 0).toBeGreaterThanOrEqual(1);
    expect(g.at40?.types.nursery ?? 0).toBeGreaterThanOrEqual(1);
    expect(r.volume).toBeGreaterThan(D4_PER_ADULT[0] * FINAL_WORKERS);
    expect(r.volume).toBeLessThan(D4_PER_ADULT[1] * FINAL_WORKERS);
    // depth bands (+- the candidate slack of GDD 03 §8.4), footprint radius, entrances
    expect(r.outOfBand).toEqual([]);
    expect(r.footprintBu).toBeLessThanOrEqual(LN.footprintR);
    expect(r.openEntrances).toBeGreaterThanOrEqual(1);
    expect(r.openEntrances).toBeLessThanOrEqual(r.maxEntrances);
    // acceptance 3: navigable, every plan valid when created, walls / floors / roofs and tunnel diameter
    expect(r.unreachable).toEqual([]);
    expect(r.invalidPlans).toBe(0);
    expect(architectRuntime(g.sim).createRefused).toBe(0);
    expect(r.thinWalls).toEqual([]);
    expect(r.thinRoofs).toBe(0);
    expect(r.thinTunnels).toBe(0);
  }, 300_000);
});
