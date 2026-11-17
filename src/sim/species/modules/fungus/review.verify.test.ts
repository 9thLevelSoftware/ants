// Reviewer's tests for the fungus-garden module (task species-leafcutter, independent review). Passing tests are
// kept as regression tests; a failing test demonstrates a defect found in review and stays red for the fixer.
// Each test names the rule it checks (GDD 07 section) and, where red, the defect.

import { describe, expect, it } from 'vitest';
import type { GardenRecord } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { requireSpecies } from '@/sim/species';
import { TICKS_PER_DAY } from '@/sim/time';
import { begin, stepAction } from '@/sim/ants/actions/runner';
import { LEAF_TRAITS } from '@/sim/balance/species-leafcutter';
import { fungusParams } from './params';
import { stepGarden, type GardenInputs } from './dynamics';
import { nextState } from './states';
import { fHumidity, fTemp } from './climate';
import { narrowestStage } from './chain';
import { plantSubstrate, plantShares, substrateOver } from './substrate';
import { takeLots } from './cache';
import { addAnts, addLarvae, attaKit, run } from './testkit';
import { gardenDiag } from './diagnostics';
import { TEND_MODE } from './actions';
import { isDisplayLump } from './display';

const P = fungusParams(requireSpecies('atta-texana'))!;
const DT = 25 / TICKS_PER_DAY;

function garden(over: Partial<GardenRecord> = {}): GardenRecord {
  return { chamberId: 1, state: 'healthy', biomass: 2, health: 1, infection: 0, substrate: 0, waste: 0, contamination: 0, gcap: 22.6, ...over };
}

const BASE: GardenInputs = {
  tempC: 23, rh: 0.9, gardeners: 1000, weeders: 0, subIn1Gd: 0, subQ: 1, subP: 0.1, subT: 0, founding: false, queenInChamber: false,
};

/** Steps a garden for `days` with the inputs (subIn1Gd may be a function of the current mass). */
function steps(g: GardenRecord, days: number, inp: Partial<GardenInputs> & { subPerGu?: number }): void {
  for (let t = 0; t < days - 1e-9; t += DT) {
    const sub = inp.subPerGu !== undefined ? inp.subPerGu * g.biomass : (inp.subIn1Gd ?? 0);
    stepGarden(P, g, { ...BASE, ...inp, subIn1Gd: sub }, DT);
    const s = nextState(P, g);
    if (s === 'dead' && g.state !== 'dead') { g.waste += g.biomass; g.biomass = 0; }
    g.state = s;
  }
}

describe('review: pure garden rules (GDD 07 §6.4.2-6.4.3)', () => {
  it('climate factors at the segment ends and for NaN inputs stay in 0..1', () => {
    for (const t of [-50, 0, 15, 16.5, 18, 21, 25, 28, 29, 30, 60, NaN, Infinity]) {
      const f = fTemp(P, t);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
    }
    expect(fTemp(P, 16.5)).toBeCloseTo(0.25, 6);
    expect(fTemp(P, 29)).toBeCloseTo(0.25, 6);
    for (const rh of [-1, 0, 0.5, 0.55, 0.7, 0.8, 2, NaN]) {
      const f = fHumidity(P, rh);
      expect(f).toBeGreaterThanOrEqual(0.3 - 1e-9);
      expect(f).toBeLessThanOrEqual(1);
    }
    expect(fHumidity(P, 0.7)).toBeCloseTo(0.8, 6);
  });

  it('a zero-length step, a zero-mass garden and NaN climate leave the record finite', () => {
    const g = garden();
    stepGarden(P, g, BASE, 0);
    expect(g.biomass).toBe(2);
    const z = garden({ biomass: 0, state: 'establishing' });
    stepGarden(P, z, { ...BASE, subIn1Gd: 5 }, DT);
    expect(Number.isFinite(z.biomass) && Number.isFinite(z.health)).toBe(true);
    expect(nextState(P, z)).toBe('dead');
    const n = garden();
    stepGarden(P, n, { ...BASE, tempC: NaN, rh: NaN, subIn1Gd: 3.6 }, DT);
    for (const v of [n.biomass, n.health, n.infection, n.contamination ?? 0, n.waste]) expect(Number.isFinite(v)).toBe(true);
  });

  it('contamination rises with retained waste (W > 0.2 G) and clears at 0.1 / GD once W <= 0.1 G', () => {
    const g = garden({ waste: 0.8 }); // W/G 0.4: dc = 0.05 x (0.4 - 0.2) / 0.2 = 0.05 per GD
    stepGarden(P, g, { ...BASE, subIn1Gd: 3.6 }, 1);
    expect(g.contamination).toBeCloseTo(0.05, 3);
    const c = garden({ waste: 0, contamination: 0.3 });
    stepGarden(P, c, { ...BASE, subIn1Gd: 3.6 }, 1);
    expect(c.contamination).toBeCloseTo(0.2, 3);
  });

  it('collapsing: G falls by 0.3 G per GD; the garden dies at G < 0.1 or h <= 0.05', () => {
    const g = garden({ state: 'collapsing', health: 0.15, biomass: 1 });
    stepGarden(P, g, { ...BASE, subIn1Gd: 1.8 }, DT);
    expect(g.biomass).toBeLessThan(1);
    const d = garden({ state: 'collapsing', health: 0.04, biomass: 1 });
    expect(nextState(P, d)).toBe('dead');
  });

  // RED (defect): states.ts nextState exempts `seeded` from the G < deadG rule, and starvation never lowers health,
  // so a seeded garden (the founding garden after hand-over stays `seeded` below 1 GU) starved of substrate shrinks
  // towards 0 and never dies: the colony never becomes garden-less (§6.4.9) and diag-garden never turns bad.
  it('a seeded garden starved of all substrate eventually dies (G < 0.1) instead of living on at ~0 GU', () => {
    const g = garden({ state: 'seeded', biomass: 0.6 });
    steps(g, 20, { subIn1Gd: 0, gardeners: 3 });
    expect(g.biomass).toBeLessThan(0.1);
    expect(g.state).toBe('dead');
  });

  // RED (defect / balance): the recovery rule needs "no toxin" (dynamics.ts: subT <= 1e-6), but LEAF_TRAITS give
  // every plant kind a toxin > 0 (herbage 0.05, the least defended). A garden fed only ordinary herbage at the ideal
  // climate never recovers any health, so every knock (a heat spell, an outbreak) is permanent in play.
  it('a garden fed ordinary herbage at 23 °C / RH 0.9 recovers health (GDD 07 §6.4.2 health recovery)', () => {
    const [q, p, t] = LEAF_TRAITS.herbage;
    const g = garden({ health: 0.7 });
    steps(g, 3, { subPerGu: 1.8, subQ: q, subP: p, subT: t });
    expect(g.health).toBeGreaterThan(0.85);
  });
});

describe('review: processing chain bottleneck (GDD 07 §6.4.6)', () => {
  const w = (o: Partial<Record<'cut' | 'carried' | 'processed' | 'planted' | 'harvested' | 'wasteOut' | 'demand', number>>) =>
    ({ cut: 0, carried: 0, processed: 0, planted: 0, harvested: 0, wasteOut: 0, demand: 0, ...o });

  it('names the first stage below its upstream by more than 30 %, the worst when several are short', () => {
    expect(narrowestStage(w({ demand: 10, cut: 10, carried: 10, processed: 10, planted: 2 }))).toBe('planted');
    expect(narrowestStage(w({ demand: 10, cut: 2, carried: 2, processed: 2, planted: 2 }))).toBe('cut');
    expect(narrowestStage(w({ demand: 10, cut: 10, carried: 5, processed: 1, planted: 1 }))).toBe('processed');
    expect(narrowestStage(w({ demand: 10, cut: 10, carried: 8, processed: 8, planted: 8 }))).toBe('');
    expect(narrowestStage(w({}))).toBe('');
    expect(narrowestStage(w({ demand: 10, cut: 10 }))).toBe('carried');
  });
});

describe('review: substrate ledger and cache (GDD 07 §6.4.1)', () => {
  it('subIn1Gd counts the last game day only; plant shares merge small suppliers into plant -1', () => {
    const g = garden();
    for (let i = 0; i < 8; i++) plantSubstrate(P, g, { q: 1, p: 0.1, t: 0, plantId: 100 + i }, 1, 0);
    const now = TICKS_PER_DAY / 2;
    expect(substrateOver(g, now, 1).lu).toBeCloseTo(8, 6);
    expect(substrateOver(g, 3 * TICKS_PER_DAY, 1).lu).toBeCloseTo(0, 6);
    expect(g.waste).toBeCloseTo(4, 6); // W += 0.5 x planted
    const shares = plantShares(g, now, 2);
    expect(shares.length).toBeLessThanOrEqual(5);
    expect(shares.reduce((a, s) => a + s.share, 0)).toBeLessThanOrEqual(1 + 1e-9);
    expect(plantSubstrate(P, g, { q: 1, p: 0, t: 0, plantId: 1 }, -3, 0)).toBe(0);
    expect(plantSubstrate(P, g, { q: 1, p: 0, t: 0, plantId: 1 }, NaN, 0)).toBe(0);
  });

  it('takeLots is first in, first out, merges traits by LU and returns null for nothing', () => {
    const lots = [{ lu: 1, q: 1, p: 0.1, t: 0, plantId: 1, tick: 0 }, { lu: 1, q: 0.5, p: 0.3, t: 0.4, plantId: 2, tick: 10 }];
    const got = takeLots(P, lots, 1.5, 20, false)!;
    expect(got.lu).toBeCloseTo(1.5, 9);
    expect(got.q).toBeCloseTo((1 + 0.25) / 1.5, 9);
    expect(lots.length).toBe(1);
    expect(lots[0].lu).toBeCloseTo(0.5, 9);
    expect(takeLots(P, [], 1, 0, false)).toBeNull();
    expect(takeLots(P, lots, 0, 0, false)).toBeNull();
  });
});

describe('review: colony scenarios (small test nest)', () => {
  it('App. E 24: the garden-less queen dies of starvation (cause checked) within 4 GD of the loss', () => {
    const k = attaKit({ G: 2 });
    const col = k.sim.state.colonies[0];
    const q = k.sim.stores.ants.get(col.queenId)!;
    if (q.queen) q.queen.founding = null;
    let cause = '';
    k.sim.events.on('ant-died', (e) => { if (e.antId === q.id) cause = e.cause; });
    k.garden.state = 'dead'; k.garden.waste += k.garden.biomass; k.garden.biomass = 0;
    run(k.sim, 4 * TICKS_PER_DAY + 50);
    expect(q.alive).toBe(false);
    expect(cause).toBe('starvation');
  }, 120_000);

  it('two fresh sims with the same seed run the fungus module identically (determinism)', () => {
    const mk = () => {
      const k = attaKit({ G: 1.2, seed: 2 });
      k.garden.supply = { luPerGd: 2.5, q: 0.8, p: 0.12, t: 0.05, plantId: 5 };
      addAnts(k, 'minor', 3, k.room, 'garden', 0.35);
      addAnts(k, 'media', 2, k.room, 'garden', 0.7);
      return k;
    };
    const a = mk(), b = mk();
    run(a.sim, 600); run(b.sim, 600);
    expect(JSON.stringify(b.sim.state.colonies[0].fungus)).toBe(JSON.stringify(a.sim.state.colonies[0].fungus));
  }, 120_000);

  // RED (defect): the first-brood deviation lets minims haul garden waste while no media gardens (chooseJob `big`),
  // and becomeRefuse then flags them REFUSE for life with half their remaining lifespan. GDD 07 §6.4.6 stage 8 gives
  // waste to small media and media only; in a minim-only colony (the first 8-14 workers) every hauling minim is lost
  // to gardening and feeding for good.
  it('minims gardening a planted garden in a colony without media are not turned into refuse workers', () => {
    const k = attaKit({ G: 1.5 });
    const col = k.sim.state.colonies[0];
    col.stores.c = 4; col.stores.p = 1;
    k.garden.supply = { luPerGd: 2.7, q: 0.9, p: 0.12, t: 0, plantId: 5 };
    k.garden.waste = 1; // spent substrate waiting (e.g. after weeding or a spoiled cache)
    const minims = addAnts(k, 'minor', 4, k.room, 'garden', 0.35);
    run(k.sim, TICKS_PER_DAY);
    const refuse = minims.filter((a) => (a.flags & AntFlag.REFUSE) !== 0).length;
    expect(refuse).toBe(0);
  }, 120_000);

  // RED (defect): GDD 07 §6.4.4: a refuse worker is "never again assigned garden or nurse". Nothing outside
  // behaviourGarden reads AntFlag.REFUSE, so the colony allocator makes refuse workers nurses and they feed larvae.
  it('refuse workers are never made nurses and never feed larvae', () => {
    const k = attaKit({ G: 1.5 });
    const col = k.sim.state.colonies[0];
    col.stores.c = 4; col.stores.p = 3;
    addLarvae(k, 8, k.room, 'minor');
    const refuse = addAnts(k, 'minor', 6, k.room, 'idle', 0.35);
    for (const a of refuse) a.flags |= AntFlag.REFUSE;
    const ids = new Set(refuse.map((a) => a.id));
    let nursing = 0, feeds = 0;
    k.sim.events.on('feed', (e) => { if (ids.has(e.giverId) && e.broodId >= 0) feeds++; });
    run(k.sim, Math.round(0.4 * TICKS_PER_DAY), () => { for (const a of refuse) if (a.alive && a.task === 'nurse') nursing++; });
    expect(nursing).toBe(0);
    expect(feeds).toBe(0);
  }, 120_000);

  // RED (defect): with no midden chamber and no open entrance, middenPoint is null and startDump puts the waste down
  // where the hauler stands, i.e. in the garden chamber. W has already been lowered, so contamination never sees it,
  // and nothing ever picks a `garden-waste` item up again (the report admits the second half).
  it('waste taken from a garden is not left lying in a fungus chamber when there is nowhere to dump it', () => {
    const k = attaKit({ G: 2 });
    const col = k.sim.state.colonies[0];
    col.stores.c = 4; col.stores.p = 1;
    k.nest.entrance.status = 'sealed';
    k.garden.waste = 3;
    addAnts(k, 'media', 3, k.room, 'garden', 0.7);
    // held shut (the core reopens it): a nest still closed after the hand-over, or closed by rain
    run(k.sim, Math.round(0.25 * TICKS_PER_DAY), () => { k.nest.entrance.status = 'sealed'; });
    const lying = k.sim.stores.items.list.filter((it) => it.alive && it.kind === 'garden-waste' && !isDisplayLump(it, col.id)
      && it.carrierIds.length === 0 && it.chamberId === k.room.id);
    const removed = 3 - k.garden.waste;
    expect(removed).toBeGreaterThan(0); // the haulers did take waste out of W
    expect(lying.length).toBe(0);
  }, 120_000);

  // RED (defect): tend-fungus check() honours the `secondary` variant (plant pulp / take waste), but durationS() and
  // effect() re-derive the mode with secondary = false, so an ant asked for "plant pulp" harvests instead.
  it('tend-fungus asked as the secondary (plant pulp) plants the pulp', () => {
    const k = attaKit({ G: 2 });
    const [ant] = addAnts(k, 'minor', 1, k.room, 'idle', 0.35);
    ant.bb[TEND_MODE] = 0;
    k.garden.pulp = [{ lu: 1, q: 1, p: 0.1, t: 0, plantId: 3, tick: k.sim.state.tick }];
    k.garden.yieldStanding = 0.5;
    const ok = begin(k.sim, ant, 'tend-fungus', null, { secondary: true });
    expect(ok).toBe(true);
    for (let i = 0; i < 400 && ant.action; i++) { k.sim.state.tick++; stepAction(k.sim, ant); }
    const pulpLeft = (k.garden.pulp ?? []).reduce((a, l) => a + l.lu, 0);
    expect(pulpLeft).toBeLessThan(1 - 1e-6);
  }, 60_000);

  // RED (minor): diag-garden reports `ok` for a `seeded` garden that is starving (fsub 0, shrinking); after hand-over
  // the founding garden stays `seeded` below 1 GU, so the player's only garden can starve with an ok status.
  it('diag-garden does not say ok for a seeded garden with no substrate', () => {
    const k = attaKit({ G: 0.6 });
    const col = k.sim.state.colonies[0];
    k.garden.state = 'seeded';
    k.garden.fsub = 0; k.garden.substrate = 0;
    const d = gardenDiag(k.sim, col, k.P);
    expect(d.status).not.toBe('ok');
  });
});
