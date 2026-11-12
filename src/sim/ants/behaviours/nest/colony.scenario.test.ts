// beh-nest acceptance 2: the standard small nest, an established queen, 40 workers, 30 brood of mixed stages and
// ample stores run 2 game days with only autonomous behaviours. No larva stays hungry up to the starvation
// threshold (LARVA_STARVE_GD) and the mean stays below the laying threshold (0.6, GDD 02 §3.3), the queen lays
// through `lay-egg` and her eggs end up on brood piles away from her, and brood reaches adulthood at about the
// rate the brood model predicts (GDD 02 §2.2-2.3 at the forced reference 21 C).
import { describe, expect, it } from 'vitest';
import { LAYING_LARVAL_HUNGER_MAX, LARVA_STARVE_GD } from '@/sim/balance';
import { BROOD_SURVIVAL, ECLOSE_WAIT_GD } from '@/sim/balance/colony';
import { TICKS_PER_DAY } from '@/sim/time';
import { devRate, stageDu } from '@/sim/colony';
import { forceClimate, makeNestColony } from './testkit';
import { EGG_COLLECT_BU } from '@/sim/balance/nestwork';

/** The brood model's reference temperature (r = 1 DU per gd, GDD 02 §2.2). */
const CHAMBER_C = 21;
/** Progress of the spawned pupae, so that they eclose inside the 2 days. */
const PUPA_PROGRESS = 0.3;

describe('beh-nest colony scenario (acceptance 2)', () => {
  it('2 game days: larvae fed, eggs collected to piles, brood ecloses at the modelled rate', () => {
    const k = makeNestColony({
      workers: 40, stores: { c: 200, p: 200 },
      brood: [
        { stage: 'egg', n: 10, chamber: 'nursery' },
        { stage: 'larva', n: 10, chamber: 'nursery' },
        { stage: 'pupa', n: 10, chamber: 'nursery', progress: PUPA_PROGRESS },
      ],
    });
    const { sim, queen } = k;
    forceClimate(k, () => [CHAMBER_C, 0.85]);
    const def = sim.species;
    const eclosedAt: number[] = [];
    const laid: number[] = [];
    const deaths: Record<string, number> = {};
    sim.events.on('ant-eclosed', () => eclosedAt.push(sim.state.tick));
    sim.events.on('egg-laid', (e) => laid.push(e.broodId));
    sim.events.on('brood-died', (e) => { const key = `${e.stage}:${e.cause}`; deaths[key] = (deaths[key] ?? 0) + 1; });
    let hungerSum = 0, hungerN = 0, hungerMax = 0, maxHungerTicks = 0;
    const days = 2;
    for (let t = 0; t < days * TICKS_PER_DAY; t++) {
      sim.tick();
      if (t % 50 !== 0) continue;
      const larvae = sim.stores.brood.list.filter((b) => b.alive && b.stage === 'larva');
      if (larvae.length === 0) continue;
      const mean = larvae.reduce((s, b) => s + (1 - (b.gutC + b.gutP) / 0.3), 0) / larvae.length;
      hungerSum += mean; hungerN++;
      hungerMax = Math.max(hungerMax, mean);
      for (const b of larvae) maxHungerTicks = Math.max(maxHungerTicks, b.hungerTicks);
    }
    // eggs the queen laid that are still eggs: where are they?
    const eggs = laid.map((id) => sim.stores.brood.get(id)).filter((b) => b && b.alive && b.stage === 'egg' && b.carriedBy < 0);
    const nearQueen = eggs.filter((b) => Math.hypot(b!.pos.x - queen.pos.x, b!.pos.z - queen.pos.z) <= EGG_COLLECT_BU * sim.world.bu);
    const inBroodChamber = eggs.filter((b) => k.nest.chambers.some((c) => c.id === b!.chamberId && (c.type === 'nursery' || c.type === 'royal')));
    // brood model: the pupae eclose after the rest of their stage, (1 - progress) x PUPA_DU / r(T); larvae need the
    // larval plus the pupal stage, so with 2 days at 21 C only the pupae cohort (x its base survival) is expected
    const r = devRate(def, CHAMBER_C);
    const pupaGd = ((1 - PUPA_PROGRESS) * stageDu(def, 'pupa', 'worker')) / r;
    const larvaGd = stageDu(def, 'larva', 'worker') / r;
    const larvaeInTime = larvaGd + stageDu(def, 'pupa', 'worker') / r <= 2 ? 10 * BROOD_SURVIVAL.larva * BROOD_SURVIVAL.pupa : 0;
    const expected = 10 * BROOD_SURVIVAL.pupa + larvaeInTime;
    // eclosion waits for a nurse's help after the stage ends (GDD 02 §2.9); within ECLOSE_WAIT_GD no pupa fails
    const firstCohort = eclosedAt.filter((t) => t <= (pupaGd + ECLOSE_WAIT_GD) * TICKS_PER_DAY).length;
    const report = {
      meanLarvalHunger: +(hungerSum / Math.max(1, hungerN)).toFixed(3), peakMeanHunger: +hungerMax.toFixed(3),
      longestHungerGd: +(maxHungerTicks / TICKS_PER_DAY).toFixed(3), eggsLaid: laid.length, eggsLyingNow: eggs.length,
      eggsWithin2BuOfQueen: nearQueen.length, eggsInBroodChambers: inBroodChamber.length, eclosions: eclosedAt.length,
      expectedEclosions: +expected.toFixed(1), pupaStageGd: +pupaGd.toFixed(2), larvaPlusPupaGd: +(larvaGd + stageDu(def, 'pupa', 'worker') / r).toFixed(2),
      eclosedByPupaStage: firstCohort, firstEclosionGd: eclosedAt.length ? +(eclosedAt[0] / TICKS_PER_DAY).toFixed(2) : null,
      lastEclosionGd: eclosedAt.length ? +(eclosedAt[eclosedAt.length - 1] / TICKS_PER_DAY).toFixed(2) : null, deaths,
    };
    console.log('[beh-nest AC2]', JSON.stringify(report));
    // the chapter's larval hunger threshold: no larva goes hungry for LARVA_STARVE_GD (GDD 02 §2.5), and the colony
    // mean stays below the laying-permission limit LAYING_LARVAL_HUNGER_MAX (GDD 02 §3.3)
    expect(report.longestHungerGd).toBeLessThan(LARVA_STARVE_GD);
    expect(report.meanLarvalHunger).toBeLessThan(LAYING_LARVAL_HUNGER_MAX);
    expect(deaths['larva:starvation'] ?? 0).toBe(0);
    expect(laid.length).toBeGreaterThan(10);
    // collected: at most the last few (laid in the last minutes) still lie by the queen
    expect(nearQueen.length).toBeLessThanOrEqual(Math.max(3, Math.ceil(0.15 * eggs.length)));
    expect(inBroodChamber.length).toBe(eggs.length);
    // pupae eclose in their stage time (+ the help wait) and the total is within 25 % of the model's expectation
    expect(firstCohort).toBeGreaterThanOrEqual(8);
    expect(Math.abs(eclosedAt.length - expected)).toBeLessThanOrEqual(0.25 * expected);
  }, 600_000);
});
